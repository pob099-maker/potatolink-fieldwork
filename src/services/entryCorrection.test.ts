import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { dbGet, dbPut } from "../lib/localdb";
import { addEntry, listEntryLogs, listEvents, listMetrics, removeEntry, updateEntry } from "./store";

const BASE = {
  trialId: "11111111-1111-4111-8111-111111111111",
  siteId: null,
  armId: null,
  replicate: null,
  eventType: "field_record",
  enteredBy: "",
  deviceType: "mobile" as const,
};

async function anEntry() {
  const result = await addEntry({
    ...BASE,
    values: [
      { metricName: "tonnesHandled", value: 42, unit: "t", photoUrl: null },
      { metricName: "notes", value: "first pass", unit: "", photoUrl: null },
    ],
  });
  if (!result.success) throw new Error(result.error);
  return result.data;
}

describe("correcting an entry", () => {
  beforeEach(async () => {
    await dbPut("meta", { key: "deletions", items: [] });
  });

  it("replaces the answers rather than adding a second entry", async () => {
    const event = await anEntry();
    const before = (await listEvents()).length;

    const updated = await updateEntry(event.eventId, [
      { metricName: "tonnesHandled", value: 45.5, unit: "t", photoUrl: null },
      { metricName: "notes", value: "first pass", unit: "", photoUrl: null },
    ]);
    expect(updated.success).toBe(true);

    expect((await listEvents()).length).toBe(before);
    const values = (await listMetrics()).filter((m) => m.eventId === event.eventId);
    expect(values).toHaveLength(2);
    expect(values.find((m) => m.metricName === "tonnesHandled")?.value).toBe(45.5);
  });

  it("keeps the same metric row so the cloud copy is corrected, not duplicated", async () => {
    const event = await anEntry();
    const originalId = (await listMetrics()).find(
      (m) => m.eventId === event.eventId && m.metricName === "tonnesHandled",
    )?.metricId;

    await updateEntry(event.eventId, [
      { metricName: "tonnesHandled", value: 99, unit: "t", photoUrl: null },
    ]);

    const after = (await listMetrics()).filter((m) => m.eventId === event.eventId);
    expect(after).toHaveLength(1);
    expect(after[0].metricId).toBe(originalId);
  });

  it("deletes an answer the correction dropped, and queues the cloud delete", async () => {
    const event = await anEntry();
    const notesId = (await listMetrics()).find(
      (m) => m.eventId === event.eventId && m.metricName === "notes",
    )?.metricId;

    await updateEntry(event.eventId, [
      { metricName: "tonnesHandled", value: 42, unit: "t", photoUrl: null },
    ]);

    const remaining = (await listMetrics()).filter((m) => m.eventId === event.eventId);
    expect(remaining.map((m) => m.metricName)).toEqual(["tonnesHandled"]);

    const queue = await dbGet<{ key: string; items: Array<{ id: string }> }>("meta", "deletions");
    expect(queue?.items.map((item) => item.id)).toContain(notesId);
  });

  it("sends the entry back to pending so the correction reaches the cloud", async () => {
    const event = await anEntry();
    await dbPut("measurementEvents", { ...event, syncStatus: "synced" });

    const updated = await updateEntry(event.eventId, [
      { metricName: "tonnesHandled", value: 1, unit: "t", photoUrl: null },
    ]);
    expect(updated.success).toBe(true);
    if (!updated.success) return;
    expect(updated.data.syncStatus).toBe("pending");
    // The stamp is what stops a cloud pull undoing the correction (S-1).
    expect(updated.data.updatedAt).toBeTruthy();
  });

  it("refuses to correct an entry that is already gone", async () => {
    const result = await updateEntry("22222222-2222-4222-8222-222222222222", []);
    expect(result.success).toBe(false);
  });
});

describe("removing an entry", () => {
  beforeEach(async () => {
    await dbPut("meta", { key: "deletions", items: [] });
  });

  it("takes the metrics and the entry log with it", async () => {
    const event = await anEntry();

    const removed = await removeEntry(event.eventId);
    expect(removed.success).toBe(true);

    expect((await listEvents()).some((e) => e.eventId === event.eventId)).toBe(false);
    expect((await listMetrics()).some((m) => m.eventId === event.eventId)).toBe(false);
    expect((await listEntryLogs()).some((l) => l.eventId === event.eventId)).toBe(false);
  });

  it("queues the children before the entry so the foreign keys hold", async () => {
    const event = await anEntry();
    await removeEntry(event.eventId);

    const queue = await dbGet<{ key: string; items: Array<{ collection: string; id: string }> }>(
      "meta",
      "deletions",
    );
    const order = (queue?.items ?? []).map((item) => item.collection);
    expect(order[order.length - 1]).toBe("measurementEvents");
    expect(order).toContain("metrics");
    expect(order).toContain("dataEntryLogs");
  });
});
