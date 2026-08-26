// Reading a factorial: combination means, main effects, interactions.
//
// The whole reason for running a factorial is the last of those. If the effect
// of nitrogen is the same under full and deficit irrigation, the two factors
// could have been tested separately. If it is not, that difference is the
// finding, and it is invisible in any summary that reports one factor at a
// time.
//
// One subtlety runs through all of it, and getting it wrong is the easiest way
// to publish a wrong number from a right trial.
//
//   A main effect is the mean for one level of one factor, averaged across the
//   others. There are two ways to compute that and they disagree the moment a
//   plot goes unrecorded. Averaging every plot at that level weights each
//   combination by how much data it happened to return, so a combination that
//   lost a plot to a wash-out quietly counts less. Averaging the combination
//   means instead gives every combination equal say, which is what "averaged
//   across the other factors" is supposed to mean.
//
//   This file does the second, always, and reports whether the design was
//   balanced so a reader knows whether the distinction mattered.
//
// As everywhere else in this app: descriptive only. No significance test, no
// F ratio, no p value. An interaction that looks real here is a reason to run
// the analysis properly, not a result.

import type { MeasurementEvent, Metric } from "../types";
import type { Combination, Factor, FactorLevel } from "./factorial";

export interface CombinationStat {
  combinationId: string;
  label: string;
  shortLabel: string;
  /** Independent plots, after several readings in one plot are averaged. */
  n: number;
  mean: number | null;
  se: number | null;
}

export interface LevelStat {
  levelId: string;
  label: string;
  /** Combinations contributing, not plots — see the note at the top. */
  combinations: number;
  plots: number;
  mean: number | null;
}

export interface MainEffect {
  factorId: string;
  factorName: string;
  levels: LevelStat[];
  /** Largest level mean minus smallest, in the response's units. */
  range: number | null;
}

export interface InteractionCell {
  rowLevelId: string;
  columnLevelId: string;
  n: number;
  mean: number | null;
}

export interface Interaction {
  rowFactor: Factor;
  columnFactor: Factor;
  rowLevels: FactorLevel[];
  columnLevels: FactorLevel[];
  cells: InteractionCell[];
  /**
   * How much the effect of the column factor changes across levels of the row
   * factor — the spread of the differences. Zero means the lines are parallel
   * and the factors act independently.
   */
  spread: number | null;
  note: string | null;
}

/** Whether every combination returned the same number of plots. */
export interface Balance {
  balanced: boolean;
  /** Combinations with nothing recorded at all. */
  empty: number;
  minN: number;
  maxN: number;
}

const numeric = (value: Metric["value"]): number | null =>
  typeof value === "number" ? value : null;

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * One number per plot for each combination.
 *
 * Several readings in one plot are averaged first, exactly as the rest of the
 * app does it — randomisation was applied to plots, so a plot is one
 * observation however many times the clipboard was filled in.
 */
function plotValues(
  armIdFor: Map<string, string>,
  events: MeasurementEvent[],
  metrics: Metric[],
  response: string,
): Map<string, number[]> {
  const byEvent = new Map(events.map((event) => [event.eventId, event]));
  // combinationId -> plot key -> readings
  const perCombination = new Map<string, Map<string, number[]>>();

  for (const metric of metrics) {
    if (metric.metricName !== response) continue;
    const value = numeric(metric.value);
    if (value === null) continue;
    const event = byEvent.get(metric.eventId);
    if (!event || !event.armId) continue;
    const combinationId = armIdFor.get(event.armId);
    if (!combinationId) continue;

    const plotKey = `${event.siteId ?? ""}:${event.armId}:rep:${event.replicate ?? "none"}`;
    let plots = perCombination.get(combinationId);
    if (!plots) {
      plots = new Map();
      perCombination.set(combinationId, plots);
    }
    const readings = plots.get(plotKey);
    if (readings) readings.push(value);
    else plots.set(plotKey, [value]);
  }

  const out = new Map<string, number[]>();
  for (const [combinationId, plots] of perCombination) {
    out.set(
      combinationId,
      [...plots.values()].map((readings) => mean(readings) as number),
    );
  }
  return out;
}

export interface AnalysisInput {
  combinations: Combination[];
  /** combinationId -> the arm that carries it in the layout. */
  armByCombination: Map<string, string>;
  events: MeasurementEvent[];
  metrics: Metric[];
  response: string | null;
}

function statsFor(input: AnalysisInput): Map<string, number[]> {
  if (!input.response) return new Map();
  const armIdFor = new Map<string, string>();
  for (const [combinationId, armId] of input.armByCombination) armIdFor.set(armId, combinationId);
  return plotValues(armIdFor, input.events, input.metrics, input.response);
}

/** Mean response for each exact treatment mix. */
export function combinationMeans(input: AnalysisInput): CombinationStat[] {
  const values = statsFor(input);
  return input.combinations.map((combination) => {
    const plots = values.get(combination.combinationId) ?? [];
    const average = mean(plots);
    let se: number | null = null;
    if (plots.length > 1 && average !== null) {
      const variance =
        plots.reduce((sum, value) => sum + (value - average) ** 2, 0) / (plots.length - 1);
      se = Math.sqrt(variance / plots.length);
    }
    return {
      combinationId: combination.combinationId,
      label: combination.label,
      shortLabel: combination.shortLabel,
      n: plots.length,
      mean: average,
      se,
    };
  });
}

