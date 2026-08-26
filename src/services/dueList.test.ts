import { describe, expect, it } from "vitest";
import { buildDueList, todayIso } from "./dueList";
import type { FormTemplate, MeasurementEvent, Site, Trial } from "../types";

const T0 = "2026-01-01T00:00:00.000Z";

const trial = (overrides: Partial<Trial> = {}): Trial =>
  ({
    trialId: "trial-1",
    projectId: "p",
    name: "Nitrogen trial",
    objective: "",
    status: "active",
    design: "replicated",
    replicates: 3,
    blocking: "blocks",
    vocabulary: null,
    plotLengthM: null,
    plotWidthM: null,
    dataSources: [],
    layoutSeed: null,
    responseMetric: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  }) as Trial;

const site = (overrides: Partial<Site> = {}): Site => ({
  siteId: "site-1",
  trialId: "trial-1",
  contactId: "c1",
  location: "Mallee block",
  region: "",
  soilType: "",
  coordinates: null,
  plantingDate: "2026-09-01",
  stageDates: {},
  createdAt: T0,
  ...overrides,
});

const template = (overrides: Partial<FormTemplate> = {}): FormTemplate =>
  ({
    templateId: "tpl-1",
    trialId: "trial-1",
    armId: null,
    name: "Plot yield record",
    eventType: "field_record",
    audience: "grower",
    frequency: "",
    timing: { stage: "tuberInitiation", dapFrom: null, dapTo: null },
    requiresSite: true,
    requiresArm: true,
    fields: [],
    createdAt: T0,
    ...overrides,
  }) as FormTemplate;

const event = (overrides: Partial<MeasurementEvent> = {}): MeasurementEvent =>
  ({
    eventId: "e1",
    trialId: "trial-1",
    siteId: "site-1",
    armId: null,
    replicate: null,
    plot: null,
    eventDate: "2026-10-08",
    eventType: "field_record",
    enteredBy: "someone",
    syncStatus: "synced",
    createdAt: T0,
    ...overrides,
  }) as MeasurementEvent;

const build = (over: Partial<Parameters<typeof buildDueList>[0]> = {}) =>
  buildDueList({
    trials: [trial()],
    sites: [site()],
    templates: [template()],
    events: [],
    today: "2026-10-10",
    ...over,
  });

describe("buildDueList", () => {
  it("produces one item per scheduled form per site", () => {
    const items = build({ sites: [site(), site({ siteId: "site-2", location: "River" })] });
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.siteName).sort()).toEqual(["Mallee block", "River"]);
  });

  it("leaves out forms with no timing", () => {
    expect(build({ templates: [template({ timing: null })] })).toHaveLength(0);
  });

  it("leaves out trial-level forms that have no site", () => {
    expect(build({ templates: [template({ requiresSite: false })] })).toHaveLength(0);
  });

  it("leaves out archived trials", () => {
    expect(build({ trials: [trial({ status: "archived" })] })).toHaveLength(0);
  });

  it("leaves out trials that have stopped taking entries", () => {
    expect(build({ trials: [trial({ status: "completed" })] })).toHaveLength(0);
  });

  it("still schedules a draft, which can take a test run", () => {
    expect(build({ trials: [trial({ status: "draft" })] })).toHaveLength(1);
  });

  it("does not schedule a site belonging to another trial", () => {
    expect(build({ sites: [site({ siteId: "elsewhere", trialId: "trial-2" })] })).toHaveLength(0);
  });

  it("counts a matching record as done", () => {
    expect(build({ events: [event()] })[0].window.status).toBe("recorded");
  });

  it("ignores a record of a different type at the same site", () => {
    const items = build({ events: [event({ eventType: "calibration" })] });
    expect(items[0].window.status).not.toBe("recorded");
  });

  it("ignores a record from a different site", () => {
    const items = build({ events: [event({ siteId: "somewhere-else" })] });
    expect(items[0].window.status).not.toBe("recorded");
  });

  it("says nothing rather than guessing when the site has no planting date", () => {
    const items = build({ sites: [site({ plantingDate: null })] });
    expect(items[0].window.status).toBe("unscheduled");
    expect(items[0].window.reason).toMatch(/no planting date/i);
  });

  it("re-anchors to a confirmed stage", () => {
    const items = build({
      sites: [site({ stageDates: { tuberInitiation: "2026-10-10" } })],
      today: "2026-10-10",
    });
    expect(items[0].window.estimated).toBe(false);
    expect(items[0].window.status).toBe("due");
  });

  it("puts the most urgent first", () => {
    const items = build({
      sites: [
        site({ siteId: "late", location: "Late", plantingDate: "2026-06-01" }),
        site({ siteId: "soon", location: "Soon", plantingDate: "2026-10-01" }),
      ],
    });
    expect(items[0].siteName).toBe("Late");
    expect(items[0].window.status).toBe("overdue");
  });
});

describe("todayIso", () => {
  it("uses the device's own date rather than UTC", () => {
    // Late evening in Australia is still the previous day in UTC; the grower
    // is standing in the local one.
    const localEvening = new Date(2026, 9, 10, 23, 30);
    expect(todayIso(localEvening)).toBe("2026-10-10");
  });

  it("pads months and days", () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
