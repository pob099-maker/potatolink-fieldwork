import { describe, expect, it } from "vitest";
import {
  buildCombinations,
  canBuild,
  combinationCount,
  describeDesign,
  designLoad,
  type Factor,
  type FactorLevel,
} from "./factorial";

const factor = (id: string, name: string, code: string, sortOrder: number): Factor => ({
  factorId: id,
  trialId: "t1",
  name,
  code,
  sortOrder,
});

const level = (
  id: string,
  factorId: string,
  label: string,
  sortOrder: number,
  numericValue: number | null = null,
): FactorLevel => ({ levelId: id, factorId, label, numericValue, sortOrder });

const variety = factor("f-var", "Variety", "Var", 0);
const nitrogen = factor("f-n", "Nitrogen", "N", 1);
const irrigation = factor("f-irr", "Irrigation", "Irr", 2);

const varietyLevels = [
  level("l-moon", "f-var", "Moonlight", 0),
  level("l-atl", "f-var", "Atlantic", 1),
];
const nitrogenLevels = [
  level("l-n0", "f-n", "Nil", 0, 0),
  level("l-n80", "f-n", "Standard", 1, 80),
  level("l-n160", "f-n", "High", 2, 160),
];
const irrigationLevels = [
  level("l-full", "f-irr", "Full", 0),
  level("l-def", "f-irr", "Deficit", 1),
];

describe("combinationCount", () => {
  it("multiplies the level counts", () => {
    expect(combinationCount([2, 3])).toBe(6);
    expect(combinationCount([2, 3, 3])).toBe(18);
    expect(combinationCount([4])).toBe(4);
  });

  it("is zero when a factor has no levels", () => {
    // Not "ignore that factor" — a trial silently missing a variable the
    // designer thought they added is worse than an empty result.
    expect(combinationCount([2, 0])).toBe(0);
  });

  it("is zero with no factors at all", () => {
    expect(combinationCount([])).toBe(0);
  });
});

describe("buildCombinations", () => {
  it("crosses every level of every factor", () => {
    const combos = buildCombinations([variety, nitrogen], [...varietyLevels, ...nitrogenLevels]);
    expect(combos).toHaveLength(6);
  });

  it("varies the last factor fastest, as a factorial is written on paper", () => {
    const combos = buildCombinations([variety, nitrogen], [...varietyLevels, ...nitrogenLevels]);
    expect(combos.map((c) => c.label)).toEqual([
      "Variety=Moonlight · Nitrogen=Nil",
      "Variety=Moonlight · Nitrogen=Standard",
      "Variety=Moonlight · Nitrogen=High",
      "Variety=Atlantic · Nitrogen=Nil",
      "Variety=Atlantic · Nitrogen=Standard",
      "Variety=Atlantic · Nitrogen=High",
    ]);
  });

  it("handles three factors", () => {
    const combos = buildCombinations(
      [variety, nitrogen, irrigation],
      [...varietyLevels, ...nitrogenLevels, ...irrigationLevels],
    );
    expect(combos).toHaveLength(12);
    expect(combos[0].label).toBe("Variety=Moonlight · Nitrogen=Nil · Irrigation=Full");
  });

  it("gives every plot a label a contractor can read without joining anything", () => {
    const combos = buildCombinations([variety, nitrogen], [...varietyLevels, ...nitrogenLevels]);
    expect(combos[4].label).toBe("Variety=Atlantic · Nitrogen=Standard");
    expect(combos[4].shortLabel).toBe("Var:Atlantic N:Standard");
  });

  it("records which level of which factor each combination holds", () => {
    const combos = buildCombinations([variety, nitrogen], [...varietyLevels, ...nitrogenLevels]);
    expect(combos[4].members).toEqual({ "f-var": "l-atl", "f-n": "l-n80" });
  });

  it("gives each combination a stable id", () => {
    const first = buildCombinations([variety, nitrogen], [...varietyLevels, ...nitrogenLevels]);
    const again = buildCombinations([variety, nitrogen], [...varietyLevels, ...nitrogenLevels]);
    expect(first.map((c) => c.combinationId)).toEqual(again.map((c) => c.combinationId));
  });

  it("respects the factors' own order, not the order they arrive in", () => {
    const combos = buildCombinations([nitrogen, variety], [...nitrogenLevels, ...varietyLevels]);
    // variety has sortOrder 0, so it leads regardless of array position.
    expect(combos[0].label.startsWith("Variety=")).toBe(true);
  });

  it("produces nothing when a factor has no levels", () => {
    expect(buildCombinations([variety, nitrogen], varietyLevels)).toHaveLength(0);
  });

  it("produces nothing with no factors", () => {
    expect(buildCombinations([], [])).toHaveLength(0);
  });

  it("keeps a level's numeric value distinct from its label", () => {
    // "High" is a name; 160 is a quantity, and only one of them can be fitted
    // to a trend or plotted against a response.
    expect(nitrogenLevels[2].numericValue).toBe(160);
    expect(nitrogenLevels[2].label).toBe("High");
  });
});

