import {
  migratePersistedDesign,
  prepareDesignForPersistence,
  type Design,
} from '@/entities/design';
import type { DesignLoadResult, DesignRepository } from '@/features/editor/core/ports';

import {
  DESIGN_RECORDS_STORE,
  requestToPromise,
  transactionDone,
} from './editor-db';

export interface DesignRecord {
  cardId: string;
  current: unknown;
  backup: unknown | null;
  updatedAt: number;
}

function cloneDesign(design: Design): Design {
  return structuredClone(design);
}

export class IndexedDbDesignRepository implements DesignRepository {
  constructor(private readonly database: IDBDatabase) {}

  async load(cardId: string): Promise<DesignLoadResult> {
    let transaction: IDBTransaction;
    try {
      transaction = this.database.transaction(DESIGN_RECORDS_STORE, 'readonly');
    } catch (error) {
      throw new Error('저장소를 읽을 수 없습니다.', { cause: error });
    }

    const record = await requestToPromise<DesignRecord | undefined>(
      transaction.objectStore(DESIGN_RECORDS_STORE).get(cardId),
    );
    await transactionDone(transaction);
    if (!record) return { status: 'empty' };

    const current = migratePersistedDesign(record.current);
    if (current.status === 'ok') {
      return {
        status: 'loaded',
        design: cloneDesign(current.design),
        updatedAt: record.updatedAt,
        needsSave: current.changed,
      };
    }

    const backup = migratePersistedDesign(record.backup);
    return {
      status: 'recoverable',
      reason: current.reason,
      backup: backup.status === 'ok' ? cloneDesign(backup.design) : null,
      updatedAt: record.updatedAt,
    };
  }

  async save(cardId: string, design: Design): Promise<void> {
    const current = prepareDesignForPersistence(design);
    let transaction: IDBTransaction;
    try {
      transaction = this.database.transaction(DESIGN_RECORDS_STORE, 'readwrite');
    } catch (error) {
      throw new Error('저장소를 쓸 수 없습니다.', { cause: error });
    }

    const store = transaction.objectStore(DESIGN_RECORDS_STORE);
    const previous = await requestToPromise<DesignRecord | undefined>(store.get(cardId));
    const previousCurrent = migratePersistedDesign(previous?.current);
    const previousBackup = migratePersistedDesign(previous?.backup);
    store.put({
      cardId,
      current,
      backup: previousCurrent.status === 'ok'
        ? cloneDesign(previousCurrent.design)
        : previousBackup.status === 'ok'
          ? cloneDesign(previousBackup.design)
          : null,
      updatedAt: Date.now(),
    } satisfies DesignRecord);
    await transactionDone(transaction);
  }
}
