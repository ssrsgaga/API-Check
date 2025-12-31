import { RequestLog } from '../types';

const DB_NAME = 'OmniProbeDB';
const DB_VERSION = 1;
const STORE_NAME = 'logs';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('apiId', 'apiId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

export const saveLog = async (log: RequestLog): Promise<void> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.add(log);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('Failed to save log to IndexedDB', error);
  }
};

export const getLogs = async (limit: number = 1000, offset: number = 0): Promise<RequestLog[]> => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index('timestamp');

  return new Promise((resolve, reject) => {
    const request = index.openCursor(null, 'prev'); // Latest first
    const results: RequestLog[] = [];
    let hasSkipped = false;
    let skippedCount = 0;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;
      if (cursor) {
        if (!hasSkipped && skippedCount < offset) {
          skippedCount++;
          cursor.continue();
          return;
        }
        hasSkipped = true;
        
        results.push(cursor.value);
        if (results.length < limit) {
          cursor.continue();
        } else {
          resolve(results);
        }
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
};

export const clearLogs = async (): Promise<void> => {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
    });
};

export const getLogsStats = async (): Promise<{total: number, success: number, error: number, avgLatency: number}> => {
    // Basic stats calculation (scanning mostly recent entries for performance in pure frontend)
    // For a real production app, we might maintain separate counters.
    const logs = await getLogs(500); // Analyze last 500 requests for dashboard trends
    if (logs.length === 0) return { total: 0, success: 0, error: 0, avgLatency: 0 };

    let success = 0;
    let error = 0;
    let totalLatency = 0;

    logs.forEach(l => {
        if (l.status >= 200 && l.status < 300) success++;
        else error++;
        totalLatency += l.latency;
    });

    return {
        total: logs.length,
        success,
        error,
        avgLatency: Math.round(totalLatency / logs.length)
    };
};
