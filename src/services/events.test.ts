import { describe, expect, it } from "vitest";
import {
  describeEvent,
  describeEventScope,
  eventsForTrial,
  resolveTrialId,
} from "./events";
import type { FormTemplate, MeasurementEvent, PracticeArm, Site } from "../types";

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
