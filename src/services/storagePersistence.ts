// Asking the browser not to throw the paddock away.
//
// Everything this app records goes into IndexedDB first and syncs afterwards,
// which is the whole design: a paddock has no signal, so the phone has to be
// the safe place until it does. What was never asked is whether the browser
// agrees.
//
// By default it does not. Storage is "best effort", and a browser is free to
// evict it when the device runs low on space. Android is more willing to than
// iOS. So the failure this guards against is: a grower fills a paddock's worth
// of entries with no reception, the phone is nearly full of photographs, the
// browser reclaims the space, and the entries are gone — silently, because
// nothing was ever told.
//
// One call fixes it. Chrome decides from heuristics and usually grants it
// without a prompt once the app has been added to the home screen; Safari
// grants it on being added too. Neither is guaranteed, which is why the answer
// is reported rather than assumed.
//
// The StorageManager is passed in rather than reached for, so the decisions
// here can be tested without a browser.

export type PersistenceState = "persisted" | "best-effort" | "unsupported";

export interface StorageReport {
  state: PersistenceState;
  /** Bytes in use, when the browser will say. */
  usage: number | null;
  /** Bytes it will allow, when the browser will say. */
  quota: number | null;
}

/**
 * The subset actually used. Typed structurally so a test can hand over an
 * object rather than a browser.
 */
export interface StorageLike {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
}

/**
 * Ask for durable storage, unless it has already been granted.
 *
 * Checked first because a granted permission does not need asking for again,
 * and because some browsers count a repeated request against the heuristics
 * that decide it.
 *
 * Never throws. This runs at startup, and a browser that does not implement
 * the API — or refuses mid-call — must not be able to stop the app loading.
 * Rule 27's reasoning applies: nothing in the boot path is allowed to leave an
 * unsettled promise behind it.
 */
export async function requestPersistence(
  storage: StorageLike | undefined,
): Promise<PersistenceState> {
  if (!storage || typeof storage.persisted !== "function") return "unsupported";
  try {
    if (await storage.persisted()) return "persisted";
    if (typeof storage.persist !== "function") return "unsupported";
    return (await storage.persist()) ? "persisted" : "best-effort";
  } catch {
    // A browser that refuses to answer is one that will not promise anything,
    // which is best-effort by another name.
    return "best-effort";
  }
}

/** What is being used, and of how much. Null where the browser will not say. */
export async function storageReport(
  storage: StorageLike | undefined,
): Promise<StorageReport> {
  const state = await currentState(storage);
  if (!storage || typeof storage.estimate !== "function") {
    return { state, usage: null, quota: null };
  }
  try {
    const estimate = await storage.estimate();
    return {
      state,
      usage: typeof estimate.usage === "number" ? estimate.usage : null,
      quota: typeof estimate.quota === "number" ? estimate.quota : null,
    };
  } catch {
    return { state, usage: null, quota: null };
  }
}

/** The state as it stands, without asking for anything. */
async function currentState(storage: StorageLike | undefined): Promise<PersistenceState> {
  if (!storage || typeof storage.persisted !== "function") return "unsupported";
  try {
    return (await storage.persisted()) ? "persisted" : "best-effort";
  } catch {
    return "best-effort";
  }
}

const UNITS = ["B", "kB", "MB", "GB"] as const;

/** A size somebody can read, rather than a number of bytes. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return "—";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
}

/**
 * What to tell somebody, in the terms they care about — which is whether their
 * data is safe, not what an API returned.
 */
export function describePersistence(state: PersistenceState): {
  heading: string;
  detail: string;
  reassuring: boolean;
} {
  if (state === "persisted") {
    return {
      heading: "Entries are safe on this device",
      detail:
        "This browser has promised to keep them, even when storage runs low. They stay until they have synced.",
      reassuring: true,
    };
  }
  if (state === "best-effort") {
    return {
      heading: "Entries could be cleared if this device runs out of space",
      detail:
        "The browser has not promised to keep them. Adding Fieldwork to the home screen usually earns that promise. Until then, sync when you get signal rather than leaving days of entries on the phone.",
      reassuring: false,
    };
  }
  return {
    heading: "This browser will not say whether entries are safe",
    detail:
      "An older browser that does not support the check. Entries are still saved here and still sync; just do not leave a lot of them unsent.",
    reassuring: false,
  };
}
