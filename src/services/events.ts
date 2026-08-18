// Working out which trial a record belongs to, and describing it in plain
// language for the trial page and dashboard.

import type { FormTemplate, MeasurementEvent, Metric, PracticeArm, Site } from "../types";

/**
 * The trial a record belongs to. New records carry it directly; older ones
 * are resolved through their site or arm, so nothing recorded before the
 * trial reference existed goes missing from the lists.
 */
export function resolveTrialId(
  event: MeasurementEvent,
  sites: Site[],
  arms: PracticeArm[],
): string | null {
  if (event.trialId) return event.trialId;
  if (event.siteId) {
    const site = sites.find((candidate) => candidate.siteId === event.siteId);
    if (site) return site.trialId;
  }
  if (event.armId) {
    const arm = arms.find((candidate) => candidate.armId === event.armId);
    if (arm) return arm.trialId;
  }
  return null;
}

export function eventsForTrial(
  events: MeasurementEvent[],
  trialId: string,
  sites: Site[],
  arms: PracticeArm[],
): MeasurementEvent[] {
  return events.filter((event) => resolveTrialId(event, sites, arms) === trialId);
}

/** The form a record came from, matched on its event type. */
export function templateForEvent(
  event: MeasurementEvent,
  templates: FormTemplate[],
): FormTemplate | undefined {
  return templates.find((template) => template.eventType === event.eventType);
}

/** Plain-language name for a record: its form's name, else its event type. */
export function describeEvent(event: MeasurementEvent, templates: FormTemplate[]): string {
  const template = templateForEvent(event, templates);
  if (template) return template.name;
  return event.eventType.replace(/_/g, " ");
}

/** Where a record applies: a site name, or the whole trial. */
export function describeEventScope(event: MeasurementEvent, sites: Site[]): string {
  if (!event.siteId) return "Whole trial";
  return sites.find((site) => site.siteId === event.siteId)?.location ?? "Unknown site";
}

export interface RecentEntry {
  event: MeasurementEvent;
  /** A short, readable summary of what was recorded. */
  summary: string;
}

/**
 * The last few entries recorded at a site, newest first — what a grower sees
 * to confirm their run went in. Media metrics are left out of the summary;
 * they add length without telling anyone whether the right numbers landed.
 */
export function recentEntriesAtSite(
  events: MeasurementEvent[],
  metrics: Metric[],
  trialId: string,
  siteId: string,
  limit = 5,
): RecentEntry[] {
  return events
    .filter((event) => event.trialId === trialId && event.siteId === siteId)
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate))
    .slice(0, limit)
    .map((event) => {
      const summary = metrics
        .filter((metric) => metric.eventId === event.eventId && !metric.photoUrl)
        .slice(0, 3)
        .map((metric) => {
          // Booleans are stored as strings; show them the way they were asked.
          if (metric.value === "true") return "Yes";
          if (metric.value === "false") return "No";
          return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
        })
        .join(" · ");
      return { event, summary };
    });
}
