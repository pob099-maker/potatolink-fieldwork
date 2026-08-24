import { describe, expect, it } from "vitest";
import { buildTrialCsv, csvFileName } from "./export";
import type { DataSource,
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
  vocabulary: null,
  plotLengthM: null,
  plotWidthM: null,
  dataSources: [],
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

  it("includes trial-level staff records with blank site and treatment", () => {
    const events = [event("cost", { siteId: null, armId: null, eventType: "cost_log" })];
    const metrics = [metric("m1", "cost", "leaseCost", 18000, { unit: "$" })];
    const csv = buildTrialCsv(trial, sites, arms, templates, events, metrics);
    const row = csv.split("\r\n")[1].split(",");
    // site and treatment columns are empty, but the trial and metric are present
    expect(row[2]).toBe(""); // site
    expect(row[4]).toBe(""); // treatment
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

// A weight is what somebody can measure; a yield is what gets compared. The
// conversion belongs in the file rather than in a paddock calculation nobody
// can check afterwards.
describe("derived yield", () => {
  it("converts a weight using the trial's plot size", () => {
    const sized = { ...trial, plotWidthM: 2, plotLengthM: 10 };
    const csv = buildTrialCsv(
      sized, sites, arms, templates,
      [event("e1")],
      [{
        metricId: "m1", eventId: "e1", metricName: "harvest", value: 40,
        unit: "kg", photoUrl: null, createdAt: T0,
      }],
    );
    const row = csv.split("\r\n")[1].split(",");
    const head = csv.split("\r\n")[0].split(",");
    // 40 kg off 20 m² is 20 t/ha.
    expect(row[head.indexOf("yield_t_ha")]).toBe("20.000");
    expect(row[head.indexOf("plot_area_m2")]).toBe("20");
  });

  it("lets a record carry its own area, for strips of unequal length", () => {
    const sized = { ...trial, plotWidthM: 2, plotLengthM: 10 };
    const csv = buildTrialCsv(
      sized, sites, arms, templates,
      [event("e1")],
      [
        { metricId: "m1", eventId: "e1", metricName: "harvest", value: 1200,
          unit: "kg", photoUrl: null, createdAt: T0 },
        { metricId: "m2", eventId: "e1", metricName: "area", value: 0.96,
          unit: "ha", photoUrl: null, createdAt: T0 },
      ],
    );
    const head = csv.split("\r\n")[0].split(",");
    const harvest = csv.split("\r\n").find((line) => line.includes("harvest"))!.split(",");
    // 1.2 t over 0.96 ha — the record's own area, not the trial's 20 m².
    expect(harvest[head.indexOf("plot_area_m2")]).toBe("9600");
    expect(harvest[head.indexOf("yield_t_ha")]).toBe("1.250");
  });

  it("leaves the column empty rather than guessing without an area", () => {
    const csv = buildTrialCsv(
      trial, sites, arms, templates,
      [event("e1")],
      [{
        metricId: "m1", eventId: "e1", metricName: "harvest", value: 40,
        unit: "kg", photoUrl: null, createdAt: T0,
      }],
    );
    const head = csv.split("\r\n")[0].split(",");
    expect(csv.split("\r\n")[1].split(",")[head.indexOf("yield_t_ha")]).toBe("");
  });
});

// A number in the file should be traceable to the instrument that produced it.
describe("provenance in the export", () => {
  const source = (over: Partial<DataSource>): DataSource => ({
    label: "x", kind: "other", reference: "r", siteId: null, armId: null, plot: null, note: "",
    ...over,
  });

  it("names the sources covering a row, narrowest first", () => {
    const withSources = {
      ...trial,
      dataSources: [
        source({ label: "Protocol", reference: "S:/protocol.pdf" }),
        source({ label: "Flow meter", reference: "https://vri/ds(88)", siteId: "site-1", plot: 7 }),
      ],
    };
    const csv = buildTrialCsv(
      withSources, sites, arms, templates,
      [{ ...event("e1"), plot: 7 }],
      [{ metricId: "m1", eventId: "e1", metricName: "yield", value: 46.2,
         unit: "t/ha", photoUrl: null, createdAt: T0 }],
    );
    const head = csv.split("\r\n")[0].split(",");
    const row = csv.split("\r\n")[1].split(",");
    // Unquoted: the separator is a pipe precisely so a cell holding several
    // sources needs no escaping and still splits cleanly.
    expect(row[head.indexOf("data_sources")]).toBe("Flow meter | Protocol");
    expect(row[head.indexOf("data_source_refs")]).toBe(
      "https://vri/ds(88) | S:/protocol.pdf",
    );
  });

  it("leaves the columns empty when nothing covers the row", () => {
    const csv = buildTrialCsv(
      trial, sites, arms, templates, [event("e1")],
      [{ metricId: "m1", eventId: "e1", metricName: "yield", value: 1,
         unit: "t/ha", photoUrl: null, createdAt: T0 }],
    );
    const head = csv.split("\r\n")[0].split(",");
    const row = csv.split("\r\n")[1].split(",");
    expect(row[head.indexOf("data_sources")]).toBe("");
  });
});
