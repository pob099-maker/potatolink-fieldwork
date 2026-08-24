import { describe, expect, it } from "vitest";
import {
  describeEvent,
  describeEventScope,
  eventsForTrial,
  recentEntriesAtSite,
  resolveTrialId,
} from "./events";
import type { FormTemplate, MeasurementEvent, Metric, PracticeArm, Site } from "../types";

const T0 = "2026-08-18T00:00:00.000Z";
const TRIAL = "trial-1";
const OTHER_TRIAL = "trial-2";

const sites: Site[] = [
  {
    siteId: "site-1",
    trialId: TRIAL,
    contactId: "c1",
    location: "Walkers Flat",
    region: "SA",
    soilType: "",
    coordinates: null,
    createdAt: T0,
  },
];

const arms: PracticeArm[] = [
  {
    armId: "arm-1",
    trialId: TRIAL,
    name: "Control",
    type: "control",
    description: "",
    sortOrder: 0,
    archived: false,
    createdAt: T0,
  },
];

function event(overrides: Partial<MeasurementEvent>): MeasurementEvent {
  return {
    eventId: "e1",
    trialId: null,
    siteId: null,
    armId: null,
    replicate: null,
    plot: null,
    eventDate: T0,
    eventType: "field_record",
    enteredBy: "",
    syncStatus: "synced",
    createdAt: T0,
    ...overrides,
  };
}

describe("resolveTrialId", () => {
  it("uses the record's own trial when it has one", () => {
    expect(resolveTrialId(event({ trialId: OTHER_TRIAL }), sites, arms)).toBe(OTHER_TRIAL);
  });

  it("falls back to the site for older records", () => {
    expect(resolveTrialId(event({ siteId: "site-1" }), sites, arms)).toBe(TRIAL);
  });

  it("falls back to the arm when there is no site", () => {
    expect(resolveTrialId(event({ armId: "arm-1" }), sites, arms)).toBe(TRIAL);
  });

  it("returns null for a record with nothing to resolve against", () => {
    expect(resolveTrialId(event({}), sites, arms)).toBeNull();
  });
});

describe("eventsForTrial", () => {
  it("includes trial-level staff records alongside per-pass ones", () => {
    const all = [
      event({ eventId: "run", trialId: TRIAL, siteId: "site-1", armId: "arm-1" }),
      event({ eventId: "cost", trialId: TRIAL, eventType: "cost_log" }),
      event({ eventId: "elsewhere", trialId: OTHER_TRIAL }),
    ];
    const mine = eventsForTrial(all, TRIAL, sites, arms);
    expect(mine.map((e) => e.eventId).sort()).toEqual(["cost", "run"]);
  });
});

describe("describing records", () => {
  const templates: FormTemplate[] = [
    {
      templateId: "t1",
      trialId: TRIAL,
      armId: null,
      name: "Cost log",
      eventType: "cost_log",
      audience: "staff",
      frequency: "Once per trial",
      requiresSite: false,
      requiresArm: false,
      fields: [],
      createdAt: T0,
    } as FormTemplate,
  ];

  it("names a record after its form", () => {
    expect(describeEvent(event({ eventType: "cost_log" }), templates)).toBe("Cost log");
  });

  it("names a record after its own trial's form, not another trial's", () => {
    // Nearly every trial has a "field_record", so matching on event type alone
    // labelled a record with whichever trial came first in the list.
    const shared: FormTemplate[] = [
      { ...templates[0], templateId: "t2", trialId: OTHER_TRIAL, name: "Their run record", eventType: "field_record" },
      { ...templates[0], templateId: "t3", trialId: TRIAL, name: "Our run record", eventType: "field_record" },
    ];
    expect(
      describeEvent(event({ trialId: TRIAL, eventType: "field_record" }), shared),
    ).toBe("Our run record");
  });

  it("falls back to any matching form when the record predates trial references", () => {
    // Older records carry no trialId, so the best available guess is the
    // event type alone — the old behaviour, kept for them only.
    const shared: FormTemplate[] = [
      { ...templates[0], templateId: "t2", trialId: OTHER_TRIAL, name: "Their run record", eventType: "field_record" },
    ];
    expect(describeEvent(event({ eventType: "field_record" }), shared)).toBe(
      "Their run record",
    );
  });

  it("falls back to a readable event type when no form matches", () => {
    expect(describeEvent(event({ eventType: "portal_output" }), templates)).toBe(
      "portal output",
    );
  });

  it("says whole trial when a record has no site", () => {
    expect(describeEventScope(event({}), sites)).toBe("Whole trial");
    expect(describeEventScope(event({ siteId: "site-1" }), sites)).toBe("Walkers Flat");
  });
});

describe("recentEntriesAtSite", () => {
  function at(eventId: string, when: string, siteId = "site-1"): MeasurementEvent {
    return event({ eventId, trialId: TRIAL, siteId, armId: "arm-1", eventDate: when });
  }
  function metric(eventId: string, value: number | string, unit = "", photoUrl: string | null = null): Metric {
    return { metricId: `${eventId}-${value}`, eventId, metricName: "m", value, unit, photoUrl, createdAt: T0 };
  }

  const events = [
    at("old", "2026-08-01T08:00:00.000Z"),
    at("newest", "2026-08-03T08:00:00.000Z"),
    at("middle", "2026-08-02T08:00:00.000Z"),
    at("elsewhere", "2026-08-04T08:00:00.000Z", "site-2"),
  ];
  const metrics = [
    metric("newest", 42.5, "t"),
    metric("newest", "https://x/p.jpg", "", "https://x/p.jpg"),
  ];

  it("returns entries at the site, newest first", () => {
    const recent = recentEntriesAtSite(events, metrics, TRIAL, "site-1");
    expect(recent.map((r) => r.event.eventId)).toEqual(["newest", "middle", "old"]);
  });

  it("excludes other sites and other trials", () => {
    const recent = recentEntriesAtSite(events, metrics, TRIAL, "site-1");
    expect(recent.some((r) => r.event.eventId === "elsewhere")).toBe(false);
    expect(recentEntriesAtSite(events, metrics, OTHER_TRIAL, "site-1")).toEqual([]);
  });

  it("summarises values with units and leaves media out", () => {
    const recent = recentEntriesAtSite(events, metrics, TRIAL, "site-1");
    const newest = recent.find((r) => r.event.eventId === "newest");
    expect(newest?.summary).toBe("42.5 t");
  });

  it("renders stored booleans as Yes and No", () => {
    const boolEvents = [at("b1", "2026-08-05T08:00:00.000Z")];
    const boolMetrics = [metric("b1", "true"), metric("b1", "false")];
    const [recent] = recentEntriesAtSite(boolEvents, boolMetrics, TRIAL, "site-1");
    expect(recent.summary).toBe("Yes · No");
  });

  it("honours the limit", () => {
    expect(recentEntriesAtSite(events, metrics, TRIAL, "site-1", 2)).toHaveLength(2);
  });
});
