import { describe, expect, it } from "vitest";
import { buildHandoff, handoffCsv, handoffFileName } from "./resultsHandoff";
import type { MeasurementEvent, Metric, PracticeArm, Site, Trial } from "../types";

// The seam between what was observed and what it is worth.
//
// Fieldwork's job ends at "the high-nitrogen plots yielded 4.5 kg more". What
// a kilogram is worth this season, what the extra urea cost, and whether that
// pays are inputs nobody measured in a paddock — and the app used to state
// them in the same voice as the yield.

const T0 = "2026-08-18T00:00:00.000Z";

const trial: Trial = {
  trialId: "trial-1",
  projectId: "p1",
  name: "Nitrogen Rate, Home Block",
  objective: "",
  status: "active",
  design: "replicated",
  replicates: 3,
  blocking: "none",
  vocabulary: null,
  // 2 m × 10 m = 20 m², so a plot weight converts to a hectare figure.
  plotLengthM: 10,
  plotWidthM: 2,
  dataSources: [],
  layoutSeed: null,
  responseMetric: "yield",
  createdAt: T0,
  updatedAt: T0,
} as Trial;

const site = (siteId: string, location: string): Site =>
  ({ siteId, trialId: "trial-1", contactId: "c1", location, region: "" }) as Site;

const sites = [site("s1", "Home Block"), site("s2", "River Block")];

const arm = (armId: string, sortOrder: number): PracticeArm =>
  ({
    armId,
    trialId: "trial-1",
    name: armId,
    type: sortOrder === 0 ? "control" : "alternative",
    description: "",
    sortOrder,
    archived: false,
    createdAt: T0,
  }) as PracticeArm;

const arms = [arm("standard", 0), arm("high", 1)];

const ev = (eventId: string, armId: string, siteId: string, rep: number): MeasurementEvent =>
  ({
    eventId,
    trialId: "trial-1",
    siteId,
    armId,
    replicate: rep,
    plot: null,
    eventDate: T0,
    eventType: "field_record",
    enteredBy: "",
    syncStatus: "synced",
    createdAt: T0,
  }) as MeasurementEvent;

const kg = (eventId: string, value: number): Metric =>
  ({
    metricId: `${eventId}-y`,
    eventId,
    metricName: "yield",
    value,
    unit: "kg",
    photoUrl: null,
    createdAt: T0,
  }) as Metric;

// Home Block: standard averages 40 kg/plot, high averages 44.
const events = [
  ev("e1", "standard", "s1", 1),
  ev("e2", "standard", "s1", 2),
  ev("e3", "high", "s1", 1),
  ev("e4", "high", "s1", 2),
];
const metrics = [kg("e1", 39), kg("e2", 41), kg("e3", 43), kg("e4", 45)];

const build = () =>
  buildHandoff(trial, sites, arms, events, metrics, "Harvested weight", "kg");

describe("what gets handed over", () => {
  it("names which row is the control, because a budget compares against it", () => {
    // A partial budget prices a *change*. A reader that cannot tell which row
    // is "what is already being done" cannot build one.
    const rows = build().rows.filter((row) => row.siteId === "s1");
    expect(rows.find((row) => row.armName === "standard")?.isControl).toBe(true);
    expect(rows.find((row) => row.armName === "high")?.isControl).toBe(false);
  });

  it("gives the difference from the control in the response's own unit", () => {
    const high = build().rows.find((row) => row.siteId === "s1" && row.armName === "high");
    expect(high?.mean).toBe(44);
    expect(high?.differenceFromControl).toBe(4);
  });

  it("leaves the control's own difference blank rather than zero", () => {
    // Zero would read as a measured result of no change. There is no
    // comparison to make; the field is empty.
    const control = build().rows.find(
      (row) => row.siteId === "s1" && row.armName === "standard",
    );
    expect(control?.differenceFromControl).toBeNull();
  });

  it("converts to tonnes per hectare when the unit and plot size allow", () => {
    // 40 kg off 20 m² is 20 t/ha; 44 kg is 22.
    const rows = build().rows.filter((row) => row.siteId === "s1");
    expect(rows.find((row) => row.armName === "standard")?.tonnesPerHectare).toBe(20);
    expect(rows.find((row) => row.armName === "high")?.tonnesPerHectare).toBe(22);
    expect(rows.find((row) => row.armName === "high")?.tonnesPerHectareDifference).toBe(2);
  });

  it("refuses to convert rather than assuming a plot size", () => {
    // An assumed area would put a fabricated yield into somebody's budget.
    const noArea = { ...trial, plotLengthM: null, plotWidthM: null } as Trial;
    const handoff = buildHandoff(noArea, sites, arms, events, metrics, "Harvested weight", "kg");
    expect(handoff.rows.every((row) => row.tonnesPerHectare === null)).toBe(true);
    // The measured means survive; only the derived figure is withheld.
    expect(handoff.rows.some((row) => row.mean === 44)).toBe(true);
  });

  it("does not convert a unit that is not a weight", () => {
    const counts = buildHandoff(trial, sites, arms, events, metrics, "Tubers", "count");
    expect(counts.rows.every((row) => row.tonnesPerHectare === null)).toBe(true);
  });

  it("reports plots and readings separately", () => {
    // Several readings down one strip are one plot's worth of information,
    // and a budget built on the reading count would overstate its confidence.
    const row = build().rows.find((r) => r.siteId === "s1" && r.armName === "high");
    expect(row?.plots).toBe(2);
    expect(row?.readings).toBe(2);
  });
});

