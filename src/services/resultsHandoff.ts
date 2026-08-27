// The trial's result, in a shape another tool can budget from.
//
// Fieldwork records what happened in a paddock. Working out whether it pays is
// a different kind of claim made from different inputs — a price, a season
// tonnage, a labour rate, none of which were observed here and all of which
// change without anybody walking a trial. The app used to do both, and doing
// both meant presenting a projection in the same voice as a measurement.
//
// So this is the seam. It exports the facts and stops: what was compared, what
// each treatment yielded, how many plots that came from, and how far each
// alternative sat from the control. What that is worth is somebody else's
// question.
//
// Deliberately not shaped for any particular tool. The app it is being handed
// to is not built yet, and a payload designed around an unbuilt contract would
// be wrong in a way nobody could see until it was too late to change. These
// are the numbers; a reader can arrange them.
//
// Crop-neutral for the same reason as everything else here. Nothing in the
// format knows what a potato is, and a haulm-destruction or irrigation trial
// exports through it unchanged.

import type {
  MeasurementEvent,
  Metric,
  PracticeArm,
  Site,
  Trial,
} from "../types";
import { plotAreaM2, weightUnit, yieldPerHectare } from "./plotArea";
import { responseSummary } from "./replication";

/**
 * A response already recorded per hectare, needing no plot area to convert.
 *
 * Without this the t_per_ha column came back empty for exactly the trials that
 * had done the arithmetic properly in the field — and a receiving tool keying
 * on that column would have silently got nothing from them. The seeded
 * nitrogen trial records in t/ha, which is how it was noticed.
 */
function alreadyPerHectare(unit: string): ((value: number) => number) | null {
  const cleaned = unit.trim().toLowerCase();
  if (cleaned === "t/ha") return (value) => value;
  if (cleaned === "kg/ha") return (value) => value / 1000;
  return null;
}

/** One treatment's result, at one site or across the whole trial. */
export interface HandoffRow {
  siteId: string | null;
  siteName: string;
  armId: string;
  armName: string;
  /**
   * Which arm everything is measured against. The control-plus-alternatives
   * pattern is the whole basis of a partial budget: a budget compares a change
   * to what is already being done, so a reader that cannot tell which row is
   * "already being done" cannot build one.
   */
  isControl: boolean;
  /** Plots contributing, after readings sharing an experimental unit are averaged. */
  plots: number;
  /** Individual readings behind those plots, which is not the same number. */
  readings: number;
  mean: number | null;
  standardError: number | null;
  unit: string;
  /**
   * Tonnes per hectare, where the unit is a weight and the plot has a size.
   * Null otherwise, and null rather than a guess: an assumed plot area would
   * put a fabricated yield into somebody's budget.
   */
  tonnesPerHectare: number | null;
  /** Difference from the control, in the response's own unit. */
  differenceFromControl: number | null;
  /** The same difference as t/ha, when both sides convert. */
  tonnesPerHectareDifference: number | null;
}

export interface Handoff {
  trialId: string;
  trialName: string;
  responseMetric: string;
  responseLabel: string;
  unit: string;
  plotAreaM2: number | null;
  rows: HandoffRow[];
}

const round = (value: number | null, places: number): number | null =>
  value === null || !Number.isFinite(value) ? null : Number(value.toFixed(places));

/**
 * Build the handoff, one row per treatment per site.
 *
 * Per site rather than pooled, because a partial budget is run for a farm and
 * two sites are two farms. A pooled row is offered as well — siteId null —
 * for a reader that wants the trial-wide answer, but it is never the only row:
 * averaging two sites into one number is exactly the move that makes a result
 * unusable to the person standing on one of them.
 */
export function buildHandoff(
  trial: Trial,
  sites: Site[],
  arms: PracticeArm[],
  events: MeasurementEvent[],
  metrics: Metric[],
  responseLabel: string,
  unit: string,
): Handoff {
  const trialSites = sites.filter((site) => site.trialId === trial.trialId);
  const area = plotAreaM2(trial);
  const weight = weightUnit(unit);
  const perHectare = alreadyPerHectare(unit);

  /** t/ha for one mean, whichever way this trial got there. */
  const toTPH = (value: number | null): number | null => {
    if (value === null) return null;
    if (perHectare) return perHectare(value);
    return weight ? yieldPerHectare(value, weight, area) : null;
  };

  const scopes: { siteId: string | null; siteName: string }[] = [
    { siteId: null, siteName: "All sites" },
    ...trialSites.map((site) => ({ siteId: site.siteId, siteName: site.location })),
  ];

  const rows: HandoffRow[] = [];
  for (const scope of scopes) {
    const stats = responseSummary(
      trial,
      arms,
      events,
      metrics,
      scope.siteId ?? undefined,
    );

    // The control is whichever arm the trial nominates, and it is looked up
    // per scope so a site that never recorded the control yields nulls rather
    // than silently comparing against a different arm.
    const controlArm = arms.find((arm) => arm.type === "control");
    const controlStat = stats.find((stat) => stat.armId === controlArm?.armId);
    const controlMean = controlStat?.mean ?? null;
    const controlTPH = toTPH(controlMean);

    for (const stat of stats) {
      const tph = toTPH(stat.mean);
      const isControl = stat.armId === controlArm?.armId;

      rows.push({
        siteId: scope.siteId,
        siteName: scope.siteName,
        armId: stat.armId,
        armName: stat.armName,
        isControl,
        plots: stat.n,
        readings: stat.records,
        mean: round(stat.mean, 3),
        standardError: round(stat.se, 4),
        unit,
        tonnesPerHectare: round(tph, 3),
        differenceFromControl:
          isControl || stat.mean === null || controlMean === null
            ? null
            : round(stat.mean - controlMean, 3),
        tonnesPerHectareDifference:
          isControl || tph === null || controlTPH === null ? null : round(tph - controlTPH, 3),
      });
    }
  }

  return {
    trialId: trial.trialId,
    trialName: trial.name,
    responseMetric: trial.responseMetric ?? "",
    responseLabel,
    unit,
    plotAreaM2: area,
    rows,
  };
}

const HEADERS = [
  "trial",
  "site",
  "treatment",
  "is_control",
  "plots",
  "readings",
  "mean",
  "standard_error",
  "unit",
  "t_per_ha",
  "difference_from_control",
  "t_per_ha_difference",
] as const;

/** Quote a cell only when it needs it — same rule as the full trial export. */
function cell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const num = (value: number | null): string => (value === null ? "" : String(value));

/**
 * The handoff as CSV.
 *
 * CSV rather than a JSON contract, on purpose. The receiving app does not
 * exist yet, so a bespoke payload would be a guess at an interface nobody has
 * designed; a table of results is something any tool can read and — more to
 * the point — something a person can open and check before trusting it.
 */
export function handoffCsv(handoff: Handoff): string {
  const lines = [HEADERS.join(",")];
  for (const row of handoff.rows) {
    lines.push(
      [
        cell(handoff.trialName),
        cell(row.siteName),
        cell(row.armName),
        row.isControl ? "yes" : "no",
        String(row.plots),
        String(row.readings),
        num(row.mean),
        num(row.standardError),
        cell(row.unit),
        num(row.tonnesPerHectare),
        num(row.differenceFromControl),
        num(row.tonnesPerHectareDifference),
      ].join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

export function handoffFileName(trial: Trial): string {
  const slug =
    trial.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "trial";
  return `${slug}-results.csv`;
}
