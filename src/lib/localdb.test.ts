import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { COLLECTIONS, LocalDatabaseError, dbGetAll, dbPut } from "./localdb";

// The bug these pin down took the deployed app to a blank page.
//
// Bumping DB_VERSION to add three stores is routine. What was not routine was
// the failure mode: `indexedDB.open` fires no event at all while it waits for
// another tab's connection to close — no success, no error — and openDb had no
// onblocked handler and no timeout, so the promise never settled. main.tsx
// rendered only after seeding resolved, so the whole app was replaced by
// nothing, with no message and nothing in the console.
//
// Three things had to be true for that, and all three are now false:
//   a blocked upgrade is detected rather than silent;
//   a connection yields when another tab wants to upgrade, instead of being
//   the thing that blocks it;
//   the app renders whether or not the local database cooperated.

describe("the local database", () => {
  it("creates a store for every collection", async () => {
    // A missing store is not a subtle failure: every read against it throws.
    for (const name of COLLECTIONS) {
      await expect(dbGetAll(name)).resolves.toBeInstanceOf(Array);
    }
  });

  it("round-trips a record", async () => {
    await dbPut("meta", { key: "probe", value: 1 });
    const rows = await dbGetAll<{ key: string; value: number }>("meta");
    expect(rows.find((row) => row.key === "probe")?.value).toBe(1);
  });

  it("exports an error type that says whether another tab is the cause", () => {
    // The remedy differs: a blocked upgrade needs the other tab closed, and
    // nobody guesses that from a spinner.
    const blocked = new LocalDatabaseError("held open elsewhere", true);
    const other = new LocalDatabaseError("something else", false);

    expect(blocked).toBeInstanceOf(Error);
    expect(blocked.blocked).toBe(true);
    expect(other.blocked).toBe(false);
    expect(blocked.name).toBe("LocalDatabaseError");
  });
});
