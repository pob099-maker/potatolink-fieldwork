import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { dbGet, dbPut } from "../lib/localdb";
import {
  addArm,
  addEntry,
  addSite,
  addTrial,
  listArms,
  listSites,
  listTemplates,
  listTrials,
  removeTrial,
  trialHasData,
} from "./store";

describe("removing a trial", () => {
  beforeEach(async () => {
    await dbPut("meta", { key: "deletions", items: [] });
  });

  async function aTrial(name: string) {
    const result = await addTrial({ projectId: "p1", name, objective: "" });
    if (!result.success) throw new Error(result.error);
    return result.data;
  }

  it("takes the sites, practices and forms with it", async () => {
    const trial = await aTrial("Empty trial");
    await addSite({ trialId: trial.trialId, location: "Gatton", region: "Qld", soilType: "" });
    await addArm({ trialId: trial.trialId, name: "Alternative", type: "alternative" });

    const removed = await removeTrial(trial);
    expect(removed.success).toBe(true);

    expect((await listTrials()).some((t) => t.trialId === trial.trialId)).toBe(false);
    expect((await listSites()).some((s) => s.trialId === trial.trialId)).toBe(false);
    expect((await listArms()).some((a) => a.trialId === trial.trialId)).toBe(false);
    // addTrial creates a starter form, so this proves the cascade reaches it.
    expect((await listTemplates()).some((f) => f.trialId === trial.trialId)).toBe(false);
  });

  it("refuses when anything has been recorded against it", async () => {
    const trial = await aTrial("Trial with data");
    const site = await addSite({
      trialId: trial.trialId, location: "Walkers Flat", region: "SA", soilType: "",
    });
    if (!site.success) throw new Error(site.error);
    await addEntry({
      trialId: trial.trialId,
      siteId: site.data.siteId,
      armId: null,
      replicate: null,
      eventType: "field_record",
      enteredBy: "",
      deviceType: "mobile",
      values: [{ metricName: "tonnesHandled", value: 12, unit: "t", photoUrl: null }],
    });

    expect(await trialHasData(trial.trialId)).toBe(true);
    const removed = await removeTrial(trial);
    expect(removed.success).toBe(false);
    // Still there — field data is never destroyed by this path.
    expect((await listTrials()).some((t) => t.trialId === trial.trialId)).toBe(true);
  });

  it("notices data filed against the trial's site even with no trialId on the event", async () => {
    // Older records carry no trialId and are resolved through their site. If
    // that were missed, the guard would let their trial be deleted.
    const trial = await aTrial("Legacy shaped");
    const site = await addSite({
      trialId: trial.trialId, location: "Tasmania", region: "Tas", soilType: "",
    });
    if (!site.success) throw new Error(site.error);
    const entry = await addEntry({
      trialId: trial.trialId, siteId: site.data.siteId, armId: null, replicate: null,
      eventType: "field_record", enteredBy: "", deviceType: "mobile",
      values: [{ metricName: "notes", value: "x", unit: "", photoUrl: null }],
    });
    if (!entry.success) throw new Error(entry.error);
    await dbPut("measurementEvents", { ...entry.data, trialId: null });

    expect(await trialHasData(trial.trialId)).toBe(true);
  });

  it("queues the cloud deletions, children before the trial", async () => {
    const trial = await aTrial("Queue order");
    await addSite({ trialId: trial.trialId, location: "Cowra", region: "NSW", soilType: "" });
    await removeTrial(trial);

    const queue = await dbGet<{ key: string; items: Array<{ collection: string }> }>(
      "meta",
      "deletions",
    );
    const order = (queue?.items ?? []).map((i) => i.collection);
    expect(order).toContain("sites");
    expect(order[order.length - 1]).toBe("trials");
  });
});

describe("the deletion queue under concurrency", () => {
  it("keeps deletions that arrive while a drain is in flight", async () => {
    // drainDeletions used to read the queue, spend time on the network, then
    // write its stale snapshot back — wiping anything enqueued in between.
    // Removing several trials in a row hit it every time, and the deletions
    // vanished silently: the queue emptied and the rows stayed in the cloud.
    await dbPut("meta", { key: "deletions", items: [] });

    const first = await addTrial({ projectId: "p1", name: "First", objective: "" });
    const second = await addTrial({ projectId: "p1", name: "Second", objective: "" });
    if (!first.success || !second.success) throw new Error("setup failed");

    await removeTrial(first.data);
    const afterFirst = await dbGet<{ key: string; items: unknown[] }>("meta", "deletions");
    const countAfterFirst = afterFirst?.items.length ?? 0;

    await removeTrial(second.data);
    const afterSecond = await dbGet<{ key: string; items: unknown[] }>("meta", "deletions");

    // Both removals are represented; the second did not overwrite the first.
    expect(countAfterFirst).toBeGreaterThan(0);
    expect(afterSecond?.items.length ?? 0).toBeGreaterThan(countAfterFirst);
  });
});
