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
    expect(template?.fields).toHaveLength(9);
    expect(template?.fields.some((field) => field.type === "video")).toBe(true);
  });

  it("gives the HarvestEye trial staff forms for every protocol stage", async () => {
    const templates = await listTemplates();
    const heForms = templates.filter((candidate) => candidate.trialId === SEED_IDS.heTrial);
    const staff = heForms.filter((form) => form.audience === "staff");

    expect(heForms.filter((form) => form.audience === "grower")).toHaveLength(1);
    expect(staff.map((form) => form.eventType).sort()).toEqual([
      "calibration",
      "cost_log",
      "install_log",
      "observer_feedback",
      "portal_output",
      "site_setup",
      "weather",
    ]);

    // A cost log describes the whole trial, so it attaches to neither a site
    // nor a practice; weather belongs to a site but not to a practice.
    const costLog = staff.find((form) => form.eventType === "cost_log");
    expect(costLog?.requiresSite).toBe(false);
    expect(costLog?.requiresArm).toBe(false);
    const weather = staff.find((form) => form.eventType === "weather");
    expect(weather?.requiresSite).toBe(true);
    expect(weather?.requiresArm).toBe(false);
  });

  it("records a staff entry with no site or arm", async () => {
    const result = await addEntry({
      siteId: null,
      armId: null,
      eventType: "cost_log",
      enteredBy: SEED_IDS.contactStaff,
      deviceType: "desktop",
      values: [{ metricName: "leaseCost", value: 12000, unit: "$", photoUrl: null }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.siteId).toBeNull();
    expect(result.data.armId).toBeNull();
    expect(result.data.eventType).toBe("cost_log");
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
