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

export class BrowserAssetGateway implements AssetGateway {
  private readonly objectUrls = new Map<string, string>();
  private readonly removedAssetIds = new Set<string>();
  private disposed = false;

  constructor(private readonly database: IDBDatabase) {}

  async upload(file: File): Promise<AssetReference> {
    this.assertActive();
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      throw new Error('지원하지 않는 이미지 형식입니다. PNG, JPEG, WebP만 업로드할 수 있습니다.');
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new Error('이미지 파일은 최대 10MiB까지 업로드할 수 있습니다.');
    }

    const asset: AssetReference = {
      id: `asset:${crypto.randomUUID()}`,
      mimeType: file.type,
      width: 0,
      height: 0,
    };
    const record: AssetRecord = {
      ...asset,
      bytes: await readFileBytes(file),
      createdAt: Date.now(),
    };
    const transaction = this.writeTransaction();
    transaction.objectStore(ASSET_RECORDS_STORE).put(record);
    await transactionDone(transaction);
    return asset;
  }

  async resolveUrl(assetId: string): Promise<string> {
    this.assertActive();
    const builtin = BUILTIN_ASSETS[assetId as keyof typeof BUILTIN_ASSETS];
    if (builtin) return builtin;

    const cached = this.objectUrls.get(assetId);
    if (cached) return cached;

    const transaction = this.readTransaction();
    const record = await requestToPromise<AssetRecord | undefined>(
      transaction.objectStore(ASSET_RECORDS_STORE).get(assetId),
    );
    await transactionDone(transaction);
    if (!record) throw new Error(`존재하지 않는 Asset입니다: ${assetId}`);

    const objectUrl = URL.createObjectURL(new Blob([record.bytes], { type: record.mimeType }));
    this.objectUrls.set(assetId, objectUrl);
    return objectUrl;
  }

  async remove(assetId: string): Promise<void> {
    this.assertActive();
    if (assetId in BUILTIN_ASSETS) {
      throw new Error(`기본 Asset은 제거할 수 없습니다: ${assetId}`);
    }
    if (this.removedAssetIds.has(assetId)) return;

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
