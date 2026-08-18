// Entry links and per-site summaries.
//
// A grower's entry link always names both the site and the arm, so a run can
// never be filed against the wrong site. Staff copy these links from the trial
// page rather than hand-building them.

import type { MeasurementEvent, Metric } from "../types";

export function buildEntryPath(trialId: string, siteId: string, armId: string): string {
  const query = new URLSearchParams({ site: siteId, arm: armId });
  return `/trials/${trialId}/entry?${query.toString()}`;
}

/**
 * Absolute link to hand out. `base` is the app's deployment base path
 * (import.meta.env.BASE_URL), which may be "/" or "/potatolink-fieldwork/".
 */
export function buildEntryUrl(
  origin: string,
  base: string,
  trialId: string,
  siteId: string,
  armId: string,
): string {
  const path = buildEntryPath(trialId, siteId, armId);
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${origin}${prefix}${path}`;
}

export interface ArmSummary {
  entryCount: number;
  totalTonnes: number;
  totalHours: number;
  /** Tonnes per hour, or null when either figure is missing. */
  throughput: number | null;
}

/**
 * Summarise one arm's collected data, optionally narrowed to a single site.
 * Passing no siteId gives the trial-wide figures.
 */
export function summariseArm(
  events: MeasurementEvent[],
  metrics: Metric[],
  armId: string,
  siteId?: string,
): ArmSummary {
  const armEvents = events.filter(
    (event) => event.armId === armId && (!siteId || event.siteId === siteId),
  );
  const eventIds = new Set(armEvents.map((event) => event.eventId));

  const sumOf = (metricName: string): number =>
    metrics
      .filter((metric) => eventIds.has(metric.eventId) && metric.metricName === metricName)
      .map((metric) => Number(metric.value))
      .filter((value) => Number.isFinite(value))
      .reduce((total, value) => total + value, 0);

  const totalTonnes = sumOf("tonnesHandled");
  const totalHours = sumOf("runDuration");
  return {
    entryCount: armEvents.length,
    totalTonnes,
    totalHours,
    throughput: totalTonnes > 0 && totalHours > 0 ? totalTonnes / totalHours : null,
  };
}