export function designBalance(stats: CombinationStat[]): Balance {
  const counts = stats.map((stat) => stat.n);
  if (counts.length === 0) return { balanced: true, empty: 0, minN: 0, maxN: 0 };
  const minN = Math.min(...counts);
  const maxN = Math.max(...counts);
  return {
    balanced: minN === maxN,
    empty: counts.filter((n) => n === 0).length,
    minN,
    maxN,
  };
}

/**
 * The effect of one factor, averaged across the others.
 *
 * Averaged over the *combination means*, not over every plot — see the note at
 * the top of this file. With a balanced design the two agree exactly; with a
 * missing plot they do not, and only this one answers the question that was
 * asked.
 */
export function mainEffect(
  factor: Factor,
  levels: FactorLevel[],
  combinations: Combination[],
  stats: CombinationStat[],
): MainEffect {
  const statById = new Map(stats.map((stat) => [stat.combinationId, stat]));
  const mine = levels
    .filter((level) => level.factorId === factor.factorId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const levelStats: LevelStat[] = mine.map((level) => {
    const atLevel = combinations.filter(
      (combination) => combination.members[factor.factorId] === level.levelId,
    );
    const cellMeans: number[] = [];
    let plots = 0;
    for (const combination of atLevel) {
      const stat = statById.get(combination.combinationId);
      if (!stat || stat.mean === null) continue;
      cellMeans.push(stat.mean);
      plots += stat.n;
    }
    return {
      levelId: level.levelId,
      label: level.label,
      combinations: cellMeans.length,
      plots,
      mean: mean(cellMeans),
    };
  });

  const means = levelStats
    .map((entry) => entry.mean)
    .filter((value): value is number => value !== null);

  return {
    factorId: factor.factorId,
    factorName: factor.name,
    levels: levelStats,
    range: means.length > 1 ? Math.max(...means) - Math.min(...means) : null,
  };
}

/**
 * Two factors crossed: does one factor's effect change with the other?
 *
 * The grid is the finding. The spread underneath it says how far the column
 * factor's effect moves between rows — near zero and the factors act
 * independently, large and reading either main effect on its own is
 * misleading, because there is no single "effect of nitrogen" to report.
 */
export function interaction(
  rowFactor: Factor,
  columnFactor: Factor,
  levels: FactorLevel[],
  combinations: Combination[],
  stats: CombinationStat[],
): Interaction {
  const statById = new Map(stats.map((stat) => [stat.combinationId, stat]));
  const rowLevels = levels
    .filter((level) => level.factorId === rowFactor.factorId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const columnLevels = levels
    .filter((level) => level.factorId === columnFactor.factorId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const cells: InteractionCell[] = [];
  for (const row of rowLevels) {
    for (const column of columnLevels) {
      const matching = combinations.filter(
        (combination) =>
          combination.members[rowFactor.factorId] === row.levelId &&
          combination.members[columnFactor.factorId] === column.levelId,
      );
      const cellMeans: number[] = [];
      let n = 0;
      for (const combination of matching) {
        const stat = statById.get(combination.combinationId);
        if (!stat || stat.mean === null) continue;
        cellMeans.push(stat.mean);
        n += stat.n;
      }
      cells.push({ rowLevelId: row.levelId, columnLevelId: column.levelId, n, mean: mean(cellMeans) });
    }
  }

  // How far the column factor's effect moves between rows. With two column
  // levels this is the difference of differences, which is the interaction.
  const perRow: number[] = [];
  for (const row of rowLevels) {
    const inRow = cells
      .filter((cell) => cell.rowLevelId === row.levelId)
      .map((cell) => cell.mean)
      .filter((value): value is number => value !== null);
    if (inRow.length > 1) perRow.push(Math.max(...inRow) - Math.min(...inRow));
  }
  const spread = perRow.length > 1 ? Math.max(...perRow) - Math.min(...perRow) : null;

  return {
    rowFactor,
    columnFactor,
    rowLevels,
    columnLevels,
    cells,
    spread,
    note: describeInteraction(rowFactor, columnFactor, cells, spread),
  };
}

function describeInteraction(
  rowFactor: Factor,
  columnFactor: Factor,
  cells: InteractionCell[],
  spread: number | null,
): string | null {
  if (spread === null) return null;
  const means = cells.map((cell) => cell.mean).filter((value): value is number => value !== null);
  if (means.length < 4) return null;

  const overall = Math.max(...means) - Math.min(...means);
  if (overall === 0) return null;
  const share = (spread / overall) * 100;

  if (share < 15) {
    return `${columnFactor.name} does much the same thing at every level of ${rowFactor.name}, so the two can be read separately.`;
  }
  if (share < 40) {
    return `The effect of ${columnFactor.name} shifts somewhat across levels of ${rowFactor.name} — worth looking at the grid before quoting either on its own.`;
  }
  return `The effect of ${columnFactor.name} changes markedly depending on ${rowFactor.name}. There is no single "effect of ${columnFactor.name}" to report here; the grid is the result.`;
}
