import 'fake-indexeddb/auto';

import { createSampleDesign } from '@/entities/design';
import type { Design } from '@/entities/design';

import {
  type DesignRecord,
  IndexedDbDesignRepository,
} from './indexeddb-design-repository';
import {
  openEditorDb,
  requestToPromise,
  transactionDone,
} from './editor-db';

function openTestDb() {
  return openEditorDb(`birthday-canvas-test-${crypto.randomUUID()}`);
}

async function replaceCurrent(
  db: IDBDatabase,
  cardId: string,
  current: unknown,
  backup?: unknown | null,
) {
  const transaction = db.transaction('design-records', 'readwrite');
  const store = transaction.objectStore('design-records');
  const request = store.get(cardId);
  request.onsuccess = () => {
    const record = request.result as DesignRecord;
    store.put({ ...record, current, ...(backup === undefined ? {} : { backup }) });
  };
  await transactionDone(transaction);
}

function legacyV1FromCurrent(design: Design) {
  return {
    ...structuredClone(design),
    version: 1,
    pages: design.pages.map((page) => ({
      ...structuredClone(page),
      elements: page.elements.map((element) => {
        if (element.type !== 'image') return structuredClone(element);
        return {
          id: element.id,
          type: element.type,
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
          rotation: element.rotation,
          opacity: element.opacity,
          assetId: element.assetId,
        };
      }),
    })),
  };
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

describe('IndexedDbDesignRepository', () => {
  it('유효한 v1 current를 v3로 migrate하고 재저장이 필요하다고 표시한다', async () => {
    const db = await openTestDb();
    const repository = new IndexedDbDesignRepository(db);
    const current = createSampleDesign();
    await repository.save('local-demo', current);
    await replaceCurrent(db, 'local-demo', legacyV1FromCurrent(current));

    const result = await repository.load('local-demo');

    expect(result).toMatchObject({ status: 'loaded', needsSave: true });
    if (result.status !== 'loaded') throw new Error('v1 current를 불러오지 못했습니다.');
    expect(result.design.version).toBe(3);
    expect(result.design.pages[0].elements.find((element) => element.id === 'photo'))
      .toMatchObject({ cropZoom: 1, cropX: 0, cropY: 0 });
    expect(result.updatedAt).toEqual(expect.any(Number));
    await closeAndDelete(db);
  });

  it('두 번째 저장 뒤 current가 손상되면 직전 정상 문서를 backup으로 제시한다', async () => {
    const db = await openTestDb();
    const repository = new IndexedDbDesignRepository(db);
    const first = createSampleDesign();
    const second: Design = {
      ...first,
      pages: [{ ...first.pages[0], background: '#ffffff' }],
    };

    await repository.save('local-demo', first);
    await repository.save('local-demo', second);
    await replaceCurrent(db, 'local-demo', {
      version: 1,
      width: 'broken',
      height: 1350,
      pages: [],
    });

    await expect(repository.load('local-demo')).resolves.toMatchObject({
      status: 'recoverable',
      reason: 'corrupt',
      backup: first,
      updatedAt: expect.any(Number),
    });
    await closeAndDelete(db);
  });

  it('지원하지 않는 current 버전은 정상 backup과 함께 복구 대상으로 구분한다', async () => {
    const db = await openTestDb();
    const repository = new IndexedDbDesignRepository(db);
    const first = createSampleDesign();
    const second: Design = {
      ...first,
      pages: [{ ...first.pages[0], background: '#ffffff' }],
    };

    await repository.save('local-demo', first);
    await repository.save('local-demo', second);
    await replaceCurrent(db, 'local-demo', { version: 999 });

    await expect(repository.load('local-demo')).resolves.toMatchObject({
      status: 'recoverable',
      reason: 'unsupported-version',
      backup: first,
      updatedAt: expect.any(Number),
    });
    await closeAndDelete(db);
  });

  it('페이지가 비어 있는 current는 손상으로 분류하고 직전 정상 backup을 보존한다', async () => {
    const db = await openTestDb();
    const repository = new IndexedDbDesignRepository(db);
    const stable = createSampleDesign();

    await repository.save('local-demo', stable);
    await repository.save('local-demo', {
      ...stable,
      pages: [{ ...stable.pages[0], background: '#ffffff' }],
    });
    await replaceCurrent(db, 'local-demo', {
      version: 1,
      width: 1080,
      height: 1350,
      pages: [],
    });

    await expect(repository.load('local-demo')).resolves.toMatchObject({
      status: 'recoverable',
      reason: 'corrupt',
      backup: stable,
      updatedAt: expect.any(Number),
    });
    await closeAndDelete(db);
  });

  it('손상된 backup은 recoverable 결과에 포함하지 않는다', async () => {
    const db = await openTestDb();
    const repository = new IndexedDbDesignRepository(db);
    const design = createSampleDesign();

    await repository.save('local-demo', design);
    await repository.save('local-demo', {
      ...design,
      pages: [{ ...design.pages[0], background: '#ffffff' }],
    });
    await replaceCurrent(db, 'local-demo', { version: 999 }, { version: 1 });

    await expect(repository.load('local-demo')).resolves.toMatchObject({
      status: 'recoverable',
      reason: 'unsupported-version',
      backup: null,
      updatedAt: expect.any(Number),
    });
    await closeAndDelete(db);
  });

  it('손상 current와 정상 backup이 있는 상태에서 저장해도 정상 backup을 보존한다', async () => {
    const db = await openTestDb();
    const repository = new IndexedDbDesignRepository(db);
    const stable = createSampleDesign();
    const current = {
      ...stable,
      pages: [{ ...stable.pages[0], background: '#ffffff' }],
    };
    const next = {
      ...stable,
      pages: [{ ...stable.pages[0], background: '#111111' }],
    };

    await repository.save('local-demo', stable);
    await repository.save('local-demo', current);
    await replaceCurrent(db, 'local-demo', { version: 999 });
    await repository.save('local-demo', next);
    await replaceCurrent(db, 'local-demo', { version: 999 });

    await expect(repository.load('local-demo')).resolves.toMatchObject({
      status: 'recoverable',
      reason: 'unsupported-version',
      backup: stable,
      updatedAt: expect.any(Number),
    });
    await closeAndDelete(db);
  });

  it('저장 전에 Design 스키마를 검증해 잘못된 문서를 쓰지 않는다', async () => {
    const db = await openTestDb();
    const repository = new IndexedDbDesignRepository(db);

    await expect(repository.save('local-demo', {
      ...createSampleDesign(),
      width: 100,
    } as unknown as Design)).rejects.toThrow();
    await expect(repository.load('local-demo')).resolves.toEqual({ status: 'empty' });
    await closeAndDelete(db);
  });
});
