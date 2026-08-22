import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { BrowserAssetGateway } from './browser-asset-gateway';
import { openEditorDb } from './editor-db';

async function closeAndDelete(db: IDBDatabase) {
  const name = db.name;
  db.close();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

describe('BrowserAssetGateway image dimension limits', () => {
  it.each([
    [{ width: 9000, height: 100 }, '한 변이 지나치게 큰 이미지'],
    [{ width: 8000, height: 5000 }, '총 픽셀 수가 지나치게 큰 이미지'],
  ])('%s를 저장 전에 거부한다', async (dimensions) => {
    const db = await openEditorDb(`birthday-canvas-dimensions-${crypto.randomUUID()}`);
    const gateway = new BrowserAssetGateway(db, { decoder: async () => dimensions });

    await expect(gateway.upload(new File(['png'], 'huge.png', { type: 'image/png' })))
      .rejects.toThrow('이미지 해상도가 너무 큽니다');

    gateway.dispose();
    await closeAndDelete(db);
  });

  it('안전한 해상도는 그대로 허용한다', async () => {
    const db = await openEditorDb(`birthday-canvas-dimensions-${crypto.randomUUID()}`);
    const gateway = new BrowserAssetGateway(db, {
      decoder: async () => ({ width: 4000, height: 3000 }),
    });

    await expect(gateway.upload(new File(['png'], 'safe.png', { type: 'image/png' })))
      .resolves.toMatchObject({ width: 4000, height: 3000 });

    gateway.dispose();
    await closeAndDelete(db);
  });
});
