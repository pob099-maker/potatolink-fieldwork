// Where a trial is in its life, and what that changes.
//
// The four states existed and nothing could set them: every trial was born a
// draft and stayed one, the lists showed all of them forever, and the removal
// card told you to "archive it instead" — a feature that did not exist. A
// trial with data in it had no exit at all.
//
// The distinction that matters is between finishing and hiding. Collection
// finishing is a fact about the trial: no more entries, but everyone should
// still see it, because that is when it is being analysed and written up.
// Hiding is a preference about a list, and it must never mean losing access —
// somebody looking up a closed trial two seasons later is the case this
// exists for.

import type { Trial, TrialStatus } from "../types";

export interface TrialState {
  value: TrialStatus;
  label: string;
  /** What choosing this actually does, in the app rather than in the abstract. */
  detail: string;
}

export const TRIAL_STATES: TrialState[] = [
  {
    value: "draft",
    label: "Draft",
    detail: "Still being set up. It can take entries, so a test run is fine.",
  },
  {
    value: "active",
    label: "Active",
    detail: "Running. It shows up first for whoever is recording in the field.",
  },
  {
    value: "completed",
    label: "Collection finished",
    detail:
      "No more entries. It stays in the list and everything about it stays readable — this is the state to analyse and write up in.",
  },
  {
    value: "archived",
    label: "Archived",
    detail:
      "Out of the way. Hidden from the lists unless you ask for it, and still fully readable when you do — results, economics and the CSV export all keep working.",
  },
];

/** Whether new observations can still be recorded against this trial. */
export function canRecord(trial: Pick<Trial, "status">): boolean {
  return trial.status === "draft" || trial.status === "active";
}

/**
 * Why recording has stopped, for saying so rather than failing quietly. Null
 * while the trial is still collecting.
 */
export function closedReason(trial: Pick<Trial, "status">): string | null {
  if (trial.status === "completed") {
    return "Collection has finished for this trial, so no more entries can be added. Everything already recorded is still here.";
  }
  if (trial.status === "archived") {
    return "This trial has been archived, so no more entries can be added. Everything already recorded is still here.";
  }
  return null;
}

/** Archived trials are the only ones a list hides, and only until asked. */
export const isHidden = (trial: Pick<Trial, "status">): boolean => trial.status === "archived";

/**
 * The trials a list should show. Completed ones stay: a trial being written up
 * is exactly the one somebody is looking for, and hiding it would be a
 * surprise dressed up as tidiness.
 */
export function visibleTrials<T extends Pick<Trial, "status">>(
  trials: T[],
  showArchived: boolean,
): T[] {
  return showArchived ? trials : trials.filter((trial) => !isHidden(trial));
}

/** How many are being kept out of the way, for offering them back. */
export const hiddenCount = (trials: Array<Pick<Trial, "status">>): number =>
  trials.filter(isHidden).length;
