import { collectUnknownAssetIds } from '@/entities/design';
import type { AssetGateway, AssetReference } from '@/features/editor/core/ports';

import {
  ASSET_RECORDS_STORE,
  DESIGN_RECORDS_STORE,
  requestToPromise,
  transactionDone,
} from './editor-db';
import { EMERGENCY_DESIGN_PREFIX } from './emergency-design-store';

const BUILTIN_ASSETS = {
  'builtin:birthday-photo': '/assets/birthday-placeholder.svg',
} as const;

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 8192;
const MAX_IMAGE_PIXELS = 32_000_000;
const MAX_ID_GENERATION_ATTEMPTS = 3;
const ASSET_GC_GRACE_MS = 5 * 60 * 1_000;

export interface AssetDimensions {
  width: number;
  height: number;
}

export type AssetDimensionDecoder = (file: Blob) => Promise<AssetDimensions>;

export interface BrowserAssetGatewayOptions {
  decoder?: AssetDimensionDecoder;
  idGenerator?: () => string;
  now?: () => number;
}

function readFileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error('이미지 파일을 읽을 수 없습니다.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('이미지 파일을 읽을 수 없습니다.'));
    reader.onabort = () => reject(new Error('이미지 파일 읽기가 중단되었습니다.'));
    reader.readAsArrayBuffer(file);
  });
}

interface AssetRecord {
  id: string;
  bytes: ArrayBuffer;
  mimeType: string;
  width: number;
  height: number;
  createdAt: number;
}

interface RawDesignRecord {
  current?: unknown;
  backup?: unknown;
}

function isValidDimensions(dimensions: AssetDimensions): boolean {
  return Number.isFinite(dimensions.width)
    && Number.isFinite(dimensions.height)
    && dimensions.width > 0
    && dimensions.height > 0;
}

function assertSafeDimensions(dimensions: AssetDimensions): void {
  if (!isValidDimensions(dimensions)) {
    throw new Error('유효한 이미지 크기를 읽을 수 없습니다.');
  }
  if (
    dimensions.width > MAX_IMAGE_DIMENSION
    || dimensions.height > MAX_IMAGE_DIMENSION
    || dimensions.width * dimensions.height > MAX_IMAGE_PIXELS
  ) {
    throw new Error('이미지 해상도가 너무 큽니다. 최대 변 길이 8192px, 총 3200만 픽셀까지 지원합니다.');
  }
}

async function decodeImageDimensions(file: Blob): Promise<AssetDimensions> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      try {
        return { width: bitmap.width, height: bitmap.height };
      } finally {
        bitmap.close();
      }
    } catch (error) {
      throw new Error('이미지 파일을 디코딩할 수 없습니다.', { cause: error });
    }
  }

  return new Promise<AssetDimensions>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    image.onload = () => {
      cleanup();
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('이미지 파일을 디코딩할 수 없습니다.'));
    };
    image.src = objectUrl;
  });
}

function isConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error
    && error.name === 'ConstraintError';
}

function collectEmergencyAssetIds(target: Set<string>): void {
  if (typeof window === 'undefined') return;
  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    return;
  }

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(EMERGENCY_DESIGN_PREFIX)) continue;
    try {
      const raw = storage.getItem(key);
      if (raw) collectUnknownAssetIds(JSON.parse(raw), target);
    } catch {
      // Invalid recovery records are ignored by GC rather than making cleanup destructive.
    }
  }
}

export class BrowserAssetGateway implements AssetGateway {
  private readonly objectUrls = new Map<string, string>();
  private readonly resolutionPromises = new Map<string, Promise<string>>();
  private readonly removalPromises = new Map<string, Promise<void>>();
  private readonly removedAssetIds = new Set<string>();
  private disposed = false;

  private readonly decoder: AssetDimensionDecoder;
  private readonly idGenerator: () => string;
  private readonly now: () => number;

  constructor(
    private readonly database: IDBDatabase,
    options: BrowserAssetGatewayOptions = {},
  ) {
    this.decoder = options.decoder ?? decodeImageDimensions;
    this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
    this.now = options.now ?? Date.now;
  }

  async upload(file: File): Promise<AssetReference> {
    this.assertActive();
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      throw new Error('지원하지 않는 이미지 형식입니다. PNG, JPEG, WebP만 업로드할 수 있습니다.');
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new Error('이미지 파일은 최대 10MiB까지 업로드할 수 있습니다.');
    }

