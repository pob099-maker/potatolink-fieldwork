import { describe, expect, it } from "vitest";
import { replicationStatus, responseSummary } from "./replication";
import type { MeasurementEvent, Metric, PracticeArm, Site, Trial } from "../types";

const T0 = "2026-08-18T00:00:00.000Z";

const trial: Trial = {
  trialId: "trial-1",
  projectId: "p1",
  name: "N Trial",
  objective: "",
  status: "active",
  design: "replicated",
  replicates: 3,
  blocking: "none" as const,
  vocabulary: null,
  plotLengthM: null,
  plotWidthM: null,
  dataSources: [],
  layoutSeed: null,
  responseMetric: "yield",
  createdAt: T0,
  updatedAt: T0,
};

const sites: Site[] = [
  { siteId: "s1", trialId: "trial-1", contactId: "c1", location: "Block", region: "", soilType: "", coordinates: null, plantingDate: null, stageDates: {}, createdAt: T0 },
];

function arm(armId: string, sortOrder: number, archived = false): PracticeArm {
  return { armId, trialId: "trial-1", name: armId, type: sortOrder === 0 ? "control" : "alternative", description: "", sortOrder, archived, createdAt: T0 };
}
const arms = [arm("std", 0), arm("high", 1), arm("split", 2)];

function ev(armId: string, rep: number, eventId: string): MeasurementEvent {
  return { eventId, trialId: "trial-1", siteId: "s1", armId, replicate: rep, plot: null, eventDate: T0, eventType: "field_record", enteredBy: "", syncStatus: "synced", createdAt: T0 };
}
function yieldMetric(eventId: string, value: number): Metric {
  return { metricId: `${eventId}-y`, eventId, metricName: "yield", value, unit: "t/ha", photoUrl: null, createdAt: T0 };
}

// 8 of 9 plots (high rep 3 missing)
const events = [
  ev("std", 1, "e1"), ev("std", 2, "e2"), ev("std", 3, "e3"),
  ev("high", 1, "e4"), ev("high", 2, "e5"),
  ev("split", 1, "e6"), ev("split", 2, "e7"), ev("split", 3, "e8"),
];
const metrics = [
  yieldMetric("e1", 46.2), yieldMetric("e2", 44.8), yieldMetric("e3", 45.5),
  yieldMetric("e4", 49.1), yieldMetric("e5", 50.3),
  yieldMetric("e6", 48.0), yieldMetric("e7", 47.4), yieldMetric("e8", 48.9),
];

describe("replicationStatus", () => {
  it("counts recorded vs expected plots and flags the missing one", () => {
    const status = replicationStatus(trial, arms, sites, events);
    expect(status.expected).toBe(9); // 3 arms x 3 reps x 1 site
    expect(status.recorded).toBe(8);
    const missing = status.sites[0].cells.filter((c) => !c.recorded);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ armId: "high", replicate: 3 });
  });

  it("ignores archived arms", () => {
    const withArchived = [...arms, arm("dropped", 3, true)];
    const status = replicationStatus(trial, withArchived, sites, events);
    expect(status.expected).toBe(9);
  });
});

describe("responseSummary", () => {
  it("gives mean and standard error per treatment", () => {
    const stats = responseSummary(trial, arms, events, metrics);
    const std = stats.find((s) => s.armId === "std")!;
    expect(std.n).toBe(3);
    expect(std.mean).toBeCloseTo((46.2 + 44.8 + 45.5) / 3, 4);
    expect(std.se).toBeGreaterThan(0);
  });

  it("reports no standard error when a treatment has a single observation", () => {
    const single = responseSummary(trial, arms, [events[0]], [metrics[0]]);
    const std = single.find((s) => s.armId === "std")!;
    expect(std.n).toBe(1);
    expect(std.se).toBeNull();
  });

  it("returns null mean for a treatment with no response data", () => {
    const stats = responseSummary(trial, arms, [], []);
    expect(stats.every((s) => s.mean === null && s.n === 0)).toBe(true);
  });
});

