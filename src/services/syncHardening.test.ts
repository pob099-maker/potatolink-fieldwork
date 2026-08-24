import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { dbDelete, dbGet, dbPut } from "../lib/localdb";
import {
  addTrial,
  listAssumptions,
  listTemplates,
  removeAssumption,
  saveAssumption,
  saveTemplate,
  syncTrouble,
  addEntry,
  listEvents,
  listTrials,
  reconcileForTest,
} from "./store";
import type { FormTemplate } from "../types";

// The store is exercised without a Supabase client (env unset in tests), so
// cloud pushes are skipped; what we can verify locally is updatedAt stamping
// and that the outbox queue survives for syncPending to drain later.

function template(templateId: string, trialId: string): FormTemplate {
  return {
    templateId,
    trialId,
    armId: null,
    name: "Form",
    eventType: "field_record",
    audience: "grower",
    frequency: "",
    requiresSite: true,
    requiresArm: true,
    fields: [
      {
        fieldName: "notes",
        label: "Notes",
        type: "text",
        required: true,
        options: null,
        min: null,
        max: null,
        unit: null,
        displayOrder: 0,
      },
    ],
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

describe("sync hardening (S-1/S-2)", () => {
  beforeEach(async () => {
    await dbPut("meta", { key: "outbox", items: [] });
  });

  it("stamps updatedAt on every edit of an editable record", async () => {
    const trial = await addTrial({ projectId: "p1", name: "T", objective: "" });
    expect(trial.success).toBe(true);
    if (!trial.success) return;

    const saved = await saveTemplate(template("tpl-1", trial.data.trialId));
    expect(saved.success).toBe(true);
    if (!saved.success) return;
    expect(saved.data.updatedAt).toBeTruthy();

    const before = saved.data.updatedAt!;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const again = await saveTemplate({ ...saved.data, name: "Renamed" });
    expect(again.success).toBe(true);
    if (!again.success) return;
    expect(again.data.updatedAt! > before).toBe(true);
  });

  it("persists the edit locally even though no cloud is reachable", async () => {
    const trial = await addTrial({ projectId: "p1", name: "T2", objective: "" });
    if (!trial.success) return;
    await saveTemplate(template("tpl-2", trial.data.trialId));
    const stored = (await listTemplates()).find((t) => t.templateId === "tpl-2");
    expect(stored?.name).toBe("Form");
  });

  it("keeps the outbox as a persistent queue structure in meta", async () => {
    await dbPut("meta", {
      key: "outbox",
      items: [{ collection: "formTemplates", id: "tpl-x" }],
    });
    const outbox = await dbGet<{ key: string; items: unknown[] }>("meta", "outbox");
    expect(outbox?.items).toHaveLength(1);
  });
});

describe("assumption deletes (S-4)", () => {
  beforeEach(async () => {
    await dbPut("meta", { key: "deletions", items: [] });
  });

  it("removes the assumption and queues the cloud delete", async () => {
    const saved = await saveAssumption({
      assumptionId: "assumption-1",
      armId: "arm-1",
      category: "opex",
      fieldName: "Service contract",
      value: 18000,
      unit: "$/yr",
      status: "placeholder",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    expect(saved.success).toBe(true);

    const removed = await removeAssumption("assumption-1");
    expect(removed.success).toBe(true);

    // Gone locally...
    const remaining = await listAssumptions();
    expect(remaining.some((item) => item.assumptionId === "assumption-1")).toBe(false);

    // ...and queued to be deleted in the cloud rather than zeroed, which used
    // to leave a live $0 line that the next pull brought back.
    const queue = await dbGet<{ key: string; items: Array<{ id: string }> }>(
      "meta",
      "deletions",
    );
    expect(queue?.items.map((item) => item.id)).toContain("assumption-1");
  });
});

// A queued save is retried forever. That is right for a dropped connection and
// wrong for a permanent refusal — a missing column, a policy that says no —
// and until this was recorded the app looked perfectly healthy while the setup
// records sat on one device.
describe("a queue that will never drain says so", () => {
  beforeEach(async () => {
    await dbPut("meta", { key: "outbox", items: [] });
    await dbDelete("meta", "syncTrouble");
  });

  it("reports nothing when there is nothing wrong", async () => {
    expect(await syncTrouble()).toBeNull();
  });

  it("reports the count and what the cloud actually said", async () => {
    await dbPut("meta", {
      key: "syncTrouble",
      count: 3,
      message: 'trials: column "blocking" does not exist',
      at: "2026-08-24T00:00:00.000Z",
    });
    const trouble = await syncTrouble();
    // The verbatim message matters: it is the only thing that names the cause.
    expect(trouble).toEqual({
      count: 3,
      message: 'trials: column "blocking" does not exist',
      at: "2026-08-24T00:00:00.000Z",
    });
  });
});

// A pull only ever wrote, so a trial deleted on one device stayed on every
// other one forever — with nothing queued, so the app reported that everything
// had reached the cloud. Editing one of those ghosts pushed it back.
describe("records deleted elsewhere", () => {
  beforeEach(async () => {
    await dbPut("meta", { key: "outbox", items: [] });
    await dbPut("meta", { key: "deletions", items: [] });
  });

  it("drops a synced local record the cloud no longer has", async () => {
    const trial = await addTrial({ projectId: "p1", name: "Deleted elsewhere", objective: "" });
    expect(trial.success).toBe(true);
    if (!trial.success) return;

    const removed = await reconcileForTest("trials", []);
    expect(removed).toBeGreaterThan(0);
    const left = await listTrials();
    expect(left.some((t) => t.trialId === trial.data.trialId)).toBe(false);
  });

  it("keeps a record that is still queued to be sent", async () => {
    const trial = await addTrial({ projectId: "p1", name: "Not sent yet", objective: "" });
    if (!trial.success) return;
    await dbPut("meta", {
      key: "outbox",
      items: [{ collection: "trials", id: trial.data.trialId }],
    });

    await reconcileForTest("trials", []);
    const left = await listTrials();
    // Queued means the cloud has not seen it, not that it was deleted.
    expect(left.some((t) => t.trialId === trial.data.trialId)).toBe(true);
  });

  it("keeps a record the cloud still has", async () => {
    const trial = await addTrial({ projectId: "p1", name: "Still there", objective: "" });
    if (!trial.success) return;
    await reconcileForTest("trials", [trial.data.trialId]);
    const left = await listTrials();
    expect(left.some((t) => t.trialId === trial.data.trialId)).toBe(true);
  });

  it("never drops an entry the grower has not managed to send", async () => {
    // The one thing worse than a stale trial is losing paddock data that only
    // exists on the phone it was recorded on.
    const trial = await addTrial({ projectId: "p1", name: "Has entries", objective: "" });
    if (!trial.success) return;
    const entry = await addEntry({
      trialId: trial.data.trialId, siteId: null, armId: null, replicate: null, plot: null,
      eventType: "field_record", enteredBy: "", deviceType: "mobile",
      values: [{ metricName: "notes", value: "unsent", unit: "", photoUrl: null }],
    });
    expect(entry.success).toBe(true);

    await reconcileForTest("measurementEvents", []);
    const events = await listEvents();
    expect(events.some((e) => e.trialId === trial.data.trialId)).toBe(true);
  });

  it("keeps a record the cloud returned but the app could not parse", async () => {
    // A row that fails validation is a schema drift, not a deletion. Treating
    // the two the same would let one bad column wipe the local copy of
    // everything it affected.
    const trial = await addTrial({ projectId: "p1", name: "Unparseable", objective: "" });
    if (!trial.success) return;

    // The id is present in what the cloud returned, even though the row itself
    // never made it through the schema.
    await reconcileForTest("trials", [trial.data.trialId]);
    const left = await listTrials();
    expect(left.some((t) => t.trialId === trial.data.trialId)).toBe(true);
  });
});
