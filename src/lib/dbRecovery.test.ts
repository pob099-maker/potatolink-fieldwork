import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A version bump must not need somebody to close tabs.
//
// The upgrade waits for every other connection to the old version. On a
// desktop that is a second tab somebody can be told to close. On a phone it
// may be the app installed *and* open in a browser tab, neither of which is
// visible, and a backgrounded tab is suspended rather than closed — so it does
// not run the onversionchange handler that would release its connection. It
// just sits there holding the old version until the operating system wakes or
// evicts it, which is usually seconds away.
//
// A single-shot open gives up inside that window and puts an error in front of
// somebody standing in a paddock. Waiting it out gets to the same place
// without asking them to debug anything.

const DB_NAME = "potatolink-fieldwork";

async function openAt(version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("probe")) {
        db.createObjectStore("probe", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
});

describe("opening while another copy holds the old version", () => {
  it("recovers by itself once the other connection goes", async () => {
    // A stale connection that does NOT yield — the suspended-phone-tab case.
    // Deliberately no onversionchange handler: that is the whole problem.
    const stale = await openAt(1);

    const { dbGetAll } = await import("./localdb");

    // The upgrade to the app's version is blocked while `stale` is open.
    const opening = dbGetAll("trials");

    // The other copy is evicted a moment later, as an operating system does.
    setTimeout(() => stale.close(), 1500);

    await expect(opening).resolves.toBeDefined();
  }, 20000);

  it("does not give up at the first blocked attempt", async () => {
    // The bug this replaces: one attempt, an 8-second timeout, and an error
    // screen — while the blocking tab was about to disappear anyway.
    const stale = await openAt(1);
    const { dbGetAll } = await import("./localdb");

    const started = Date.now();
    const opening = dbGetAll("trials");
    setTimeout(() => stale.close(), 3000);

    await expect(opening).resolves.toBeDefined();
    // It waited rather than failing fast.
    expect(Date.now() - started).toBeGreaterThan(2000);
  }, 20000);

  it("opens immediately when nothing is in the way", async () => {
    const { dbGetAll } = await import("./localdb");
    const started = Date.now();
    await expect(dbGetAll("trials")).resolves.toBeDefined();
    expect(Date.now() - started).toBeLessThan(2000);
  }, 20000);
});

describe("yielding to a newer version", () => {
  it("closes its own connection rather than blocking somebody else", async () => {
    // The other half of the same problem: this copy must not be the one that
    // stops the next version from ever starting.
    const { dbGetAll } = await import("./localdb");
    await dbGetAll("trials");

    // Something else asks for a higher version. If the handler did not fire
    // and close, this open would block for ever.
    const newer = await new Promise<IDBDatabase | "blocked">((resolve) => {
      const request = indexedDB.open(DB_NAME, 99);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("later")) {
          db.createObjectStore("later", { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onblocked = () => resolve("blocked");
      request.onerror = () => resolve("blocked");
    });

    expect(newer).not.toBe("blocked");
    if (newer !== "blocked") newer.close();
  }, 20000);
});
