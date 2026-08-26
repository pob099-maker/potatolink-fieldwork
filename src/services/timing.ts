// When an observation is expected, and whether it has happened.
//
// The whole design turns on one thing: the app must not pretend to know when
// tuber initiation is. It knows when the crop went in, it knows roughly how
// long a stage usually takes, and it knows what somebody told it. Those are
// three different qualities of information and the app says which one it is
// working from, because a window presented as fact and a window presented as
// an estimate lead to different decisions in a paddock.
//
// The order of preference is therefore:
//
//   1. A confirmed stage date. Somebody stood in the crop and said "it is
//      happening now". Nothing beats that, and everything hung off that stage
//      re-anchors to it.
//   2. Planting date plus a day count. An estimate, labelled as one.
//   3. Nothing. Say so, rather than guessing from the trial's created date —
//      a trial set up in July for an October planting would be three months
//      out, and confidently.
//
// Everything here is pure and takes `today` as an argument, so the behaviour
// on the day a window opens is a test rather than something you wait for.

import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { findStage, type GrowthStage } from "./growthStages";

/** When a form is meant to be filled in, relative to the crop rather than the calendar. */
export interface Timing {
  /** Stage this hangs off, or null to count days from planting directly. */
  stage: string | null;
  /**
   * Days after the anchor. Null falls back to the stage's own typical window,
   * which is the usual case — most forms are simply "at tuber initiation".
   * Set them to shift off a stage: emergence with 12–16 is "about a fortnight
   * after the crop is up".
   */
  dapFrom: number | null;
  dapTo: number | null;
}

export type TimingStatus = "unscheduled" | "notYet" | "due" | "overdue" | "recorded";

export interface ObservationWindow {
  status: TimingStatus;
  /** Inclusive ISO dates, or null when nothing can be worked out. */
  from: string | null;
  to: string | null;
  /**
   * True when the window came from planting date plus a day count rather than
   * from a stage somebody confirmed. Surfaced everywhere it is shown.
   */
  estimated: boolean;
  /** Why there is no window, in words a grower would use. Null when there is one. */
  reason: string | null;
  /** Days until the window opens (negative once it has), or null. */
  daysUntil: number | null;
}

const asDate = (iso: string): Date => parseISO(iso);
const asIso = (date: Date): string => format(date, "yyyy-MM-dd");

export interface WindowInput {
  timing: Timing | null;
  stages: GrowthStage[];
  /** The site's planting date — the one date everybody actually knows. */
  plantingDate: string | null;
  /** Stage id → the date it was confirmed to have arrived at this site. */
  stageDates: Record<string, string>;
  /** Dates this form has already been recorded at this site. */
  recordedDates: string[];
  today: string;
}

/**
 * One form at one site: when it is expected, and where that stands today.
 *
 * Per site rather than per trial, because two sites planted a fortnight apart
 * are two schedules. The app already randomises each site's layout separately
 * for the same reason — sites are not copies of each other.
 */
