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
  layoutSeed: null,
  responseMetric: "yield",
  createdAt: T0,
  updatedAt: T0,
};

const sites: Site[] = [
  { siteId: "s1", trialId: "trial-1", contactId: "c1", location: "Block", region: "", soilType: "", coordinates: null, createdAt: T0 },
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
