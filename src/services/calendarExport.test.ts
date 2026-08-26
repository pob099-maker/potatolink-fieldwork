import { describe, expect, it } from "vitest";
import { buildCalendar, calendarFileName } from "./calendarExport";
import type { DueItem } from "./timing";

const item = (overrides: Partial<DueItem> = {}): DueItem => ({
  templateId: "tpl-1",
  formName: "Plot yield record",
  siteId: "site-1",
  siteName: "Mallee block",
  trialId: "trial-1",
  trialName: "Nitrogen Rate Response Trial",
  window: {
    status: "due",
    from: "2026-10-06",
    to: "2026-10-16",
    estimated: true,
    reason: null,
    daysUntil: 0,
  },
  ...overrides,
});

const CRLF = "\r\n";
const NOW = new Date("2026-09-01T00:00:00Z");
const build = (items: DueItem[]) => buildCalendar(items, { now: NOW });

describe("buildCalendar", () => {
  it("wraps events in a valid calendar envelope", () => {
    const ics = build([item()]);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
  });

  it("uses CRLF line endings everywhere", () => {
    const ics = build([item()]);
    // Every newline must be preceded by a carriage return.
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it("makes the end date exclusive, as all-day events require", () => {
    const ics = build([item()]);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261006");
    // Window closes on the 16th, so the event ends on the 17th.
    expect(ics).toContain("DTEND;VALUE=DATE:20261017");
  });

  it("gives each event a stable id so re-importing updates rather than duplicates", () => {
    expect(build([item()])).toContain("UID:tpl-1-site-1@fieldwork.potatolink");
  });

  it("says in the event when the date is only an estimate", () => {
    expect(build([item()])).toContain("estimate from the planting date");
  });

  it("does not hedge once the stage is confirmed", () => {
    const confirmed = item({
      window: { ...item().window, estimated: false },
    });
    const ics = build([confirmed]);
    expect(ics).toContain("confirmed growth stage");
    expect(ics).not.toContain("estimate from the planting date");
  });

  it("leaves out anything with no window", () => {
    const unscheduled = item({
      window: {
        status: "unscheduled",
        from: null,
        to: null,
        estimated: false,
        reason: "No planting date recorded for this site.",
        daysUntil: null,
      },
    });
    const ics = build([unscheduled]);
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("carries an alarm ahead of the window", () => {
    const ics = buildCalendar([item()], { now: NOW, remindDaysBefore: 3 });
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-P3D");
  });

  it("escapes the characters that carry meaning in the format", () => {
    const awkward = item({ trialName: "Nitrogen; rate, trial\\2026" });
    const ics = build([awkward]);
    expect(ics).toContain("Nitrogen\\; rate\\, trial\\\\2026");
  });

  it("folds the UID, which real ids blow straight past", () => {
    // Two UUIDs plus a domain is 100 octets. The earlier fold test passed on a
    // fixture with ids like "tpl-1", which is exactly the wrong thing to test
    // folding against.
    const real = item({
      templateId: "5f0a6c1e-0006-4000-8000-000000000002",
      siteId: "5f0a6c1e-0003-4000-8000-000000000003",
    });
    const ics = build([real]);
    for (const line of ics.split(CRLF)) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    // Folded, but still one logical value once unfolded again.
    expect(ics.split(CRLF + " ").join("")).toContain(
      "UID:5f0a6c1e-0006-4000-8000-000000000002-5f0a6c1e-0003-4000-8000-000000000003@fieldwork.potatolink",
    );
  });

  it("folds long lines to 75 octets", () => {
    const long = item({
      formName: "A very long form name ".repeat(8),
    });
    const ics = build([long]);
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("folds by bytes, not characters, so multi-byte names stay legal", () => {
    const wide = item({ formName: "—".repeat(60) });
    const ics = build([wide]);
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("names the calendar after the trial when there is only one", () => {
    expect(build([item()])).toContain("X-WR-CALNAME:Fieldwork — Nitrogen Rate Response Trial");
  });

  it("uses a general name when several trials are in the file", () => {
    const ics = build([item(), item({ trialName: "Another trial", templateId: "tpl-2" })]);
    expect(ics).toContain("X-WR-CALNAME:Fieldwork observations");
  });

  it("writes one event per form per site", () => {
    const ics = build([item(), item({ siteId: "site-2", siteName: "River paddock" })]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});

describe("calendarFileName", () => {
  it("makes a safe file name from the trial name", () => {
    expect(calendarFileName("Nitrogen Rate Response Trial")).toBe(
      "nitrogen-rate-response-trial-observations.ics",
    );
  });

  it("copes with a name that is all punctuation", () => {
    expect(calendarFileName("!!!")).toBe("fieldwork-observations.ics");
  });
});
