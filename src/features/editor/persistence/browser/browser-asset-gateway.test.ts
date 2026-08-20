import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { BrowserAssetGateway } from './browser-asset-gateway';
import { openEditorDb, requestToPromise, transactionDone } from './editor-db';

function openTestDb() {
  return openEditorDb(`birthday-canvas-assets-${crypto.randomUUID()}`);
}

async function closeAndDelete(db: IDBDatabase) {
  const name = db.name;
  db.close();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

afterEach(() => vi.restoreAllMocks());

describe('BrowserAssetGateway', () => {
  it('번들 생일 사진을 네트워크 없이 정적 placeholder로 해석한다', async () => {
    const db = await openTestDb();
    const gateway = new BrowserAssetGateway(db);

    await expect(gateway.resolveUrl('builtin:birthday-photo'))
      .resolves.toBe('/assets/birthday-placeholder.svg');
    gateway.dispose();
    await closeAndDelete(db);
  });

  it('PNG를 IndexedDB에 저장하고 영속 Asset ID만 반환한다', async () => {
    const db = await openTestDb();
    const gateway = new BrowserAssetGateway(db);
    const file = new File(['png-content'], 'birthday.png', { type: 'image/png' });

    const asset = await gateway.upload(file);
    const transaction = db.transaction('asset-records', 'readonly');
    const record = await requestToPromise<{ id: string; bytes: ArrayBuffer }>(
      transaction.objectStore('asset-records').get(asset.id),
    );
    await transactionDone(transaction);

    expect(asset).toMatchObject({ id: expect.stringMatching(/^asset:/), mimeType: 'image/png' });
    expect(new TextDecoder().decode(record.bytes)).toBe('png-content');
    gateway.dispose();
    await closeAndDelete(db);
  });

  it.each([
    [new File(['text'], 'note.txt', { type: 'text/plain' }), '지원하지 않는 이미지 형식'],
    [new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }), '10MiB'],
  ])('지원하지 않는 파일을 거부한다', async (file, message) => {
    const db = await openTestDb();
    const gateway = new BrowserAssetGateway(db);

    await expect(gateway.upload(file)).rejects.toThrow(message);
    gateway.dispose();
    await closeAndDelete(db);
  });

  it('업로드 URL을 캐시하고 remove와 dispose에서 정확히 한 번 revoke한다', async () => {
    const db = await openTestDb();
    const gateway = new BrowserAssetGateway(db);
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:asset-url');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const asset = await gateway.upload(new File(['png'], 'birthday.png', { type: 'image/png' }));

    await expect(gateway.resolveUrl(asset.id)).resolves.toBe('blob:asset-url');
    await expect(gateway.resolveUrl(asset.id)).resolves.toBe('blob:asset-url');
    expect(createObjectURL).toHaveBeenCalledOnce();
    await gateway.remove(asset.id);
    await gateway.remove(asset.id);
    gateway.dispose();

    expect(revokeObjectURL).toHaveBeenCalledOnce();
    await closeAndDelete(db);
  });

  it('존재하지 않는 사용자 asset 제거와 URL 해석은 오류로 알린다', async () => {
    const db = await openTestDb();
    const gateway = new BrowserAssetGateway(db);

    await expect(gateway.resolveUrl('asset:missing')).rejects.toThrow('존재하지 않는 Asset');
    await expect(gateway.remove('asset:missing')).rejects.toThrow('존재하지 않는 Asset');
    gateway.dispose();
    await closeAndDelete(db);
  });
});
