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
  const record = await requestToPromise<DesignRecord>(store.get(cardId));
  store.put({ ...record, current, ...(backup === undefined ? {} : { backup }) });
  await transactionDone(transaction);
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

    await expect(repository.load('local-demo')).resolves.toEqual({
      status: 'recoverable',
      reason: 'corrupt',
      backup: first,
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

    await expect(repository.load('local-demo')).resolves.toEqual({
      status: 'recoverable',
      reason: 'unsupported-version',
      backup: first,
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

    await expect(repository.load('local-demo')).resolves.toEqual({
      status: 'recoverable',
      reason: 'unsupported-version',
      backup: null,
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
