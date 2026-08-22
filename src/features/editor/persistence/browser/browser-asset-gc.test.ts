import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import { BrowserAssetGateway } from './browser-asset-gateway';
import {
  ASSET_RECORDS_STORE,
  DESIGN_RECORDS_STORE,
  openEditorDb,
  requestToPromise,
  transactionDone,
} from './editor-db';
import { EMERGENCY_DESIGN_PREFIX } from './emergency-design-store';

async function closeAndDelete(db: IDBDatabase) {
  const name = db.name;
  db.close();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function assetKeys(db: IDBDatabase): Promise<string[]> {
  const transaction = db.transaction(ASSET_RECORDS_STORE, 'readonly');
  const keys = await requestToPromise<IDBValidKey[]>(
    transaction.objectStore(ASSET_RECORDS_STORE).getAllKeys(),
  );
  await transactionDone(transaction);
  return keys.filter((key): key is string => typeof key === 'string').sort();
}

afterEach(() => {
  if (typeof localStorage !== 'undefined') {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(EMERGENCY_DESIGN_PREFIX)) localStorage.removeItem(key);
    }
  }
});

describe('BrowserAssetGateway garbageCollect', () => {
  it('현재/backup/미지원 버전/emergency/history 보호 asset은 남기고 grace가 지난 orphan만 삭제한다', async () => {
    const db = await openEditorDb(`birthday-canvas-gc-${crypto.randomUUID()}`);
    const ids = ['current', 'backup', 'future', 'emergency', 'history', 'orphan'];
    let index = 0;
    let now = 0;
    const gateway = new BrowserAssetGateway(db, {
      decoder: async () => ({ width: 640, height: 480 }),
      idGenerator: () => ids[index++],
      now: () => now,
    });

    for (const id of ids) {
      const asset = await gateway.upload(new File([id], `${id}.png`, { type: 'image/png' }));
      expect(asset.id).toBe(`asset:${id}`);
    }

    const designTransaction = db.transaction(DESIGN_RECORDS_STORE, 'readwrite');
    designTransaction.objectStore(DESIGN_RECORDS_STORE).put({
      cardId: 'protected-card',
      current: { nested: { assetId: 'asset:current' } },
      backup: { elements: [{ assetId: 'asset:backup' }] },
      updatedAt: 1,
    });
    designTransaction.objectStore(DESIGN_RECORDS_STORE).put({
      cardId: 'future-card',
      current: { version: 999, future: { assetId: 'asset:future' } },
      backup: null,
      updatedAt: 2,
    });
    await transactionDone(designTransaction);

    localStorage.setItem(`${EMERGENCY_DESIGN_PREFIX}emergency-card`, JSON.stringify({
      design: { anything: { assetId: 'asset:emergency' } },
      updatedAt: 3,
    }));

    now = 6 * 60 * 1_000;
    await gateway.garbageCollect(new Set(['asset:history']));

    expect(await assetKeys(db)).toEqual([
      'asset:backup',
      'asset:current',
      'asset:emergency',
      'asset:future',
      'asset:history',
    ]);
    await expect(gateway.resolveUrl('asset:orphan')).rejects.toThrow('존재하지 않는 Asset');

    gateway.dispose();
    await closeAndDelete(db);
  });

  it('명시적 보호 집합이 비어 있어도 다른 카드가 참조하는 asset은 제거하지 않는다', async () => {
    const db = await openEditorDb(`birthday-canvas-gc-cross-card-${crypto.randomUUID()}`);
    const gateway = new BrowserAssetGateway(db, {
      decoder: async () => ({ width: 640, height: 480 }),
      idGenerator: () => 'shared',
    });
    await gateway.upload(new File(['shared'], 'shared.png', { type: 'image/png' }));

    const transaction = db.transaction(DESIGN_RECORDS_STORE, 'readwrite');
    transaction.objectStore(DESIGN_RECORDS_STORE).put({
      cardId: 'other-card',
      current: { assetId: 'asset:shared' },
      backup: null,
      updatedAt: 1,
    });
    await transactionDone(transaction);

    await gateway.garbageCollect(new Set());

    expect(await assetKeys(db)).toEqual(['asset:shared']);
    gateway.dispose();
    await closeAndDelete(db);
  });
});
