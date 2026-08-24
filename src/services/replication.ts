// Pure analysis helpers for replicated trials: is the design filled in, and
// what does the response variable look like per treatment. These describe the
// data; they never assert a statistical difference — that is the biometrician's
// job (see docs/replicated-trials-design.md).

import { metricNumber } from "./metricValue";
import type { MeasurementEvent, Metric, PracticeArm, Site, Trial } from "../types";

export interface PlotCell {
  armId: string;
  replicate: number;
  recorded: boolean;
  /**
   * The plot number this cell stands for, once the trial has a layout. R2 is
   * bookkeeping; the peg in the paddock says 7, and that is what somebody
   * chasing a missing record has to tell the person walking the trial.
   */
  plotNumber: number | null;
}

export interface SiteCompleteness {
  siteId: string;
  siteName: string;
  recorded: number;
  expected: number;
  cells: PlotCell[];
}

export interface Completeness {
  recorded: number;
  expected: number;
  sites: SiteCompleteness[];
}

/**
 * For a replicated trial, which treatment × replicate plots are recorded at
 * each site. A plot is "recorded" if any field record exists for that arm,
 * site and replicate.
 */
export function replicationStatus(
  trial: Trial,
  arms: PracticeArm[],
  sites: Site[],
  events: MeasurementEvent[],
  /** Plot numbers per site, from the layout, keyed `siteId:armId:replicate`. */
  plotNumbers: Map<string, number> = new Map(),
): Completeness {
  const active = arms.filter((arm) => !arm.archived).sort((a, b) => a.sortOrder - b.sortOrder);
  const reps = Math.max(0, trial.replicates);
  const siteResults: SiteCompleteness[] = sites.map((site) => {
    const cells: PlotCell[] = [];
    let recorded = 0;
    for (const arm of active) {
      for (let rep = 1; rep <= reps; rep += 1) {
        const has = events.some(
          (event) =>
            event.siteId === site.siteId &&
            event.armId === arm.armId &&
            event.replicate === rep,
        );
        if (has) recorded += 1;
        cells.push({
          armId: arm.armId,
          replicate: rep,
          recorded: has,
          plotNumber: plotNumbers.get(`${site.siteId}:${arm.armId}:${rep}`) ?? null,
        });
      }
    }
    return {
      siteId: site.siteId,
      siteName: site.location,
      recorded,
      expected: active.length * reps,
      cells,
    };
  });
  return {
    recorded: siteResults.reduce((total, site) => total + site.recorded, 0),
    expected: siteResults.reduce((total, site) => total + site.expected, 0),
    sites: siteResults,
  };
}

export interface TreatmentStat {
  armId: string;
  armName: string;
  n: number;
  mean: number | null;
  /** Standard error of the mean; null when fewer than two observations. */
  se: number | null;
}

/**
 * Mean ± standard error of the trial's response variable per treatment,
 * optionally narrowed to one site. Descriptive only.
 */
export function responseSummary(
  trial: Trial,
  arms: PracticeArm[],
  events: MeasurementEvent[],
  metrics: Metric[],
  siteId?: string,
): TreatmentStat[] {
  const response = trial.responseMetric;
  const active = arms.filter((arm) => !arm.archived).sort((a, b) => a.sortOrder - b.sortOrder);

  return active.map((arm) => {
    if (!response) return { armId: arm.armId, armName: arm.name, n: 0, mean: null, se: null };
    const eventIds = new Set(
      events
        .filter(
          (event) => event.armId === arm.armId && (!siteId || event.siteId === siteId),
        )
        .map((event) => event.eventId),
    );
    const values = metrics
      .filter((metric) => eventIds.has(metric.eventId) && metric.metricName === response)
      .map((metric) => metricNumber(metric.value))
      .filter((value): value is number => value !== null);

    const n = values.length;
    if (n === 0) return { armId: arm.armId, armName: arm.name, n, mean: null, se: null };
    const mean = values.reduce((sum, value) => sum + value, 0) / n;
    if (n < 2) return { armId: arm.armId, armName: arm.name, n, mean, se: null };
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
    return { armId: arm.armId, armName: arm.name, n, mean, se: Math.sqrt(variance / n) };
  });
}
