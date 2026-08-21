export const EDITOR_DB_NAME = 'birthday-canvas';
export const EDITOR_DB_VERSION = 1;
export const DESIGN_RECORDS_STORE = 'design-records';
export const ASSET_RECORDS_STORE = 'asset-records';

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 요청에 실패했습니다.'));
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB 트랜잭션에 실패했습니다.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB 트랜잭션이 중단되었습니다.'));
  });
}

export function openEditorDb(name = EDITOR_DB_NAME): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    let settled = false;
    try {
      request = indexedDB.open(name, EDITOR_DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DESIGN_RECORDS_STORE)) {
        database.createObjectStore(DESIGN_RECORDS_STORE, { keyPath: 'cardId' });
      }
      if (!database.objectStoreNames.contains(ASSET_RECORDS_STORE)) {
        database.createObjectStore(ASSET_RECORDS_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      if (settled) {
        // A blocked request can later succeed after we already surfaced failure.
        // Close that otherwise-unowned connection immediately.
        request.result.close();
        return;
      }
      settled = true;
      resolve(request.result);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error ?? new Error('IndexedDB를 열 수 없습니다.'));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error('IndexedDB가 다른 탭에서 사용 중입니다.'));
    };
  });
}
