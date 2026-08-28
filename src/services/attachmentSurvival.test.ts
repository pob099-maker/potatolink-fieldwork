import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { dbGetAll, dbPut } from "../lib/localdb";
import { addAttachment, removeAttachment, updateEntry } from "./store";
import type { MeasurementEvent, Metric } from "../types";

// The failure this guards against: somebody drives out, photographs an odd
// patch, then notices a typo in the weight and fixes it — and the photograph
// is gone, because updateEntry deletes any metric the form does not ask for.

const T0 = "2026-01-01T00:00:00.000Z";

async function makeEntry(eventId: string): Promise<MeasurementEvent> {
  const event = {
    eventId,
    trialId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    siteId: null,
    armId: null,
    replicate: null,
    plot: null,
    eventDate: T0,
    eventType: "field_record",
    enteredBy: "someone",
    syncStatus: "synced",
    createdAt: T0,
  } as MeasurementEvent;
  await dbPut("measurementEvents", event);
  await dbPut("metrics", {
    metricId: `${eventId}-w`,
    eventId,
    metricName: "weight",
    value: 40,
    unit: "kg",
    photoUrl: null,
    createdAt: T0,
  } as Metric);
  return event;
}

const metricsFor = async (eventId: string) =>
  (await dbGetAll<Metric>("metrics")).filter((m) => m.eventId === eventId);

describe("an attachment on an entry", () => {
  it("survives the entry being corrected", async () => {
    const id = "e0000000-0000-4000-8000-000000000001";
    await makeEntry(id);
    await addAttachment(id, "media:photo-1");

    // Fix the weight. The form asks for "weight" and nothing else.
    await updateEntry(id, [
      { metricName: "weight", value: 42, unit: "kg", photoUrl: null },
    ]);

    const after = await metricsFor(id);
    expect(after.find((m) => m.metricName === "weight")?.value).toBe(42);
    expect(after.some((m) => m.photoUrl === "media:photo-1")).toBe(true);
  });

  it("still removes an answer the form genuinely dropped", async () => {
    // The exception must not become a hole: a question that was removed from
    // the form should still take its answer with it.
    const id = "e0000000-0000-4000-8000-000000000002";
    await makeEntry(id);
    await dbPut("metrics", {
      metricId: `${id}-old`,
      eventId: id,
      metricName: "retiredQuestion",
      value: "x",
      unit: "",
      photoUrl: null,
      createdAt: T0,
    } as Metric);

    await updateEntry(id, [
      { metricName: "weight", value: 41, unit: "kg", photoUrl: null },
    ]);

    const names = (await metricsFor(id)).map((m) => m.metricName);
    expect(names).not.toContain("retiredQuestion");
  });

  it("numbers a second attachment without colliding", async () => {
    const id = "e0000000-0000-4000-8000-000000000003";
    await makeEntry(id);
    await addAttachment(id, "media:a");
    await addAttachment(id, "media:b");
    const names = (await metricsFor(id)).map((m) => m.metricName).sort();
    expect(names).toContain("extra:1");
    expect(names).toContain("extra:2");
  });

  it("puts the entry back to pending so the photo reaches the cloud", async () => {
    // Attaching to an already-synced record must re-queue it, or the picture
    // sits on the phone behind a record the app believes is finished.
    const id = "e0000000-0000-4000-8000-000000000004";
    await makeEntry(id);
    await addAttachment(id, "media:c");
    const event = (await dbGetAll<MeasurementEvent>("measurementEvents")).find(
      (e) => e.eventId === id,
    );
    expect(event?.syncStatus).toBe("pending");
  });

  it("can be taken off again", async () => {
    const id = "e0000000-0000-4000-8000-000000000005";
    await makeEntry(id);
    const added = await addAttachment(id, "media:d");
    expect(added.success).toBe(true);
    if (!added.success) return;
    await removeAttachment(added.data.metricId);
    expect((await metricsFor(id)).some((m) => m.photoUrl === "media:d")).toBe(false);
  });

  it("refuses to remove one of the form's own answers", async () => {
    const id = "e0000000-0000-4000-8000-000000000006";
    await makeEntry(id);
    const result = await removeAttachment(`${id}-w`);
    expect(result.success).toBe(false);
    expect((await metricsFor(id)).some((m) => m.metricName === "weight")).toBe(true);
  });
});
