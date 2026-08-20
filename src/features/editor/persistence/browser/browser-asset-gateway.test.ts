import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type AssetDimensionDecoder,
  BrowserAssetGateway,
} from './browser-asset-gateway';
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

function createGateway(
  db: IDBDatabase,
  options?: Partial<ConstructorParameters<typeof BrowserAssetGateway>[1]>,
) {
  const decoder: AssetDimensionDecoder = async () => ({ width: 640, height: 480 });
  return new BrowserAssetGateway(db, { decoder, ...options });
}

describe('BrowserAssetGateway', () => {
  it('번들 생일 사진을 네트워크 없이 정적 placeholder로 해석한다', async () => {
    const db = await openTestDb();
    const gateway = createGateway(db);

    await expect(gateway.resolveUrl('builtin:birthday-photo'))
      .resolves.toBe('/assets/birthday-placeholder.svg');
    gateway.dispose();
    await closeAndDelete(db);
  });

  it('PNG를 IndexedDB에 저장하고 영속 Asset ID만 반환한다', async () => {
    const db = await openTestDb();
    const gateway = createGateway(db);
    const file = new File(['png-content'], 'birthday.png', { type: 'image/png' });

    const asset = await gateway.upload(file);
    const transaction = db.transaction('asset-records', 'readonly');
    const record = await requestToPromise<{ id: string; bytes: ArrayBuffer }>(
      transaction.objectStore('asset-records').get(asset.id),
    );
    await transactionDone(transaction);

    expect(asset).toMatchObject({
      id: expect.stringMatching(/^asset:/),
      mimeType: 'image/png',
      width: 640,
      height: 480,
    });
    expect(new TextDecoder().decode(record.bytes)).toBe('png-content');
    gateway.dispose();
    await closeAndDelete(db);
  });

  it.each([
    [new File(['text'], 'note.txt', { type: 'text/plain' }), '지원하지 않는 이미지 형식'],
    [new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }), '10MiB'],
  ])('지원하지 않는 파일을 거부한다', async (file, message) => {
    const db = await openTestDb();
    const gateway = createGateway(db);

    await expect(gateway.upload(file)).rejects.toThrow(message);
    gateway.dispose();
    await closeAndDelete(db);
  });

  it('업로드 URL을 캐시하고 remove와 dispose에서 정확히 한 번 revoke한다', async () => {
    const db = await openTestDb();
    const gateway = createGateway(db);
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
    const gateway = createGateway(db);

    await expect(gateway.resolveUrl('asset:missing')).rejects.toThrow('존재하지 않는 Asset');
    await expect(gateway.remove('asset:missing')).rejects.toThrow('존재하지 않는 Asset');
    gateway.dispose();
    await closeAndDelete(db);
  });

  it('디코드 실패 또는 0 크기 이미지의 Blob은 저장하지 않는다', async () => {
    const db = await openTestDb();
    const failingGateway = createGateway(db, {
      decoder: async () => ({ width: 0, height: 480 }),
    });

    await expect(failingGateway.upload(new File(['png'], 'broken.png', { type: 'image/png' })))
      .rejects.toThrow('유효한 이미지 크기');
    const transaction = db.transaction('asset-records', 'readonly');
    const count = await requestToPromise<number>(transaction.objectStore('asset-records').count());
    await transactionDone(transaction);

    expect(count).toBe(0);
    failingGateway.dispose();
    await closeAndDelete(db);
  });

  it('정확히 10MiB PNG는 허용한다', async () => {
    const db = await openTestDb();
    const gateway = createGateway(db);

    await expect(gateway.upload(new File(
      [new Uint8Array(10 * 1024 * 1024)],
      'limit.png',
      { type: 'image/png' },
    ))).resolves.toMatchObject({ width: 640, height: 480 });

    gateway.dispose();
    await closeAndDelete(db);
  });

  it('동시에 같은 asset URL을 해석해도 하나의 object URL만 만들고 해제한다', async () => {
    const db = await openTestDb();
    const gateway = createGateway(db);
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:shared');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const asset = await gateway.upload(new File(['png'], 'birthday.png', { type: 'image/png' }));

    await expect(Promise.all([gateway.resolveUrl(asset.id), gateway.resolveUrl(asset.id)]))
      .resolves.toEqual(['blob:shared', 'blob:shared']);
    gateway.dispose();

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    await closeAndDelete(db);
  });

  it('URL 생성 중 dispose되면 늦게 생성된 URL도 즉시 해제하고 오류로 끝낸다', async () => {
    const db = await openTestDb();
    const gateway = createGateway(db);
    const asset = await gateway.upload(new File(['png'], 'birthday.png', { type: 'image/png' }));
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      gateway.dispose();
      return 'blob:late';
    });

    await expect(gateway.resolveUrl(asset.id)).rejects.toThrow('dispose');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:late');
    await closeAndDelete(db);
  });

  it('prototype 상의 이름은 기본 Asset이 아니라 존재하지 않는 Asset으로 처리한다', async () => {
    const db = await openTestDb();
    const gateway = createGateway(db);

    await expect(gateway.resolveUrl('toString')).rejects.toThrow('존재하지 않는 Asset');
    gateway.dispose();
    await closeAndDelete(db);
  });

  it('충돌한 asset ID는 기존 record를 덮어쓰지 않고 새 ID로 재시도한다', async () => {
    const db = await openTestDb();
    const initial = createGateway(db, { idGenerator: () => 'same' });
    const retrying = createGateway(db, {
      idGenerator: vi.fn().mockReturnValueOnce('same').mockReturnValueOnce('fresh'),
    });

    await initial.upload(new File(['first'], 'first.png', { type: 'image/png' }));
    await expect(retrying.upload(new File(['second'], 'second.png', { type: 'image/png' })))
      .resolves.toMatchObject({ id: 'asset:fresh' });

    initial.dispose();
    retrying.dispose();
    await closeAndDelete(db);
  });

  it('dispose 뒤 upload, URL 해석, remove는 모두 같은 수명 오류로 거부한다', async () => {
    const db = await openTestDb();
    const gateway = createGateway(db);
    gateway.dispose();

    await expect(gateway.upload(new File(['png'], 'birthday.png', { type: 'image/png' })))
      .rejects.toThrow('dispose');
    await expect(gateway.resolveUrl('asset:any')).rejects.toThrow('dispose');
    await expect(gateway.remove('asset:any')).rejects.toThrow('dispose');
    await closeAndDelete(db);
  });
});
