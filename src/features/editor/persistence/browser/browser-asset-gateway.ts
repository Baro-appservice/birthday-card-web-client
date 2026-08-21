import type { AssetGateway, AssetReference } from '@/features/editor/core/ports';

import {
  ASSET_RECORDS_STORE,
  requestToPromise,
  transactionDone,
} from './editor-db';

const BUILTIN_ASSETS = {
  'builtin:birthday-photo': '/assets/birthday-placeholder.svg',
} as const;

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ID_GENERATION_ATTEMPTS = 3;

export interface AssetDimensions {
  width: number;
  height: number;
}

export type AssetDimensionDecoder = (file: Blob) => Promise<AssetDimensions>;

export interface BrowserAssetGatewayOptions {
  decoder?: AssetDimensionDecoder;
  idGenerator?: () => string;
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

function isValidDimensions(dimensions: AssetDimensions): boolean {
  return Number.isFinite(dimensions.width)
    && Number.isFinite(dimensions.height)
    && dimensions.width > 0
    && dimensions.height > 0;
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

export class BrowserAssetGateway implements AssetGateway {
  private readonly objectUrls = new Map<string, string>();
  private readonly resolutionPromises = new Map<string, Promise<string>>();
  private readonly removalPromises = new Map<string, Promise<void>>();
  private readonly removedAssetIds = new Set<string>();
  private disposed = false;

  private readonly decoder: AssetDimensionDecoder;
  private readonly idGenerator: () => string;

  constructor(
    private readonly database: IDBDatabase,
    options: BrowserAssetGatewayOptions = {},
  ) {
    this.decoder = options.decoder ?? decodeImageDimensions;
    this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
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
    if (!isValidDimensions(dimensions)) {
      throw new Error('유효한 이미지 크기를 읽을 수 없습니다.');
    }
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

  private async removeUploadedAsset(assetId: string): Promise<void> {
    const transaction = this.writeTransaction();
    const store = transaction.objectStore(ASSET_RECORDS_STORE);
    const record = await requestToPromise<AssetRecord | undefined>(store.get(assetId));
    if (!record) {
      transaction.abort();
      await transactionDone(transaction).catch(() => undefined);
      throw new Error(`존재하지 않는 Asset입니다: ${assetId}`);
    }
    store.delete(assetId);
    await transactionDone(transaction);
    this.removedAssetIds.add(assetId);
    this.revoke(assetId);
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
        createdAt: Date.now(),
      } satisfies AssetRecord);
      try {
        await Promise.all([requestToPromise(request), transactionDone(transaction)]);
        return asset;
      } catch (error) {
        if (isConstraintError(error) && attempt + 1 < MAX_ID_GENERATION_ATTEMPTS) continue;
        throw error;
      }
    }
    throw new Error('고유한 Asset ID를 만들 수 없습니다.');
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
