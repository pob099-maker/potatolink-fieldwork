import { describe, expect, it } from "vitest";
import { buildCombinations, type Factor, type FactorLevel } from "./factorial";
import {
  combinationMeans,
  designBalance,
  interaction,
  mainEffect,
  type AnalysisInput,
} from "./factorialAnalysis";
import type { MeasurementEvent, Metric } from "../types";

const T0 = "2026-01-01T00:00:00.000Z";

const nitrogen: Factor = { factorId: "f-n", trialId: "t1", name: "Nitrogen", code: "N", sortOrder: 0 };
const irrigation: Factor = { factorId: "f-i", trialId: "t1", name: "Irrigation", code: "Irr", sortOrder: 1 };

const levels: FactorLevel[] = [
  { levelId: "n-low", factorId: "f-n", label: "Low", numericValue: 80, sortOrder: 0 },
  { levelId: "n-high", factorId: "f-n", label: "High", numericValue: 160, sortOrder: 1 },
  { levelId: "i-full", factorId: "f-i", label: "Full", numericValue: null, sortOrder: 0 },
  { levelId: "i-def", factorId: "f-i", label: "Deficit", numericValue: null, sortOrder: 1 },
];

const combinations = buildCombinations([nitrogen, irrigation], levels);

// Each combination gets its own arm, which is how the layout engine already
// randomises treatments — the factorial layer sits on top of that.
const armByCombination = new Map(
  combinations.map((combination, index) => [combination.combinationId, `arm-${index}`]),
);

let counter = 0;
function plot(armId: string, replicate: number, values: number[]) {
  const eventId = `e${++counter}`;
  const event = {
    eventId, trialId: "t1", siteId: "s1", armId, replicate, plot: counter,
    eventDate: T0, eventType: "field_record", enteredBy: "x",
    syncStatus: "synced", createdAt: T0,
  } as MeasurementEvent;
  const metrics = values.map((value, i) => ({
    metricId: `${eventId}-${i}`, eventId, metricName: "yield", value, unit: "t/ha", createdAt: T0,
  }) as Metric);
  return { event, metrics };
}

/** Build a balanced trial where every combination gets `reps` plots of a stated mean. */
function trial(byCombination: Record<string, number[]>): AnalysisInput {
  const rows = Object.entries(byCombination).flatMap(([label, values]) => {
    const combination = combinations.find((c) => c.shortLabel === label);
    if (!combination) throw new Error(`no combination ${label}`);
    const armId = armByCombination.get(combination.combinationId) as string;
    return values.map((value, index) => plot(armId, index + 1, [value]));
  });
  return {
    combinations,
    armByCombination,
    events: rows.map((r) => r.event),
    metrics: rows.flatMap((r) => r.metrics),
    response: "yield",
  };
}

describe("combinationMeans", () => {
  it("reports one mean per exact treatment mix", () => {
    const input = trial({
      "N:Low Irr:Full": [40, 42],
      "N:Low Irr:Deficit": [30, 32],
      "N:High Irr:Full": [50, 52],
      "N:High Irr:Deficit": [34, 36],
    });
    const stats = combinationMeans(input);
    expect(stats).toHaveLength(4);
    expect(stats.find((s) => s.shortLabel === "N:High Irr:Full")?.mean).toBe(51);
    expect(stats.every((s) => s.n === 2)).toBe(true);
  });

  it("averages several readings in one plot before counting it once", () => {
    const rows = [plot("arm-0", 1, [38, 42]), plot("arm-0", 2, [40, 40])];
    const stats = combinationMeans({
      combinations,
      armByCombination,
      events: rows.map((r) => r.event),
      metrics: rows.flatMap((r) => r.metrics),
      response: "yield",
    });
    const first = stats[0];
    expect(first.n).toBe(2); // two plots, four readings
    expect(first.mean).toBe(40);
  });

  it("is empty when no response variable is nominated", () => {
    const input = trial({ "N:Low Irr:Full": [40] });
    const stats = combinationMeans({ ...input, response: null });
    expect(stats.every((s) => s.n === 0)).toBe(true);
  });

  it("ignores metrics that are not the response", () => {
    const input = trial({ "N:Low Irr:Full": [40, 42] });
    const noise = input.metrics.map((m) => ({ ...m, metricId: m.metricId + "x", metricName: "hollowHeart", value: 999 }));
    const stats = combinationMeans({ ...input, metrics: [...input.metrics, ...noise] });
    expect(stats[0].mean).toBe(41);
  });
});