    const dimensions = await this.decoder(file);
    this.assertActive();
    assertSafeDimensions(dimensions);
    const bytes = await readFileBytes(file);
    this.assertActive();
    return this.persistAsset({
      mimeType: file.type,
      width: dimensions.width,
      height: dimensions.height,
      bytes,
    });
  }

  async resolveUrl(assetId: string): Promise<string> {
    this.assertActive();
    if (Object.hasOwn(BUILTIN_ASSETS, assetId)) {
      return BUILTIN_ASSETS[assetId as keyof typeof BUILTIN_ASSETS];
    }

    const cached = this.objectUrls.get(assetId);
    if (cached) return cached;
    const pendingResolution = this.resolutionPromises.get(assetId);
    if (pendingResolution) return pendingResolution;

    const resolution = this.resolveUploadedUrl(assetId);
    this.resolutionPromises.set(assetId, resolution);
    try {
      return await resolution;
    } finally {
      if (this.resolutionPromises.get(assetId) === resolution) {
        this.resolutionPromises.delete(assetId);
      }
    }
  }

  async remove(assetId: string): Promise<void> {
    this.assertActive();
    if (Object.hasOwn(BUILTIN_ASSETS, assetId)) {
      throw new Error(`기본 Asset은 제거할 수 없습니다: ${assetId}`);
    }
    if (this.removedAssetIds.has(assetId)) return;
    const pendingRemoval = this.removalPromises.get(assetId);
    if (pendingRemoval) return pendingRemoval;

    const removal = this.removeUploadedAsset(assetId);
    this.removalPromises.set(assetId, removal);
    try {
      await removal;
    } finally {
      if (this.removalPromises.get(assetId) === removal) {
        this.removalPromises.delete(assetId);
      }
    }
  }

  async garbageCollect(protectedAssetIds: ReadonlySet<string>): Promise<void> {
    this.assertActive();
    const referenced = new Set(protectedAssetIds);
    collectEmergencyAssetIds(referenced);
    const cutoff = this.now() - ASSET_GC_GRACE_MS;

    let transaction: IDBTransaction;
    try {
      transaction = this.database.transaction(
        [DESIGN_RECORDS_STORE, ASSET_RECORDS_STORE],
        'readwrite',
      );
    } catch (error) {
      throw new Error('Asset 정리용 저장소를 열 수 없습니다.', { cause: error });
    }

    const designStore = transaction.objectStore(DESIGN_RECORDS_STORE);
    const assetStore = transaction.objectStore(ASSET_RECORDS_STORE);
    const designRequest = designStore.getAll();
    const assetsRequest = assetStore.getAll();
    const deleted: string[] = [];
    let records: RawDesignRecord[] | null = null;
    let assets: AssetRecord[] | null = null;
    let processingError: { value: unknown } | null = null;
    let deletesQueued = false;

    const abortWith = (error: unknown) => {
      if (!processingError) processingError = { value: error };
      try { transaction.abort(); } catch { /* transaction may already be aborting */ }
    };

    const queueDeletesWhenReady = () => {
      if (deletesQueued || processingError || records === null || assets === null) return;
      deletesQueued = true;
      try {
        for (const record of records) {
          collectUnknownAssetIds(record.current, referenced);
          collectUnknownAssetIds(record.backup, referenced);
        }

        for (const asset of assets) {
          const assetId = asset.id;
          if (typeof assetId !== 'string') continue;
          // Another tab can persist an asset slightly before it connects that id
          // to Design/emergency state. Never collect a freshly-created record in
          // that vulnerable window. Missing/invalid timestamps are kept as the
          // conservative choice rather than risking destructive cleanup.
          if (!Number.isFinite(asset.createdAt) || asset.createdAt > cutoff) continue;
          if (
            referenced.has(assetId)
            || this.resolutionPromises.has(assetId)
            || this.removalPromises.has(assetId)
          ) continue;
          assetStore.delete(assetId);
          deleted.push(assetId);
        }
      } catch (error) {
        abortWith(error);
      }
    };

    // Queue dependent deletes from inside request success callbacks. Awaiting the
    // reads before issuing writes can make Safari/WebKit auto-commit the tx.
    designRequest.onsuccess = () => {
      records = designRequest.result as RawDesignRecord[];
      queueDeletesWhenReady();
    };
    assetsRequest.onsuccess = () => {
      assets = assetsRequest.result as AssetRecord[];
      queueDeletesWhenReady();
    };

    try {
      await transactionDone(transaction);
    } catch (error) {
      if (processingError) throw processingError.value;
      throw error;
    }
    if (processingError) throw processingError.value;

    for (const assetId of deleted) {
      this.removedAssetIds.add(assetId);
      this.revoke(assetId);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const [assetId] of this.objectUrls) this.revoke(assetId);
  }

  private readTransaction(): IDBTransaction {
    try {
      return this.database.transaction(ASSET_RECORDS_STORE, 'readonly');
    } catch (error) {
      throw new Error('Asset 저장소를 읽을 수 없습니다.', { cause: error });
    }
  }

  private writeTransaction(): IDBTransaction {
    try {
      return this.database.transaction(ASSET_RECORDS_STORE, 'readwrite');
    } catch (error) {
      throw new Error('Asset 저장소를 쓸 수 없습니다.', { cause: error });
    }
  }

  private async persistAsset(input: Omit<AssetRecord, 'id' | 'createdAt'>): Promise<AssetReference> {
    for (let attempt = 0; attempt < MAX_ID_GENERATION_ATTEMPTS; attempt += 1) {
      const asset: AssetReference = {
        id: `asset:${this.idGenerator()}`,
        mimeType: input.mimeType,
        width: input.width,
        height: input.height,
      };
      const transaction = this.writeTransaction();
      const request = transaction.objectStore(ASSET_RECORDS_STORE).add({
        ...asset,
        bytes: input.bytes.slice(0),
        createdAt: this.now(),
      } satisfies AssetRecord);
      try {
        await Promise.all([requestToPromise(request), transactionDone(transaction)]);
        this.removedAssetIds.delete(asset.id);
        return asset;
      } catch (error) {
        if (isConstraintError(error) && attempt + 1 < MAX_ID_GENERATION_ATTEMPTS) continue;
        throw error;
      }
    }
    throw new Error('고유한 Asset ID를 만들 수 없습니다.');
  }

  private async removeUploadedAsset(assetId: string): Promise<void> {
    const transaction = this.writeTransaction();
    const store = transaction.objectStore(ASSET_RECORDS_STORE);
    const request = store.get(assetId);
    let missing = false;
    let processingError: { value: unknown } | null = null;

    request.onsuccess = () => {
      if (!request.result) {
        missing = true;
        try { transaction.abort(); } catch { /* transaction may already be aborting */ }
        return;
      }
      try {
        store.delete(assetId);
      } catch (error) {
        processingError = { value: error };
        try { transaction.abort(); } catch { /* transaction may already be aborting */ }
      }
    };

    try {
      await transactionDone(transaction);
    } catch (error) {
      if (missing) throw new Error(`존재하지 않는 Asset입니다: ${assetId}`);
      if (processingError) throw processingError.value;
      throw error;
    }
    if (missing) throw new Error(`존재하지 않는 Asset입니다: ${assetId}`);
    if (processingError) throw processingError.value;

    this.removedAssetIds.add(assetId);
    this.revoke(assetId);
  }

  private async resolveUploadedUrl(assetId: string): Promise<string> {
    const transaction = this.readTransaction();
    const record = await requestToPromise<AssetRecord | undefined>(
      transaction.objectStore(ASSET_RECORDS_STORE).get(assetId),
    );
    await transactionDone(transaction);
    this.assertActive();
    if (this.removedAssetIds.has(assetId) || !record) {
      throw new Error(`존재하지 않는 Asset입니다: ${assetId}`);
    }

    const objectUrl = URL.createObjectURL(new Blob([record.bytes], { type: record.mimeType }));
    if (this.disposed || this.removedAssetIds.has(assetId)) {
      URL.revokeObjectURL(objectUrl);
      if (this.disposed) throw new Error('dispose된 AssetGateway는 사용할 수 없습니다.');
      throw new Error(`존재하지 않는 Asset입니다: ${assetId}`);
    }
    this.objectUrls.set(assetId, objectUrl);
    return objectUrl;
  }

  private revoke(assetId: string): void {
    const objectUrl = this.objectUrls.get(assetId);
    if (!objectUrl) return;
    this.objectUrls.delete(assetId);
    URL.revokeObjectURL(objectUrl);
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('dispose된 AssetGateway는 사용할 수 없습니다.');
  }
}
