import { designSchema, type Design } from '@/entities/design';
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

function recoveryReason(current: unknown): 'corrupt' | 'unsupported-version' {
  if (
    typeof current === 'object'
    && current !== null
    && 'version' in current
    && typeof current.version === 'number'
    && current.version !== 1
  ) {
    return 'unsupported-version';
  }
  return 'corrupt';
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

    const current = designSchema.safeParse(record.current);
    if (current.success) {
      return { status: 'loaded', design: cloneDesign(current.data) };
    }

    const backup = designSchema.safeParse(record.backup);
    return {
      status: 'recoverable',
      reason: recoveryReason(record.current),
      backup: backup.success ? cloneDesign(backup.data) : null,
    };
  }

  async save(cardId: string, design: Design): Promise<void> {
    const parsed = designSchema.parse(design);
    const current = cloneDesign(parsed);
    let transaction: IDBTransaction;
    try {
      transaction = this.database.transaction(DESIGN_RECORDS_STORE, 'readwrite');
    } catch (error) {
      throw new Error('저장소를 쓸 수 없습니다.', { cause: error });
    }

    const store = transaction.objectStore(DESIGN_RECORDS_STORE);
    const previous = await requestToPromise<DesignRecord | undefined>(store.get(cardId));
    const previousCurrent = designSchema.safeParse(previous?.current);
    const previousBackup = designSchema.safeParse(previous?.backup);
    store.put({
      cardId,
      current,
      backup: previousCurrent.success
        ? cloneDesign(previousCurrent.data)
        : previousBackup.success
          ? cloneDesign(previousBackup.data)
          : null,
      updatedAt: Date.now(),
    } satisfies DesignRecord);
    await transactionDone(transaction);
  }
}