describe("designLoad", () => {
  const load = (combinations: number, replicates: number, extra = {}) =>
    designLoad({ combinations, replicates, ...extra });

  it("counts the plots somebody has to walk", () => {
    expect(load(6, 4).totalPlots).toBe(24);
    expect(load(6, 4, { sites: 2 }).totalPlots).toBe(48);
  });

  it("treats the combination count as the block size under RCB", () => {
    // A complete block holds every treatment once, by definition.
    expect(load(6, 4).blockSize).toBe(6);
  });

  it("has no block to outgrow under complete randomisation", () => {
    expect(load(30, 2, { blocking: "none" }).blockSize).toBe(0);
  });

  it("says nothing about an ordinary 2 × 3 at four reps", () => {
    const result = load(6, 4);
    expect(result.verdict).toBe("fine");
    expect(result.message).toBeNull();
  });

  it("notes a design that is getting large without complaining", () => {
    expect(load(12, 3).verdict).toBe("note");
  });

  it("warns when a block is too big to call uniform ground", () => {
    const result = load(18, 2);
    expect(result.verdict).toBe("warn");
    expect(result.message).toMatch(/uniform|split-plot/i);
  });

  it("blocks a 3 × 3 × 3 at four reps, on both counts", () => {
    // 27 combinations is a 27-plot block; 108 plots is a fortnight of harvest.
    const result = load(27, 4);
    expect(result.verdict).toBe("blocked");
    expect(canBuild(result)).toBe(false);
  });

  it("explains the block by its consequence, not its number", () => {
    const result = load(27, 4);
    expect(result.message).toMatch(/not uniform|more than a season/i);
    expect(result.message).toMatch(/Drop a level|fewer levels/i);
  });

  it("blocks on plot count even when the blocks themselves are fine", () => {
    // 8 combinations is a comfortable block; 12 reps across 2 sites is not a
    // trial anybody is going to harvest.
    const result = load(8, 12, { sites: 2 });
    expect(result.blockSize).toBe(8);
    expect(result.verdict).toBe("blocked");
    expect(result.message).toMatch(/plots/i);
  });

  it("reports the worst of the two checks, never the milder one", () => {
    const result = load(20, 5);
    expect(result.verdict).toBe("blocked");
  });

  it("copes with a design that is not finished yet", () => {
    const result = load(0, 4);
    expect(result.totalPlots).toBe(0);
    expect(result.verdict).toBe("fine");
    expect(canBuild(result)).toBe(true);
  });

  it("treats a missing site count as one site", () => {
    expect(load(6, 4, { sites: 0 }).sites).toBe(1);
  });

  it("escalates as levels are added, rather than jumping straight to a block", () => {
    // The point of the graduated warning: a designer sees it coming.
    expect(load(4, 4).verdict).toBe("fine");
    expect(load(9, 3).verdict).toBe("note");
    expect(load(18, 3).verdict).toBe("warn");
    expect(load(27, 4).verdict).toBe("blocked");
  });
});

describe("describeDesign", () => {
  it("names a factorial the way it is written", () => {
    expect(describeDesign([2, 3])).toBe("2 × 3");
    expect(describeDesign([2, 3, 3])).toBe("2 × 3 × 3");
  });

  it("is empty with nothing to name", () => {
    expect(describeDesign([])).toBe("");
  });
});
