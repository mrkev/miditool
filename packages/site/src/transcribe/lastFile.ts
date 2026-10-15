// Remembers the last opened audio file in IndexedDB, so it can be reopened
// after a page reload (including dev server reloads). localStorage can't
// hold files this large.

const DB_NAME = "miditool";
const STORE = "files";
const KEY = "transcribe:last";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/** Best-effort: storage may be unavailable or full */
export async function saveLastFile(file: File) {
  try {
    await run("readwrite", (store) => store.put(file, KEY));
  } catch (err) {
    console.warn("Couldn't remember the opened file", err);
  }
}

export async function loadLastFile(): Promise<File | null> {
  try {
    const file = await run<unknown>("readonly", (store) => store.get(KEY));
    return file instanceof File ? file : null;
  } catch {
    return null;
  }
}
