import { describe, expect, it } from "vitest";
import { describeScope, scopeLevel, scopeProblem, sourcesForRow } from "./dataSourceScope";
import type { DataSource, PracticeArm, Site } from "../types";

const sites = [
  { siteId: "s1", location: "Walkers Flat" },
  { siteId: "s2", location: "Tasmania" },
] as Site[];
const arms = [{ armId: "a1", name: "80 N" }] as PracticeArm[];

const at = (over: Partial<{ siteId: string | null; armId: string | null; plot: number | null }>) => ({
  siteId: null,
  armId: null,
  plot: null,
  ...over,
});

describe("what a source is about", () => {
  it("reads narrowest first, because that is the useful half", () => {
    // Knowing a reading is plot 7's says more than knowing it is the trial's.
    expect(scopeLevel(at({ siteId: "s1", plot: 7 }))).toBe("plot");
    expect(scopeLevel(at({ armId: "a1" }))).toBe("treatment");
    expect(scopeLevel(at({ siteId: "s1" }))).toBe("site");
    expect(scopeLevel(at({}))).toBe("trial");
  });

  it("will not call it a plot without the site it is in", () => {
    // Plots are numbered from one in every paddock, so the number alone
    // identifies nothing.
    expect(scopeLevel(at({ plot: 7 }))).toBe("trial");
  });
});

describe("how it reads on screen", () => {
  it("names the plot and the paddock it is in", () => {
    expect(describeScope(at({ siteId: "s2", plot: 4 }), sites, arms, "Treatment")).toBe(
      "Plot 4 · Tasmania",
    );
  });

  it("uses the trial's own word for a treatment", () => {
    // A grower's trial says practice; a researcher's says treatment.
    expect(describeScope(at({ armId: "a1" }), sites, arms, "Practice")).toBe("Practice: 80 N");
    expect(describeScope(at({ armId: "a1" }), sites, arms, "Treatment")).toBe("Treatment: 80 N");
  });

  it("says so when the thing it pointed at has gone", () => {
    // A dangling reference is worth seeing, not swallowing.
    expect(describeScope(at({ siteId: "gone" }), sites, arms, "Treatment")).toContain(
      "no longer in this trial",
    );
    expect(describeScope(at({ armId: "gone" }), sites, arms, "Treatment")).toContain(
      "no longer in this trial",
    );
  });

  it("falls back to the whole trial", () => {
    expect(describeScope(at({}), sites, arms, "Treatment")).toBe("whole trial");
  });
});

describe("refusing a scope that identifies nothing", () => {
  it("wants the site a plot is in", () => {
    expect(scopeProblem(at({ plot: 7 }))).toContain("Choose the site");
  });

  it("accepts a plot once the site is known", () => {
    expect(scopeProblem(at({ siteId: "s1", plot: 7 }))).toBeNull();
  });

  it("accepts every scope that leaves the plot out", () => {
    expect(scopeProblem(at({}))).toBeNull();
    expect(scopeProblem(at({ siteId: "s1" }))).toBeNull();
  });
});

// Provenance you cannot trace in the exported file is not really provenance:
// a reviewer asking where a number came from is looking at a spreadsheet.
describe("which sources cover an observation", () => {
  const src = (over: Partial<DataSource>): DataSource => ({
    label: "x", kind: "other", reference: "r", siteId: null, armId: null, plot: null, note: "",
    ...over,
  });
  const row = (over: Partial<{ siteId: string | null; armId: string | null; plot: number | null }> = {}) => ({
    siteId: "s1", armId: "a1", plot: 7, ...over,
  });

  it("puts the most telling one first", () => {
    // The protocol covers everything; the flow meter covers this one plot.
    const sources = [
      src({ label: "Protocol" }),
      src({ label: "Flow meter", siteId: "s1", plot: 7 }),
      src({ label: "Probe", siteId: "s1" }),
    ];
    expect(sourcesForRow(sources, row()).map((s) => s.label)).toEqual([
      "Flow meter",
      "Probe",
      "Protocol",
    ]);
  });

  it("matches a plot only in its own site", () => {
    // Plot 7 exists in every paddock, so the site has to match too.
    const meter = src({ label: "Flow meter", siteId: "s1", plot: 7 });
    expect(sourcesForRow([meter], row({ siteId: "s2" }))).toEqual([]);
    expect(sourcesForRow([meter], row({ plot: 3 }))).toEqual([]);
  });

  it("matches a treatment wherever it was recorded", () => {
    const source = src({ label: "Rate log", armId: "a1" });
    expect(sourcesForRow([source], row({ siteId: "s2", plot: 2 }))).toHaveLength(1);
    expect(sourcesForRow([source], row({ armId: "a2" }))).toEqual([]);
  });

  it("covers a trial-level record that has no site or practice at all", () => {
    // A cost log belongs to the trial and still deserves its provenance.
    const protocol = src({ label: "Protocol" });
    const probe = src({ label: "Probe", siteId: "s1" });
    const covering = sourcesForRow([protocol, probe], { siteId: null, armId: null, plot: null });
    expect(covering.map((s) => s.label)).toEqual(["Protocol"]);
  });
});
