// Minimal promise wrapper around IndexedDB. localStorage/sessionStorage are
// banned in this project (CLAUDE.md), so all offline state lives here.

export const COLLECTIONS = [
  "projects",
  "trials",
  "sites",
  "practiceArms",
  "armAssumptions",
  "measurementEvents",
  "metrics",
  "economicScenarios",
  "resultSets",
  "contacts",
  "adoptionFollowups",
  "formTemplates",
  "dataEntryLogs",
  "media",
  "meta",
] as const;

export type CollectionName = (typeof COLLECTIONS)[number];

const DB_NAME = "potatolink-fieldwork";
const DB_VERSION = 2;

const KEY_FIELDS: Record<string, string> = {
  projects: "projectId",
  trials: "trialId",
  sites: "siteId",
  practiceArms: "armId",
  armAssumptions: "assumptionId",
  measurementEvents: "eventId",
  metrics: "metricId",
  economicScenarios: "scenarioId",
  resultSets: "resultId",
  contacts: "contactId",
  adoptionFollowups: "followupId",
  formTemplates: "templateId",
  dataEntryLogs: "entryId",
  media: "mediaId",
  meta: "key",
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of COLLECTIONS) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: KEY_FIELDS[name] });
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    });
  }
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export async function dbGetAll<T>(collection: CollectionName): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(collection, "readonly");
  return requestToPromise(tx.objectStore(collection).getAll() as IDBRequest<T[]>);
}

export async function dbGet<T>(collection: CollectionName, key: string): Promise<T | undefined> {
  const db = await openDb();
  const tx = db.transaction(collection, "readonly");
  return requestToPromise(tx.objectStore(collection).get(key) as IDBRequest<T | undefined>);
}

export async function dbPut(collection: CollectionName, value: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(collection, "readwrite");
  tx.objectStore(collection).put(value);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB write aborted"));
  });
}

export async function dbPutMany(
  entries: Array<{ collection: CollectionName; value: unknown }>,
): Promise<void> {
  if (entries.length === 0) return;
  const db = await openDb();
  const names = [...new Set(entries.map((entry) => entry.collection))];
  const tx = db.transaction(names, "readwrite");
  for (const entry of entries) {
    tx.objectStore(entry.collection).put(entry.value);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB write aborted"));
  });
}