describe("one row per treatment per site", () => {
  it("keeps each site separate, because a budget is run for a farm", () => {
    const handoff = build();
    expect(handoff.rows.filter((row) => row.siteName === "Home Block")).toHaveLength(2);
    expect(handoff.rows.filter((row) => row.siteName === "River Block")).toHaveLength(2);
  });

  it("offers a pooled row as well, but never only that", () => {
    const handoff = build();
    expect(handoff.rows.some((row) => row.siteId === null)).toBe(true);
    expect(handoff.rows.some((row) => row.siteId !== null)).toBe(true);
  });

  it("reports a site with nothing recorded as empty, not as zero", () => {
    // River Block has no entries. Zero yield is a result; no yield is not.
    const river = build().rows.filter((row) => row.siteName === "River Block");
    expect(river.every((row) => row.mean === null)).toBe(true);
    expect(river.every((row) => row.plots === 0)).toBe(true);
  });
});

describe("the CSV", () => {
  it("carries a header a stranger could read", () => {
    const header = handoffCsv(build()).split("\r\n")[0];
    expect(header).toBe(
      "trial,site,treatment,is_control,plots,readings,mean,standard_error,unit,t_per_ha,difference_from_control,t_per_ha_difference",
    );
  });

  it("writes a blank, not a zero, where there is no number", () => {
    const line = handoffCsv(build())
      .split("\r\n")
      .find((row) => row.includes(",standard,yes,"));
    // The control's difference columns are empty.
    expect(line?.endsWith(",,")).toBe(true);
  });

  it("quotes a trial name containing a comma", () => {
    // "Nitrogen Rate, Home Block" would otherwise become two columns.
    expect(handoffCsv(build())).toContain('"Nitrogen Rate, Home Block"');
  });

  it("has one line per row plus a header", () => {
    const lines = handoffCsv(build()).trimEnd().split("\r\n");
    expect(lines).toHaveLength(build().rows.length + 1);
  });

  it("names the file after the trial", () => {
    expect(handoffFileName(trial)).toBe("nitrogen-rate-home-block-results.csv");
  });
});

describe("a trial that already records per hectare", () => {
  // Found by exporting the seeded nitrogen trial, which records in t/ha: the
  // t_per_ha column came back empty for exactly the trials that had done the
  // arithmetic properly in the field, and a tool keying on that column would
  // have silently got nothing from them.
  const perHa = () =>
    buildHandoff(trial, sites, arms, events, metrics, "Yield", "t/ha");

  it("passes the value straight through rather than leaving it blank", () => {
    const rows = perHa().rows.filter((row) => row.siteId === "s1");
    expect(rows.find((row) => row.armName === "standard")?.tonnesPerHectare).toBe(40);
    expect(rows.find((row) => row.armName === "high")?.tonnesPerHectare).toBe(44);
  });

  it("gives the difference in t/ha too", () => {
    const high = perHa().rows.find((row) => row.siteId === "s1" && row.armName === "high");
    expect(high?.tonnesPerHectareDifference).toBe(4);
  });

  it("needs no plot size to do it", () => {
    const noArea = { ...trial, plotLengthM: null, plotWidthM: null } as Trial;
    const handoff = buildHandoff(noArea, sites, arms, events, metrics, "Yield", "t/ha");
    expect(
      handoff.rows.find((row) => row.siteId === "s1" && row.armName === "high")
        ?.tonnesPerHectare,
    ).toBe(44);
  });

  it("converts kg/ha down to tonnes", () => {
    const kgHa = buildHandoff(trial, sites, arms, events, metrics, "Yield", "kg/ha");
    const row = kgHa.rows.find((r) => r.siteId === "s1" && r.armName === "high");
    expect(row?.tonnesPerHectare).toBe(0.044);
  });
});
