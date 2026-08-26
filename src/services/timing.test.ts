import { describe, expect, it } from "vitest";
import { DEFAULT_STAGES } from "./growthStages";
import {
  describeWindow,
  needsAttention,
  observationWindow,
  sortByUrgency,
  type DueItem,
  type WindowInput,
} from "./timing";

const base: WindowInput = {
  timing: { stage: "tuberInitiation", dapFrom: null, dapTo: null },
  stages: DEFAULT_STAGES,
  plantingDate: "2026-09-01",
  stageDates: {},
  recordedDates: [],
  today: "2026-09-01",
};

const at = (overrides: Partial<WindowInput>) => observationWindow({ ...base, ...overrides });

describe("observationWindow", () => {
  it("estimates from the planting date when the stage has not arrived", () => {
    // Tuber initiation is 35–45 days after planting by default.
    const window = at({ today: "2026-09-10" });
    expect(window.from).toBe("2026-10-06");
    expect(window.to).toBe("2026-10-16");
    expect(window.estimated).toBe(true);
    expect(window.status).toBe("notYet");
  });

  it("says nothing at all rather than guessing without a planting date", () => {
    const window = at({ plantingDate: null });
    expect(window.status).toBe("unscheduled");
    expect(window.from).toBeNull();
    expect(window.reason).toMatch(/no planting date/i);
  });

  it("re-anchors to a confirmed stage date and stops calling it an estimate", () => {
    // The crop ran three weeks late. Confirming it moves the window to now
    // rather than leaving it 35 days after the confirmation.
    const window = at({
      stageDates: { tuberInitiation: "2026-11-05" },
      today: "2026-11-05",
    });
    expect(window.from).toBe("2026-11-05");
    expect(window.estimated).toBe(false);
    expect(window.status).toBe("due");
  });

  it("treats a day count against a stage as an offset from it", () => {
    // "About a fortnight after the crop is up."
    const window = at({
      timing: { stage: "emergence", dapFrom: 12, dapTo: 16 },
      stageDates: { emergence: "2026-09-20" },
      today: "2026-10-02",
    });
    expect(window.from).toBe("2026-10-02");
    expect(window.to).toBe("2026-10-06");
    expect(window.status).toBe("due");
  });

  it("adds the offset to the stage's own window while the stage is unconfirmed", () => {
    // "At harvest, then within three weeks." Harvest is 120–150 days after
    // planting, so before it is confirmed the honest window is 120–171 —
    // not 0–21, which is what it was, putting a harvest form three months
    // early and marking it overdue mid-season.
    const window = at({
      timing: { stage: "harvest", dapFrom: 0, dapTo: 21 },
      plantingDate: "2026-09-01",
      today: "2026-09-20",
    });
    expect(window.from).toBe("2026-12-30"); // planting + 120
    expect(window.to).toBe("2027-02-19"); // planting + 171
    expect(window.status).toBe("notYet");
  });

  it("narrows sharply once that stage is confirmed", () => {
    const window = at({
      timing: { stage: "harvest", dapFrom: 0, dapTo: 21 },
      stageDates: { harvest: "2027-01-10" },
      today: "2027-01-10",
    });
    expect(window.from).toBe("2027-01-10");
    expect(window.to).toBe("2027-01-31");
    expect(window.estimated).toBe(false);
  });

  it("counts days from planting when there is no stage", () => {
    const window = at({
      timing: { stage: null, dapFrom: 30, dapTo: 40 },
      today: "2026-10-05",
    });
    expect(window.from).toBe("2026-10-01");
    expect(window.to).toBe("2026-10-11");
    expect(window.status).toBe("due");
  });

  it("opens on the first day of the window and not before", () => {
    expect(at({ today: "2026-10-05" }).status).toBe("notYet");
    expect(at({ today: "2026-10-06" }).status).toBe("due");
    expect(at({ today: "2026-10-16" }).status).toBe("due");
    expect(at({ today: "2026-10-17" }).status).toBe("overdue");
  });

  it("counts a record inside the window as done", () => {
    const window = at({ today: "2026-10-20", recordedDates: ["2026-10-08"] });
    expect(window.status).toBe("recorded");
  });

  it("ignores a record from before the window opened", () => {
    // An entry taken a month early was some other visit, not this one.
    const window = at({ today: "2026-10-20", recordedDates: ["2026-09-08"] });
    expect(window.status).toBe("overdue");
  });

  it("is unscheduled when the form has no timing", () => {
    expect(at({ timing: null }).status).toBe("unscheduled");
    expect(at({ timing: { stage: null, dapFrom: null, dapTo: null } }).status).toBe("unscheduled");
  });

  it("reports days until the window opens", () => {
    expect(at({ today: "2026-10-01" }).daysUntil).toBe(5);
    expect(at({ today: "2026-10-06" }).daysUntil).toBe(0);
    expect(at({ today: "2026-10-20" }).daysUntil).toBe(-14);
  });

  it("handles a stage with no day count that has not been confirmed", () => {
    const window = at({
      timing: { stage: "somethingCustom", dapFrom: null, dapTo: null },
    });
    expect(window.status).toBe("unscheduled");
    expect(window.reason).toMatch(/not been confirmed/i);
  });
});

describe("describeWindow", () => {
  it("marks an estimate as an estimate", () => {
    expect(describeWindow(at({ today: "2026-10-06" }), "2026-10-06")).toBe(
      "Due now — estimated 6 Oct to 16 Oct.",
    );
  });

  it("drops the hedge once the stage is confirmed", () => {
    const window = at({ stageDates: { tuberInitiation: "2026-11-05" }, today: "2026-11-05" });
    expect(describeWindow(window, "2026-11-05")).toBe("Due now — 5 Nov.");
  });

  it("counts from the end of the window, not the start", () => {
    // 20 Oct is 14 days after the window opened but only 4 past its close,
    // and "4 days late" is the one that describes the problem.
    expect(describeWindow(at({ today: "2026-10-20" }), "2026-10-20")).toBe(
      "4 days past the window — estimated 6 Oct to 16 Oct.",
    );
  });

  it("says tomorrow rather than in 1 days", () => {
    expect(describeWindow(at({ today: "2026-10-05" }), "2026-10-05")).toMatch(/tomorrow/);
  });
});

describe("sortByUrgency", () => {
  const item = (status: string, from: string): DueItem =>
    ({
      templateId: status + from,
      formName: "f",
      siteId: "s",
      siteName: "s",
      trialId: "t",
      trialName: "t",
      window: { status, from, to: from, estimated: false, reason: null, daysUntil: 0 },
    }) as DueItem;

  it("puts overdue first, then due, then upcoming", () => {
    const sorted = sortByUrgency([
      item("notYet", "2026-11-01"),
      item("recorded", "2026-09-01"),
      item("due", "2026-10-10"),
      item("overdue", "2026-10-01"),
    ]);
    expect(sorted.map((entry) => entry.window.status)).toEqual([
      "overdue",
      "due",
      "notYet",
      "recorded",
    ]);
  });

  it("puts the longest outstanding first within a status", () => {
    const sorted = sortByUrgency([item("overdue", "2026-10-05"), item("overdue", "2026-09-01")]);
    expect(sorted[0].window.from).toBe("2026-09-01");
  });

  it("only flags due and overdue as needing attention", () => {
    const items = [item("notYet", "2026-11-01"), item("due", "2026-10-10"), item("overdue", "2026-10-01")];
    expect(needsAttention(items)).toHaveLength(2);
  });
});
