import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { seedIfNeeded, SEED_IDS } from "./seed";
import { addEntry, listEvents, listMetrics, listTemplates, listTrials } from "./store";

beforeAll(async () => {
  await seedIfNeeded();
});

describe("seed", () => {
  it("creates the CropVision trial with its form template", async () => {
    const trials = await listTrials();
    expect(trials.map((trial) => trial.trialId)).toContain(SEED_IDS.trial);

    const templates = await listTemplates();
    const template = templates.find((candidate) => candidate.trialId === SEED_IDS.trial);
    expect(template).toBeDefined();
    expect(template?.fields).toHaveLength(8);
  });

  it("is idempotent", async () => {
    await seedIfNeeded();
    const trials = await listTrials();
    expect(trials.filter((trial) => trial.trialId === SEED_IDS.trial)).toHaveLength(1);
  });
});

describe("addEntry", () => {
  it("saves an event, its metrics, and an entry log as pending", async () => {
    const result = await addEntry({
      siteId: SEED_IDS.siteWalkersFlat,
      armId: SEED_IDS.armControl,
      eventType: "field_record",
      enteredBy: SEED_IDS.contactGrower,
      deviceType: "mobile",
      values: [
        { metricName: "tonnesHandled", value: 42.5, unit: "t", photoUrl: null },
        { metricName: "runWentAsPlanned", value: "true", unit: "", photoUrl: null },
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const events = await listEvents();
    const saved = events.find((event) => event.eventId === result.data.eventId);
    expect(saved?.syncStatus).toBe("pending");

    const metrics = await listMetrics();
    const savedMetrics = metrics.filter((metric) => metric.eventId === result.data.eventId);
    expect(savedMetrics).toHaveLength(2);
    expect(savedMetrics.map((metric) => metric.metricName)).toContain("tonnesHandled");
  });
});
