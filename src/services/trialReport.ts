// Block variation, for the written-up report.
//
// The treatment means answer "did the treatments differ". This answers the
// question a reviewer asks straight after: "was the ground even?" Blocking
// exists to absorb a gradient, and whether it absorbed anything is visible in
// how far apart the block means sit.
//
// It is deliberately descriptive. A proper analysis partitions the variance
// and tests it; this reports the block means and the spread between them, says
// what that suggests, and stops. Anything stronger would be the significance
// test the app has promised not to invent.

import type { MeasurementEvent, Metric, Trial } from "../types";

export interface BlockStat {
  /** Block number, as painted on the pegs. */
  block: number;
  /** Independent plots contributing, after sub-samples are averaged. */
  n: number;
  mean: number | null;
}

export interface BlockVariation {
  blocks: BlockStat[];
  /** Mean across every plot in the trial, whatever block it sat in. */
  overallMean: number | null;
  /** Highest block mean minus lowest, in the response's own units. */
  spread: number | null;
  /** The spread as a percentage of the overall mean. */
  spreadPercent: number | null;
  /** One sentence a reader can put in a report, or null when there is nothing to say. */
  note: string | null;
}

const numeric = (value: Metric["value"]): number | null =>
  typeof value === "number" ? value : null;

/**
 * Mean of the response per block.
 *
 * Sub-samples are collapsed the same way the treatment means collapse them —
 * per plot, then across plots — so the two summaries in one report cannot
 * disagree about how many observations there were.
 */
export function blockVariation(
  trial: Trial,
  events: MeasurementEvent[],
  metrics: Metric[],
  siteId?: string,
): BlockVariation {
  const empty: BlockVariation = {
    blocks: [],
    overallMean: null,
    spread: null,
    spreadPercent: null,
    note: null,
  };

  const response = trial.responseMetric;
  if (!response || trial.design !== "replicated") return empty;

  const mine = events.filter(
    (event) => event.replicate !== null && (!siteId || event.siteId === siteId),
  );
  const byEvent = new Map(mine.map((event) => [event.eventId, event]));

  // plot key -> readings, so several records in one plot become one number.
  const perPlot = new Map<string, { block: number; readings: number[] }>();
  for (const metric of metrics) {
    const event = byEvent.get(metric.eventId);
    if (!event || metric.metricName !== response) continue;
    const value = numeric(metric.value);
    if (value === null) continue;
    const key = `${event.siteId ?? ""}:${event.armId ?? ""}:rep:${event.replicate}`;
    const bucket = perPlot.get(key);
    if (bucket) bucket.readings.push(value);
    else perPlot.set(key, { block: event.replicate as number, readings: [value] });
  }

  if (perPlot.size === 0) return empty;

  const byBlock = new Map<number, number[]>();
  for (const { block, readings } of perPlot.values()) {
    const plotMean = readings.reduce((sum, value) => sum + value, 0) / readings.length;
    const bucket = byBlock.get(block);
    if (bucket) bucket.push(plotMean);
    else byBlock.set(block, [plotMean]);
  }

  const blocks: BlockStat[] = [...byBlock.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([block, values]) => ({
      block,
      n: values.length,
      mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    }));

  const allPlots = [...byBlock.values()].flat();
  const overallMean = allPlots.reduce((sum, value) => sum + value, 0) / allPlots.length;

  const means = blocks.map((entry) => entry.mean as number);
  const spread = means.length > 1 ? Math.max(...means) - Math.min(...means) : null;
  const spreadPercent =
    spread !== null && overallMean !== 0 ? (spread / Math.abs(overallMean)) * 100 : null;

  return { blocks, overallMean, spread, spreadPercent, note: describe(blocks, spreadPercent) };
}

/**
 * The spread in words.
 *
 * The thresholds are rules of thumb, and the wording says so — "suggests"
 * rather than "shows". They are here so a report does not have to leave a
 * reader staring at four numbers wondering whether they are far apart.
 */
function describe(blocks: BlockStat[], spreadPercent: number | null): string | null {
  if (blocks.length < 2 || spreadPercent === null) return null;
  const highest = blocks.reduce((a, b) => ((b.mean ?? 0) > (a.mean ?? 0) ? b : a));
  const lowest = blocks.reduce((a, b) => ((b.mean ?? 0) < (a.mean ?? 0) ? b : a));
  const gap = `Block ${highest.block} is the strongest and block ${lowest.block} the weakest`;

  if (spreadPercent < 5) {
    return `${gap}, but only ${spreadPercent.toFixed(1)}% apart — the ground looks even, and blocking has cost little.`;
  }
  if (spreadPercent < 15) {
    return `${gap}, ${spreadPercent.toFixed(1)}% apart. A gradient of that size is what blocking is for, and it has been kept out of the treatment comparison.`;
  }
  return `${gap}, ${spreadPercent.toFixed(1)}% apart. That is a large gradient; worth checking the paddock notes for what changes across it before reading much into small treatment differences.`;
}
