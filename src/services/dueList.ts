// Turning trials, sites and forms into "what needs doing".
//
// Kept apart from timing.ts so that file stays a pure calculation over dates
// with no idea what a trial is. This is the part that knows the domain: which
// forms have a schedule, which sites they run at, and what counts as already
// recorded.

import type { FormTemplate, MeasurementEvent, Site, Trial } from "../types";
import { canRecord, isHidden } from "./lifecycle";
import { DEFAULT_STAGES, type GrowthStage } from "./growthStages";
import { observationWindow, sortByUrgency, type DueItem } from "./timing";

export interface DueListInput {
  trials: Trial[];
  sites: Site[];
  templates: FormTemplate[];
  events: MeasurementEvent[];
  today: string;
  stages?: GrowthStage[];
}

/**
 * Every scheduled form at every site, worst first.
 *
 * Three things are deliberately left out:
 *
 * - Forms with no timing. Most forms have none, and listing them as
 *   "unscheduled" would bury the handful that are actually due.
 * - Archived trials, and any trial that has stopped taking entries. Nagging
 *   somebody to record against a closed trial is worse than saying nothing.
 * - Trial-level forms with no site. Timing hangs off a planting date, and a
 *   planting date belongs to a paddock.
 */
export function buildDueList(input: DueListInput): DueItem[] {
  const { trials, sites, templates, events, today } = input;
  const stages = input.stages ?? DEFAULT_STAGES;

  const trialById = new Map(trials.map((trial) => [trial.trialId, trial]));
  const items: DueItem[] = [];

  for (const template of templates) {
    if (!template.timing) continue;
    if (!template.requiresSite) continue;

    const trial = trialById.get(template.trialId);
    if (!trial || isHidden(trial) || !canRecord(trial)) continue;

    for (const site of sites) {
      if (site.trialId !== template.trialId) continue;

      // What has already been recorded here for this form. Matched on event
      // type rather than template id because that is what a record carries —
      // and because two forms of the same type are the same visit.
      const recordedDates = events
        .filter(
          (event) =>
            event.siteId === site.siteId &&
            event.eventType === template.eventType &&
            (event.trialId === null || event.trialId === template.trialId),
        )
        .map((event) => event.eventDate.slice(0, 10));

      items.push({
        templateId: template.templateId,
        formName: template.name,
        siteId: site.siteId,
        siteName: site.location,
        trialId: trial.trialId,
        trialName: trial.name,
        window: observationWindow({
          timing: template.timing,
          stages,
          plantingDate: site.plantingDate,
          stageDates: site.stageDates ?? {},
          recordedDates,
          today,
        }),
      });
    }
  }

  return sortByUrgency(items);
}

/** Today as a plain date, in the device's own timezone — the one the grower is standing in. */
export const todayIso = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
