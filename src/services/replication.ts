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
  /**
   * The number of independent observations — plots, not records. Several
   * readings taken down one strip are one plot's worth of information however
   * many times the clipboard was filled in.
   */
  n: number;
  /** How many records those plots were averaged from, for the honest footnote. */
  records: number;
  mean: number | null;
  /** Standard error of the mean; null when fewer than two observations. */
  se: number | null;
}

/**
 * What one independent observation is for this record.
 *
 * The experimental unit is whatever randomisation was applied to: a plot where
 * the trial has a layout, otherwise the treatment's replicate at a site. Two
 * records sharing a unit are sub-samples — six points measured along one strip,
 * or the same plot assessed twice — and averaging them before comparing
 * treatments is the difference between an honest standard error and one that
 * is too small by roughly the square root of however many samples were taken.
 *
 * When a trial has no plot and no replicate there is no unit to collapse to,
 * so every record stands alone. That is right for an observational comparison,
 * where five harvest runs really are five observations.
 */
function experimentalUnit(event: MeasurementEvent): string | null {
  // Keyed on the replicate rather than the plot number, even though the plot
  // is the friendlier label. Under either design a treatment appears once per
  // replicate at a site, so site + treatment + replicate identifies the same
  // piece of ground — and it identifies it for records taken before the trial
  // had a layout too. Keying on the plot would file those separately from the
  // ones taken after, splitting one plot's readings into two "observations".
  if (event.replicate === null) return null;
  return `${event.siteId ?? ""}:${event.armId ?? ""}:rep:${event.replicate}`;
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

  const byEvent = new Map<string, MeasurementEvent>(
    events.map((event) => [event.eventId, event]),
  );

  return active.map((arm) => {
    const empty = { armId: arm.armId, armName: arm.name, n: 0, records: 0, mean: null, se: null };
    if (!response) return empty;

    const mine = events.filter(
      (event) => event.armId === arm.armId && (!siteId || event.siteId === siteId),
    );
    const eventIds = new Set(mine.map((event) => event.eventId));

    // Collect every reading, keyed by the plot it came from.
    const perUnit = new Map<string, number[]>();
    const loose: number[] = [];
    let records = 0;
    for (const metric of metrics) {
      if (!eventIds.has(metric.eventId) || metric.metricName !== response) continue;
      const value = metricNumber(metric.value);
      if (value === null) continue;
      records += 1;
      const unit = experimentalUnit(byEvent.get(metric.eventId) as MeasurementEvent);
      if (unit === null) {
        loose.push(value);
        continue;
      }
      const bucket = perUnit.get(unit);
      if (bucket) bucket.push(value);
      else perUnit.set(unit, [value]);
    }

    // One number per plot, then compare across plots.
    const values = [
      ...[...perUnit.values()].map(
        (readings) => readings.reduce((sum, value) => sum + value, 0) / readings.length,
      ),
      ...loose,
    ];

    const n = values.length;
    if (n === 0) return { ...empty, records };
    const mean = values.reduce((sum, value) => sum + value, 0) / n;
    if (n < 2) return { armId: arm.armId, armName: arm.name, n, records, mean, se: null };
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
    return {
      armId: arm.armId,
      armName: arm.name,
      n,
      records,
      mean,
      se: Math.sqrt(variance / n),
    };
  });
}
