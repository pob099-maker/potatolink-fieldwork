import { describe, expect, it } from "vitest";
import { blockVariation } from "./trialReport";
import type { MeasurementEvent, Metric, Trial } from "../types";

const T0 = "2026-01-01T00:00:00.000Z";

const trial = (overrides: Partial<Trial> = {}): Trial =>
  ({
    trialId: "t1",
    projectId: "p",
    name: "Trial",
    objective: "",
    status: "active",
    design: "replicated",
    replicates: 3,
    blocking: "blocks",
    vocabulary: null,
    plotLengthM: null,
    plotWidthM: null,
    dataSources: [],
    layoutSeed: "SEED",
    responseMetric: "yield",
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  }) as Trial;

let counter = 0;
function plot(block: number, armId: string, values: number[], siteId = "s1") {
  const eventId = `e${++counter}`;
  const event = {
    eventId,
    trialId: "t1",
    siteId,
    armId,
    replicate: block,
    plot: counter,
    eventDate: T0,
    eventType: "field_record",
    enteredBy: "x",
    syncStatus: "synced",
    createdAt: T0,
  } as MeasurementEvent;
  const metrics = values.map(
    (value, i) =>
      ({
        metricId: `${eventId}-${i}`,
        eventId,
        metricName: "yield",
        value,
        unit: "kg",
        createdAt: T0,
      }) as Metric,
  );
  return { event, metrics };
}

function build(rows: Array<ReturnType<typeof plot>>) {
  return { events: rows.map((r) => r.event), metrics: rows.flatMap((r) => r.metrics) };
}

describe("blockVariation", () => {
  it("averages the response within each block", () => {
    const { events, metrics } = build([
      plot(1, "a", [40]), plot(1, "b", [44]),
      plot(2, "a", [30]), plot(2, "b", [34]),
    ]);
    const result = blockVariation(trial(), events, metrics);

    expect(result.blocks.map((b) => [b.block, b.mean])).toEqual([[1, 42], [2, 32]]);
    expect(result.overallMean).toBe(37);
    expect(result.spread).toBe(10);
  });

  it("collapses several readings in one plot before comparing blocks", () => {
    // Six points down one strip are one plot's worth of information, exactly
    // as the treatment means treat them. If the two summaries disagreed about
    // n, one of them would be wrong in a report that shows both.
    const { events, metrics } = build([
      plot(1, "a", [38, 40, 42]), plot(1, "b", [44]),
      plot(2, "a", [30]), plot(2, "b", [34]),
    ]);
    const result = blockVariation(trial(), events, metrics);

    expect(result.blocks[0].mean).toBe(42);
    expect(result.blocks[0].n).toBe(2);
  });

  it("reports the spread as a percentage of the overall mean", () => {
    const { events, metrics } = build([
      plot(1, "a", [50]),
      plot(2, "a", [40]),
    ]);
    const result = blockVariation(trial(), events, metrics);

    expect(result.spread).toBe(10);
    expect(result.spreadPercent).toBeCloseTo(22.22, 1);
  });

  it("calls an even paddock even", () => {
    const { events, metrics } = build([plot(1, "a", [40]), plot(2, "a", [41])]);
    expect(blockVariation(trial(), events, metrics).note).toMatch(/ground looks even/i);
  });

  it("says a moderate gradient is what blocking is for", () => {
    const { events, metrics } = build([plot(1, "a", [40]), plot(2, "a", [36])]);
    expect(blockVariation(trial(), events, metrics).note).toMatch(/what blocking is for/i);
  });

  it("warns when the gradient is large", () => {
    const { events, metrics } = build([plot(1, "a", [60]), plot(2, "a", [40])]);
    const note = blockVariation(trial(), events, metrics).note;
    expect(note).toMatch(/large gradient/i);
  });

  it("hedges rather than concludes", () => {
    const { events, metrics } = build([plot(1, "a", [40]), plot(2, "a", [36])]);
    const note = blockVariation(trial(), events, metrics).note ?? "";
    // The app does not run a significance test and must not sound like it has.
    expect(note).not.toMatch(/significant|proves|shows that/i);
  });

  it("says nothing for a single block", () => {
    const { events, metrics } = build([plot(1, "a", [40]), plot(1, "b", [44])]);
    const result = blockVariation(trial(), events, metrics);
    expect(result.spread).toBeNull();
    expect(result.note).toBeNull();
  });

  it("is empty for an observational trial", () => {
    const { events, metrics } = build([plot(1, "a", [40]), plot(2, "a", [36])]);
    const result = blockVariation(trial({ design: "observational" }), events, metrics);
    expect(result.blocks).toHaveLength(0);
  });

  it("is empty when no response variable is nominated", () => {
    const { events, metrics } = build([plot(1, "a", [40]), plot(2, "a", [36])]);
    expect(blockVariation(trial({ responseMetric: null }), events, metrics).blocks).toHaveLength(0);
  });

  it("ignores metrics that are not the response", () => {
    const { events, metrics } = build([plot(1, "a", [40]), plot(2, "a", [36])]);
    const noise = metrics.map((m) => ({ ...m, metricId: m.metricId + "x", metricName: "hollowHeart", value: 999 }));
    const result = blockVariation(trial(), events, [...metrics, ...noise]);
    expect(result.overallMean).toBe(38);
  });

  it("can be narrowed to one site", () => {
    const { events, metrics } = build([
      plot(1, "a", [40], "s1"), plot(2, "a", [36], "s1"),
      plot(1, "a", [10], "s2"), plot(2, "a", [10], "s2"),
    ]);
    const result = blockVariation(trial(), events, metrics, "s1");
    expect(result.overallMean).toBe(38);
    expect(result.blocks).toHaveLength(2);
  });

  it("copes with nothing recorded yet", () => {
    const result = blockVariation(trial(), [], []);
    expect(result.blocks).toHaveLength(0);
    expect(result.note).toBeNull();
  });
});