// Strip trials are sampled at several points along each strip, and the same
// plot often gets assessed more than once. Counting each reading as an
// independent observation inflates n and shrinks the standard error by roughly
// the square root of the number of samples — the app would be displaying a
// confidence nobody earned.
describe("sub-samples within a plot", () => {
  const trialWithResponse: Trial = { ...trial, design: "replicated", responseMetric: "yield" };

  function plotEvent(id: string, armId: string, plot: number): MeasurementEvent {
    return {
      eventId: id, trialId: "trial-1", siteId: "s1", armId, replicate: plot, plot,
      eventDate: T0, eventType: "field_record", enteredBy: "", syncStatus: "synced", createdAt: T0,
    };
  }

  it("averages several readings in one plot into one observation", () => {
    // Three readings down one strip, one down another. Two plots, not four.
    const events = [
      plotEvent("a1", "std", 1), plotEvent("a2", "std", 1), plotEvent("a3", "std", 1),
      plotEvent("b1", "std", 2),
    ];
    const metrics = [
      yieldMetric("a1", 10), yieldMetric("a2", 20), yieldMetric("a3", 30),
      yieldMetric("b1", 40),
    ];
    const [std] = responseSummary(trialWithResponse, [arm("std", 0)], events, metrics);
    expect(std.n).toBe(2);
    expect(std.records).toBe(4);
    // Plot 1 averages to 20, plot 2 is 40, so the mean of plots is 30 — not
    // the 25 you get by averaging all four readings equally.
    expect(std.mean).toBe(30);
  });

  it("reports a standard error across plots, not across readings", () => {
    const events = [
      plotEvent("a1", "std", 1), plotEvent("a2", "std", 1),
      plotEvent("b1", "std", 2), plotEvent("b2", "std", 2),
    ];
    // Wildly different within each plot, identical between them: the plots
    // agree perfectly, so the error between plots is zero however noisy the
    // sampling was.
    const metrics = [
      yieldMetric("a1", 0), yieldMetric("a2", 100),
      yieldMetric("b1", 0), yieldMetric("b2", 100),
    ];
    const [std] = responseSummary(trialWithResponse, [arm("std", 0)], events, metrics);
    expect(std.n).toBe(2);
    expect(std.mean).toBe(50);
    expect(std.se).toBe(0);
  });

  it("keeps plots at different sites apart", () => {
    // Plot 1 at two sites is two pieces of ground, not one sampled twice.
    const atOtherSite = { ...plotEvent("c1", "std", 1), siteId: "s2" };
    const events = [plotEvent("a1", "std", 1), atOtherSite];
    const metrics = [yieldMetric("a1", 10), yieldMetric("c1", 30)];
    const [std] = responseSummary(trialWithResponse, [arm("std", 0)], events, metrics);
    expect(std.n).toBe(2);
    expect(std.mean).toBe(20);
  });

  it("leaves records alone when there is no plot or replicate to collapse to", () => {
    // An observational comparison: five harvest runs really are five
    // observations, and averaging them away would throw the trial out.
    const runs = [1, 2, 3].map((i) => ({
      ...plotEvent(`r${i}`, "std", 0), plot: null, replicate: null,
    }));
    const metrics = runs.map((run, i) => yieldMetric(run.eventId, (i + 1) * 10));
    const [std] = responseSummary(
      { ...trial, responseMetric: "yield" },
      [arm("std", 0)], runs, metrics,
    );
    expect(std.n).toBe(3);
    expect(std.records).toBe(3);
  });
});

// A trial can gain a layout part-way through. Records taken before it carry a
// replicate and no plot; records after carry both. They are the same ground,
// and keying the unit on the plot number would split one plot's readings into
// two separate "observations".
describe("records from before and after a layout", () => {
  it("treats them as the same plot", () => {
    const base = {
      trialId: "trial-1", siteId: "s1", armId: "std", eventDate: T0,
      eventType: "field_record", enteredBy: "", syncStatus: "synced" as const, createdAt: T0,
    };
    const events: MeasurementEvent[] = [
      { ...base, eventId: "before", replicate: 2, plot: null },
      { ...base, eventId: "after", replicate: 2, plot: 5 },
    ];
    const metrics = [yieldMetric("before", 40), yieldMetric("after", 60)];
    const [std] = responseSummary(
      { ...trial, design: "replicated", responseMetric: "yield" },
      [arm("std", 0)], events, metrics,
    );
    expect(std.n).toBe(1);
    expect(std.records).toBe(2);
    expect(std.mean).toBe(50);
  });
});