describe("mainEffect", () => {
  it("averages across the other factor", () => {
    const input = trial({
      "N:Low Irr:Full": [40], "N:Low Irr:Deficit": [30],
      "N:High Irr:Full": [50], "N:High Irr:Deficit": [40],
    });
    const stats = combinationMeans(input);
    const effect = mainEffect(nitrogen, levels, combinations, stats);

    expect(effect.levels.map((l) => [l.label, l.mean])).toEqual([["Low", 35], ["High", 45]]);
    expect(effect.range).toBe(10);
  });

  it("averages the combination means, not every plot", () => {
    // The distinction that matters. Low/Full lost a plot, so it contributes
    // one plot where Low/Deficit contributes three. Averaging all plots would
    // weight Deficit three times as heavily and drag the Low mean to 32.5;
    // averaging the two cell means gives the 35 the question actually asked
    // for.
    const input = trial({
      "N:Low Irr:Full": [40],
      "N:Low Irr:Deficit": [30, 30, 30],
      "N:High Irr:Full": [50],
      "N:High Irr:Deficit": [40],
    });
    const stats = combinationMeans(input);
    const effect = mainEffect(nitrogen, levels, combinations, stats);

    const low = effect.levels.find((l) => l.label === "Low");
    expect(low?.mean).toBe(35);
    expect(low?.plots).toBe(4);
    expect(low?.combinations).toBe(2);
  });

  it("agrees with the plot average when the design is balanced", () => {
    const input = trial({
      "N:Low Irr:Full": [40, 40], "N:Low Irr:Deficit": [30, 30],
      "N:High Irr:Full": [50, 50], "N:High Irr:Deficit": [40, 40],
    });
    const stats = combinationMeans(input);
    const effect = mainEffect(nitrogen, levels, combinations, stats);
    expect(effect.levels.find((l) => l.label === "Low")?.mean).toBe(35);
  });

  it("skips a combination with nothing recorded rather than treating it as zero", () => {
    const input = trial({
      "N:Low Irr:Full": [40],
      "N:High Irr:Full": [50], "N:High Irr:Deficit": [40],
    });
    const stats = combinationMeans(input);
    const effect = mainEffect(nitrogen, levels, combinations, stats);
    const low = effect.levels.find((l) => l.label === "Low");
    expect(low?.mean).toBe(40);
    expect(low?.combinations).toBe(1);
  });
});

describe("designBalance", () => {
  it("recognises a balanced design", () => {
    const stats = combinationMeans(trial({
      "N:Low Irr:Full": [40, 40], "N:Low Irr:Deficit": [30, 30],
      "N:High Irr:Full": [50, 50], "N:High Irr:Deficit": [40, 40],
    }));
    expect(designBalance(stats).balanced).toBe(true);
  });

  it("reports an unbalanced one, and how empty", () => {
    const stats = combinationMeans(trial({
      "N:Low Irr:Full": [40],
      "N:Low Irr:Deficit": [30, 30, 30],
      "N:High Irr:Full": [50],
    }));
    const balance = designBalance(stats);
    expect(balance.balanced).toBe(false);
    expect(balance.empty).toBe(1);
    expect(balance.minN).toBe(0);
    expect(balance.maxN).toBe(3);
  });
});

describe("interaction", () => {
  it("fills a grid of every level pair", () => {
    const stats = combinationMeans(trial({
      "N:Low Irr:Full": [40], "N:Low Irr:Deficit": [30],
      "N:High Irr:Full": [50], "N:High Irr:Deficit": [40],
    }));
    const grid = interaction(nitrogen, irrigation, levels, combinations, stats);
    expect(grid.cells).toHaveLength(4);
    expect(grid.rowLevels.map((l) => l.label)).toEqual(["Low", "High"]);
    expect(grid.columnLevels.map((l) => l.label)).toEqual(["Full", "Deficit"]);
  });

  it("finds no interaction when the effect is the same at both levels", () => {
    // Irrigation costs 10 t/ha under both nitrogen rates: parallel lines.
    const stats = combinationMeans(trial({
      "N:Low Irr:Full": [40], "N:Low Irr:Deficit": [30],
      "N:High Irr:Full": [50], "N:High Irr:Deficit": [40],
    }));
    const grid = interaction(nitrogen, irrigation, levels, combinations, stats);
    expect(grid.spread).toBe(0);
    expect(grid.note).toMatch(/much the same thing|read separately/i);
  });

  it("finds one when the effect changes with the other factor", () => {
    // Nitrogen pays under full irrigation and does nothing under deficit,
    // which is the entire reason for crossing them.
    const stats = combinationMeans(trial({
      "N:Low Irr:Full": [40], "N:Low Irr:Deficit": [30],
      "N:High Irr:Full": [55], "N:High Irr:Deficit": [30],
    }));
    const grid = interaction(nitrogen, irrigation, levels, combinations, stats);
    expect(grid.spread).toBeGreaterThan(0);
    expect(grid.note).toMatch(/changes markedly|no single/i);
  });

  it("says so plainly rather than implying a test was run", () => {
    const stats = combinationMeans(trial({
      "N:Low Irr:Full": [40], "N:Low Irr:Deficit": [30],
      "N:High Irr:Full": [55], "N:High Irr:Deficit": [30],
    }));
    const note = interaction(nitrogen, irrigation, levels, combinations, stats).note ?? "";
    expect(note).not.toMatch(/significant|p\s*[<=]|proves/i);
  });

  it("stays quiet when there is not enough in the grid to say anything", () => {
    const stats = combinationMeans(trial({ "N:Low Irr:Full": [40] }));
    expect(interaction(nitrogen, irrigation, levels, combinations, stats).note).toBeNull();
  });
});
