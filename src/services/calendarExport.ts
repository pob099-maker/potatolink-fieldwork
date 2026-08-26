// The trial's observations as a calendar file.
//
// This is the reminder, and it is deliberately not a notification system.
//
// Fieldwork is a static site with no server: nothing runs on a schedule,
// nothing can send. Building push would mean VAPID keys, a scheduler and an
// always-on component to maintain — a first for this project, and a poor trade
// for a feature nobody has yet asked for by name.
//
// A .ics file needs none of that. The grower imports it once and their own
// phone does the reminding, through the app they already check every morning,
// with their own notification settings and no account to create. The work
// moves to infrastructure that already exists on every phone in the country.
//
// What it costs: the file is a snapshot. Confirm a stage and the windows move,
// and the calendar is stale until it is exported again. A subscribable feed
// would fix that and needs the server this avoids, so instead the app is plain
// about which dates are estimates, and says when a re-export is worth doing.

import { format, parseISO } from "date-fns";
import type { DueItem } from "./timing";

/** RFC 5545 escaping: backslash, semicolon, comma and newline all carry meaning. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold to 75 octets per line, as the spec requires.
 *
 * Counted in bytes rather than characters: a trial name with a degree sign or
 * an en dash in it is multi-byte, and folding by character length produces a
 * line that is legal by eye and rejected by a parser.
 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  // A continuation line starts with a space, which costs one of its 75 octets.
  let limit = 75;

  for (const character of line) {
    const size = new TextEncoder().encode(character).length;
    if (currentBytes + size > limit) {
      out.push(current);
      current = character;
      currentBytes = size;
      limit = 74;
    } else {
      current += character;
      currentBytes += size;
    }
  }
  out.push(current);
  return out.join("\r\n ");
}

const stamp = (date: Date): string => format(date, "yyyyMMdd'T'HHmmss'Z'");
const dateOnly = (iso: string): string => format(parseISO(iso), "yyyyMMdd");

/** DTEND on an all-day event is exclusive, so a window ending on the 16th ends on the 17th. */
function exclusiveEnd(iso: string): string {
  const end = parseISO(iso);
  end.setDate(end.getDate() + 1);
  return format(end, "yyyyMMdd");
}

export interface CalendarOptions {
  /** Fixed clock for tests; defaults to now. */
  now?: Date;
  /** How many days before the window to raise the alarm. */
  remindDaysBefore?: number;
}

/**
 * One event per form per site, for everything that has a window.
 *
 * Items with no window are left out rather than added as "unscheduled" — a
 * calendar entry that says nothing is due is noise, and noise is how a
 * reminder gets muted.
 */
export function buildCalendar(
  items: DueItem[],
  options: CalendarOptions = {},
): string {
  const now = options.now ?? new Date();
  const remind = options.remindDaysBefore ?? 1;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PotatoLink//Fieldwork//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName(items))}`,
  ];

  for (const item of items) {
    const { window } = item;
    if (!window.from || !window.to) continue;

    const detail = [
      `Trial: ${item.trialName}`,
      `Site: ${item.siteName}`,
      window.estimated
        ? "This date is an estimate from the planting date. Confirm the growth stage in Fieldwork when it arrives and export the calendar again."
        : "Scheduled from a confirmed growth stage.",
    ].join("\n");

    lines.push(
      "BEGIN:VEVENT",
      // Stable, so re-importing updates the entry instead of duplicating it.
      `UID:${item.templateId}-${item.siteId}@fieldwork.potatolink`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${dateOnly(window.from)}`,
      `DTEND;VALUE=DATE:${exclusiveEnd(window.to)}`,
      `SUMMARY:${escapeText(`${item.formName} — ${item.siteName}`)}`,
      `DESCRIPTION:${escapeText(detail)}`,
      `LOCATION:${escapeText(item.siteName)}`,
      "STATUS:CONFIRMED",
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `TRIGGER:-P${remind}D`,
      `DESCRIPTION:${escapeText(`${item.formName} at ${item.siteName} is coming up`)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  // Fold at the end, once, over every line. Wrapping only the ones that look
  // like prose is how UID escaped: two UUIDs and a domain is 100 octets, well
  // past the limit, and it went out whole because nobody thinks of an id as
  // long text. Most parsers would cope. Somebody's phone in a paddock is not
  // where you want to find out which ones do not.
  //
  // CRLF throughout, per the spec, for the same reason.
  return lines.map(fold).join("\r\n") + "\r\n";
}

function calendarName(items: DueItem[]): string {
  const trials = new Set(items.map((item) => item.trialName));
  if (trials.size === 1) return `Fieldwork — ${[...trials][0]}`;
  return "Fieldwork observations";
}

export function calendarFileName(trialName: string): string {
  const safe = trialName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return `${safe || "fieldwork"}-observations.ics`;
}

/** Hands the file to the browser. Mirrors how the CSV export already works. */
export function downloadCalendar(fileName: string, contents: string): void {
  const blob = new Blob([contents], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
