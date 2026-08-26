import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { dbGetAll, dbPut, dbPutMany } from "../lib/localdb";
import { retryFailedEntries, waitingToSync } from "./store";
import type { MeasurementEvent } from "../types";

// The failure path had no tests at all — 491 of them, and not one touched what
// happens when the cloud says no. That is how sixteen refused entries sat
// behind a green "waiting to send" banner for a day without anything noticing.

const T0 = "2026-01-01T00:00:00.000Z";
const TRIAL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const event = (id: string, syncStatus: MeasurementEvent["syncStatus"]): MeasurementEvent =>
  ({
    eventId: id,
    trialId: TRIAL,
    siteId: null,
    armId: null,
    replicate: null,
    plot: null,
    eventDate: T0,
    eventType: "field_record",
    enteredBy: "someone",
    syncStatus,
    createdAt: T0,
  }) as MeasurementEvent;

async function clearEvents() {
  const existing = await dbGetAll<MeasurementEvent>("measurementEvents");
  await dbPutMany(
    existing
      .filter((e) => e.trialId === TRIAL)
      .map((e) => ({
        collection: "measurementEvents" as const,
        value: { ...e, trialId: "gone", syncStatus: "synced" as const },
      })),
  );
}

beforeEach(async () => {
  await clearEvents();
});

describe("what the device reports as outstanding", () => {
  // waitingToSync is a property of the whole device, seeded demo data
  // included, so these measure the change this test caused rather than an
  // absolute — which is also the honest way to describe what the count means.
  it("does not count a refusal as something that is on its way", async () => {
    const before = await waitingToSync();
    await dbPutMany([
      { collection: "measurementEvents", value: event("11111111-1111-4111-8111-111111111101", "pending") },
      { collection: "measurementEvents", value: event("11111111-1111-4111-8111-111111111102", "error") },
      { collection: "measurementEvents", value: event("11111111-1111-4111-8111-111111111103", "error") },
      { collection: "measurementEvents", value: event("11111111-1111-4111-8111-111111111104", "synced") },
    ]);

    const after = await waitingToSync();
    expect(after.pending - before.pending).toBe(1);
    expect(after.failed - before.failed).toBe(2);
  });

  it("counts a synced entry as neither waiting nor refused", async () => {
    const before = await waitingToSync();
    await dbPut("measurementEvents", event("11111111-1111-4111-8111-111111111105", "synced"));
    const after = await waitingToSync();
    expect(after.pending).toBe(before.pending);
    expect(after.failed).toBe(before.failed);
  });
});

describe("trying a refused entry again", () => {
  it("puts it back in the queue rather than leaving it stuck", async () => {
    // The point of the button: a refusal usually has a cause outside the app —
    // a migration not yet run, a policy that says no. Once that is fixed the
    // records must be reachable without re-entering them.
    const id = "22222222-2222-4222-8222-222222222201";
    await dbPut("measurementEvents", event(id, "error"));

    await retryFailedEntries();

    const stored = (await dbGetAll<MeasurementEvent>("measurementEvents")).find(
      (e) => e.eventId === id,
    );
    expect(stored?.syncStatus).toBe("pending");
  });

  it("never destroys the record it could not send", async () => {
    // The one good thing about this failure mode is that the data is still
    // here. Nothing in the retry path is allowed to change that.
    const id = "22222222-2222-4222-8222-222222222202";
    await dbPut("measurementEvents", event(id, "error"));
    await retryFailedEntries();
    const all = await dbGetAll<MeasurementEvent>("measurementEvents");
    expect(all.some((e) => e.eventId === id)).toBe(true);
  });

  it("does not claim an entry went up when it only went back to pending", async () => {
    // With no cloud configured, syncPending is a no-op — so every retried
    // record ends as "pending", not "synced". Counting "no longer an error"
    // would report all of them as sent. It counts arrivals by id instead.
    await dbPutMany(
      ["22222222-2222-4222-8222-222222222203", "22222222-2222-4222-8222-222222222204"].map((id) => ({
        collection: "measurementEvents" as const,
        value: event(id, "error"),
      })),
    );

    const result = await retryFailedEntries();
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(0);
  });

  it("is a no-op when nothing was refused", async () => {
    await dbPut("measurementEvents", event("22222222-2222-4222-8222-222222222205", "synced"));
    const result = await retryFailedEntries();
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(0);
  });

  it("leaves a merely pending entry alone", async () => {
    // Pending records are already going up by themselves. Sweeping them into a
    // manual retry would re-push the whole device every time somebody taps it.
    const id = "22222222-2222-4222-8222-222222222206";
    await dbPut("measurementEvents", event(id, "pending"));
    await retryFailedEntries();
    const stored = (await dbGetAll<MeasurementEvent>("measurementEvents")).find(
      (e) => e.eventId === id,
    );
    expect(stored?.syncStatus).toBe("pending");
  });
});
