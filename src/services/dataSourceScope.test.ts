import { describe, expect, it } from "vitest";
import { describeScope, scopeLevel, scopeProblem } from "./dataSourceScope";
import type { PracticeArm, Site } from "../types";

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
