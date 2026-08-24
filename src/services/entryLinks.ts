// Entry links and per-site summaries.
//
// A grower's entry link names the site, so a run can never be filed against
// the wrong one. It names the practice too, unless the trial has a plot
// layout — then the plot the grower taps decides the practice, and one link
// per site is all that is needed. Staff copy these from the trial page rather
// than hand-building them.

import type { MeasurementEvent, Metric } from "../types";

export function buildEntryPath(
  trialId: string,
  siteId: string,
  armId: string | null,
  /**
   * The shared entry code. Carried in the link so the person who was sent it
   * taps once and starts recording — a link and a separate code are two things
   * to get right in a paddock, and the code is the one that goes missing.
   * Nothing is given away: it is a VITE_ value, already in the bundle.
   */
  code?: string,
): string {
  const query = new URLSearchParams(armId ? { site: siteId, arm: armId } : { site: siteId });
  if (code) query.set("code", code);
  return `/trials/${trialId}/entry?${query.toString()}`;
}

/**
 * Absolute link to hand out. `base` is the app's deployment base path
 * (import.meta.env.BASE_URL), which may be "/" or "/potatolink-fieldwork/".
 *
 * The route goes after the # so the whole path is a real page on the server:
 * an emailed link never returns a 404, whichever static host serves the app.
 */
export function buildEntryUrl(
  origin: string,
  base: string,
  trialId: string,
  siteId: string,
  armId: string | null,
  code?: string,
): string {
  const path = buildEntryPath(trialId, siteId, armId, code);
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${origin}${prefix}#${path}`;
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
