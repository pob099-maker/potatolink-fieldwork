import { describe, expect, it } from "vitest";
import { buildTrialCsv, csvFileName } from "./export";
import type {
  FormTemplate,
  MeasurementEvent,
  Metric,
  MetricValue,
  PracticeArm,
  Site,
  Trial,
} from "../types";

const T0 = "2026-08-18T00:00:00.000Z";

const trial: Trial = {
  trialId: "trial-1",
  projectId: "p1",
  name: "CropVision Comparison",
  objective: "",
  status: "active",
  design: "observational",
  replicates: 0,
  blocking: "none" as const,
  layoutSeed: null,
  responseMetric: null,
  createdAt: T0,
  updatedAt: T0,
};

const sites: Site[] = [
  {
    siteId: "site-1",
    trialId: "trial-1",
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
    trialId: "trial-1",
    name: "Control",
    type: "control",
    description: "",
    sortOrder: 0,
    archived: false,
    createdAt: T0,
  },
];

const templates: FormTemplate[] = [
  {
    templateId: "t1",
    trialId: "trial-1",
    armId: null,
    name: "Run record",
    eventType: "field_record",
    audience: "grower",
    frequency: "",
    requiresSite: true,
    requiresArm: true,
    fields: [],
    createdAt: T0,
  } as FormTemplate,
];

function event(id: string, over: Partial<MeasurementEvent> = {}): MeasurementEvent {
  return {
    eventId: id,
    trialId: "trial-1",
    siteId: "site-1",
    armId: "arm-1",
    replicate: null,
    plot: null,
    eventDate: T0,
    eventType: "field_record",
    enteredBy: "grower",
    syncStatus: "synced",
    createdAt: T0,
    ...over,
  };
}

function metric(id: string, eventId: string, name: string, value: MetricValue, over: Partial<Metric> = {}): Metric {
  return {
    metricId: id,
    eventId,
    metricName: name,
    value,
    unit: "",
    photoUrl: null,
    createdAt: T0,
    ...over,
  };
}

describe("buildTrialCsv", () => {
  it("emits a header and one row per metric in tidy form", () => {
    const events = [event("e1")];
    const metrics = [
      metric("m1", "e1", "tonnesHandled", 42.5, { unit: "t" }),
      metric("m2", "e1", "runDuration", 3.5, { unit: "hours" }),
    ];
    const csv = buildTrialCsv(trial, sites, arms, templates, events, metrics);
    const lines = csv.split("\r\n");
    expect(lines[0].split(",")).toContain("metric_name");
    expect(lines).toHaveLength(3); // header + 2 metrics
    expect(lines[1]).toContain("Walkers Flat");
    expect(lines[1]).toContain("Control");
    expect(lines[1]).toContain("tonnesHandled");
    expect(lines[1]).toContain("42.5");
  });

  it("quotes values containing commas", () => {
    const events = [event("e1")];
    const metrics = [metric("m1", "e1", "notes", "rot, greening")];
    const csv = buildTrialCsv(trial, sites, arms, templates, events, metrics);
    expect(csv).toContain('"rot, greening"');
  });

  it("includes trial-level staff records with blank site and practice", () => {
    const events = [event("cost", { siteId: null, armId: null, eventType: "cost_log" })];
    const metrics = [metric("m1", "cost", "leaseCost", 18000, { unit: "$" })];
    const csv = buildTrialCsv(trial, sites, arms, templates, events, metrics);
    const row = csv.split("\r\n")[1].split(",");
    // site and practice columns are empty, but the trial and metric are present
    expect(row[2]).toBe(""); // site
    expect(row[4]).toBe(""); // practice
    expect(csv).toContain("cost_log");
    expect(csv).toContain("leaseCost");
  });

  it("gives a multi-choice answer one row per selection", () => {
    // Long format means one observation per row. Three defects seen is three
    // observations — joining them into one cell hands the analyst a parsing job.
    const events = [event("e1")];
    const metrics = [metric("m1", "e1", "defects", ["Scab", "Greening", "Rot"])];
    const csv = buildTrialCsv(trial, sites, arms, templates, events, metrics);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(4); // header + one row per defect
    expect(lines.filter((line) => line.includes("defects"))).toHaveLength(3);
    expect(csv).toContain("Scab");
    expect(csv).toContain("Rot");
  });

  it("exports a yes/no answer as a boolean, not the word", () => {
    const events = [event("e1")];
    const metrics = [metric("m1", "e1", "blockageOccurred", false)];
    const csv = buildTrialCsv(trial, sites, arms, templates, events, metrics);
    expect(csv.split("\r\n")[1]).toContain("false");
  });

  it("puts a media URL in its own column", () => {
    const events = [event("e1")];
    const metrics = [
      metric("m1", "e1", "photo", "photo", { photoUrl: "https://example.org/p.jpg" }),
    ];
    const csv = buildTrialCsv(trial, sites, arms, templates, events, metrics);
    expect(csv).toContain("https://example.org/p.jpg");
  });

  it("keeps an event with no metrics rather than dropping it", () => {
    const csv = buildTrialCsv(trial, sites, arms, templates, [event("e1")], []);
    expect(csv.split("\r\n")).toHaveLength(2); // header + 1 empty-metric row
  });

  it("builds a dated, slugged file name", () => {
    expect(csvFileName(trial)).toMatch(/^cropvision-comparison-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

describe("who recorded it", () => {
  const contacts = [
    { contactId: "c1", name: "Jo Reid", business: "", role: "grower" as const,
      region: "", email: "", phone: "", tags: [], createdAt: T0 },
  ];

  it("names the person instead of printing their id", () => {
    // The file goes to a biometrician who has no way to look an id up.
    const events = [event("e1", { enteredBy: "c1" })];
    const metrics = [metric("m1", "e1", "tonnesHandled", 40)];
    const csv = buildTrialCsv(trial, sites, arms, templates, events, metrics, contacts);
    expect(csv.split("\r\n")[0]).toContain("recorded_by");
    expect(csv.split("\r\n")[1]).toContain("Jo Reid");
  });

  it("keeps the raw value when the contact is unknown, rather than blanking it", () => {
    const events = [event("e1", { enteredBy: "missing-id" })];
    const metrics = [metric("m1", "e1", "tonnesHandled", 40)];
    const csv = buildTrialCsv(trial, sites, arms, templates, events, metrics, contacts);
    expect(csv.split("\r\n")[1]).toContain("missing-id");
  });
});