export function observationWindow(input: WindowInput): ObservationWindow {
  const { timing, stages, plantingDate, stageDates, recordedDates, today } = input;

  const nothing = (reason: string): ObservationWindow => ({
    status: "unscheduled",
    from: null,
    to: null,
    estimated: false,
    reason,
    daysUntil: null,
  });

  if (!timing || (timing.stage === null && timing.dapFrom === null)) {
    return nothing("No timing set for this form.");
  }

  const stage = findStage(stages, timing.stage);
  const confirmed = timing.stage ? (stageDates[timing.stage] ?? null) : null;

  // Day counts are always an offset from the anchor, never a replacement for
  // it. Where the anchor is is the only thing that changes.
  const shiftFrom = timing.dapFrom ?? 0;
  const shiftTo = timing.dapTo ?? shiftFrom;

  let from: string;
  let to: string;
  let estimated: boolean;

  if (confirmed) {
    // The stage has arrived, so the offsets run from the real date. A form due
    // "at tuber initiation" with no offsets is due the day it was confirmed —
    // not thirty-five days later.
    from = asIso(addDays(asDate(confirmed), shiftFrom));
    to = asIso(addDays(asDate(confirmed), shiftTo));
    estimated = false;
  } else if (plantingDate && stage) {
    // The stage has not arrived, so where it *will* be is itself a guess. The
    // window is the stage's own spread plus the offset, which is wide on
    // purpose: "harvest, then within three weeks" genuinely is a two-month
    // window until somebody says harvest has happened.
    //
    // Adding them rather than letting the offset replace the stage's window is
    // the whole point. Treating "harvest + 0 to 21 days" as "0 to 21 days
    // after planting" put a harvest form three months early and marked it
    // overdue while the crop was still bulking.
    from = asIso(addDays(asDate(plantingDate), stage.dapFrom + shiftFrom));
    to = asIso(addDays(asDate(plantingDate), stage.dapTo + shiftTo));
    estimated = true;
  } else if (plantingDate && timing.dapFrom !== null) {
    // No stage: the day counts are measured from planting directly.
    from = asIso(addDays(asDate(plantingDate), timing.dapFrom));
    to = asIso(addDays(asDate(plantingDate), timing.dapTo ?? timing.dapFrom));
    estimated = true;
  } else if (plantingDate) {
    return nothing("This form has a stage but no day count, and the stage has not been confirmed.");
  } else {
    return nothing("No planting date recorded for this site.");
  }

  // Anything recorded on or after the window opened counts as the visit
  // having happened. Whether every plot was covered is a different question,
  // and the replication card already answers it — saying it twice, in two
  // slightly different ways, is how the two come to disagree.
  const recorded = recordedDates.some((date) => date >= from);
  const daysUntil = differenceInCalendarDays(asDate(from), asDate(today));

  let status: TimingStatus;
  if (recorded) status = "recorded";
  else if (today < from) status = "notYet";
  else if (today <= to) status = "due";
  else status = "overdue";

  return { status, from, to, estimated, reason: null, daysUntil };
}

/** How each status sorts when several are shown together: worst first. */
const URGENCY: Record<TimingStatus, number> = {
  overdue: 0,
  due: 1,
  notYet: 2,
  unscheduled: 3,
  recorded: 4,
};

export interface DueItem {
  templateId: string;
  formName: string;
  siteId: string;
  siteName: string;
  trialId: string;
  trialName: string;
  window: ObservationWindow;
}

export function sortByUrgency(items: DueItem[]): DueItem[] {
  return [...items].sort((a, b) => {
    const byStatus = URGENCY[a.window.status] - URGENCY[b.window.status];
    if (byStatus !== 0) return byStatus;
    // Within a status, the one whose window opened longest ago comes first.
    return (a.window.from ?? "").localeCompare(b.window.from ?? "");
  });
}

/** Just the ones worth interrupting somebody about. */
export const needsAttention = (items: DueItem[]): DueItem[] =>
  items.filter((item) => item.window.status === "due" || item.window.status === "overdue");

/**
 * The window in words, for the one line somebody reads before deciding
 * whether to drive out.
 */
export function describeWindow(window: ObservationWindow, today: string): string {
  if (window.status === "unscheduled") return window.reason ?? "Not scheduled.";
  if (!window.from || !window.to) return "Not scheduled.";

  const nice = (iso: string) => format(parseISO(iso), "d MMM");
  // "to" rather than a dash: the line already uses an em dash as its own
  // separator, and two kinds of dash in one short sentence read as a typo at
  // phone size.
  const span = window.from === window.to ? nice(window.from) : `${nice(window.from)} to ${nice(window.to)}`;
  const hedge = window.estimated ? "estimated " : "";

  if (window.status === "recorded") return `Recorded. Window was ${span}.`;

  if (window.status === "notYet") {
    const days = window.daysUntil ?? 0;
    const when = days === 1 ? "tomorrow" : `in ${days} days`;
    return `Due ${when} — ${hedge}${span}.`;
  }

  if (window.status === "due") return `Due now — ${hedge}${span}.`;

  const over = differenceInCalendarDays(parseISO(today), parseISO(window.to));
  const late = over === 1 ? "a day" : `${over} days`;
  return `${over > 0 ? `${late} past the window` : "Past the window"} — ${hedge}${span}.`;
}
