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
  "weatherObservations",
  "soilSamples",
  "soilResults",
  "measurementLibrary",
  "factors",
  "factorLevels",
  "trialMembers",
  "media",
  "meta",
] as const;

export type CollectionName = (typeof COLLECTIONS)[number];

const DB_NAME = "potatolink-fieldwork";
// Bumped for the weather and soil stores; onupgradeneeded creates any
// object store the list has gained.
const DB_VERSION = 6;

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
  weatherObservations: "observationId",
  soilSamples: "sampleId",
  soilResults: "resultId",
  measurementLibrary: "entryId",
  trialMembers: "memberId",
  factors: "factorId",
  factorLevels: "levelId",
  media: "mediaId",
  meta: "key",
};

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * How long to wait for a blocked upgrade before giving up.
 *
 * A version change waits for every other connection to close, and a tab left
 * open in another window will never close on its own. Waiting forever is the
 * one outcome that must not happen, because the caller cannot tell a slow
 * database from a stopped one.
 */
const OPEN_TIMEOUT_MS = 8000;

/** Raised when the local database cannot be opened, with something to do about it. */
export class LocalDatabaseError extends Error {
  readonly blocked: boolean;
  constructor(message: string, blocked: boolean) {
    super(message);
    this.name = "LocalDatabaseError";
    this.blocked = blocked;
  }
}

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      let blocked = false;
      let settled = false;

      const finish = (run: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        run();
      };

      const timer = setTimeout(() => {
        finish(() =>
          reject(
            new LocalDatabaseError(
              blocked
                ? "Another copy of Fieldwork is open and holding the local database open at an older version. Close the other tabs or windows, then reload."
                : "The local database did not open. Reload the page, and if that does not help, close every Fieldwork tab and try again.",
              blocked,
            ),
          ),
        );
      }, OPEN_TIMEOUT_MS);

      // Fires when this upgrade is waiting on another tab's connection. Without
      // it a blocked upgrade produces no event at all: no success, no error,
      // just silence — and a caller that awaits it waits for the rest of the
      // session. This is the whole reason a version bump could blank the app.
      request.onblocked = () => {
        blocked = true;
      };

      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of COLLECTIONS) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: KEY_FIELDS[name] });
          }
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        // Yield to a newer version rather than becoming the tab that blocks
        // it. A page left open in a background window would otherwise stop
        // every other copy of the app from ever upgrading — which is exactly
        // how one stale tab turns a deploy into a blank screen for somebody
        // else.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        finish(() => resolve(db));
      };

      request.onerror = () =>
        finish(() =>
          reject(new LocalDatabaseError(String(request.error ?? "IndexedDB open failed"), false)),
        );
    }).catch((error: unknown) => {
      // Let the next call try again rather than caching the failure forever;
      // the usual fix is closing another tab, which can happen at any moment.
      dbPromise = null;
      throw error;
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

export async function dbDelete(collection: CollectionName, key: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(collection, "readwrite");
  tx.objectStore(collection).delete(key);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB delete aborted"));
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
