// Working out which trial a record belongs to, and describing it in plain
// language for the trial page and dashboard.

import type { FormTemplate, MeasurementEvent, PracticeArm, Site } from "../types";

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
