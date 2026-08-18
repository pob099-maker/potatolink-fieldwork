import { describe, expect, it } from "vitest";
import {
  blendComparisons,
  compareArms,
  parseScenarioAssumptions,
  scenarioForSite,
  type ScenarioAssumptions,
} from "./economics";
import type { ArmAssumption, EconomicScenario, PracticeArm } from "./../types";

const T0 = "2026-08-18T00:00:00.000Z";
const WALKERS = "site-walkers";
const TASSIE = "site-tassie";

function scenario(scenarioId: string, siteId: string | null, values: ScenarioAssumptions): EconomicScenario {
  return {
    scenarioId,
    trialId: "trial-1",
    siteId,
    name: scenarioId,
    assumptionsJson: JSON.stringify(values),
    createdAt: T0,
  };
}

function arm(armId: string, type: PracticeArm["type"], sortOrder: number): PracticeArm {
  return {
    armId,
    trialId: "trial-1",
    name: armId,
    type,
    description: "",
    sortOrder,
    archived: false,
    createdAt: T0,
  };
}

function assumption(
  armId: string,
  category: ArmAssumption["category"],
  value: number,
  unit: string,
): ArmAssumption {
  return {
    assumptionId: `${armId}-${category}-${value}-${unit}`,
    armId,
    category,
    fieldName: "test",
    value,
    unit,
    createdAt: T0,
  };
}

describe("scenarioForSite", () => {
  const scenarios = [
    scenario("trial-wide", null, { seasonTonnes: 8000, pricePerTonne: 450, labourRatePerHour: 40 }),
    scenario("tassie", TASSIE, { seasonTonnes: 5000, pricePerTonne: 420, labourRatePerHour: 45 }),
  ];

  it("prefers a site's own scenario", () => {
    expect(scenarioForSite(scenarios, "trial-1", TASSIE)?.scenarioId).toBe("tassie");
  });

  it("falls back to the trial-wide scenario for a site without one", () => {
    expect(scenarioForSite(scenarios, "trial-1", WALKERS)?.scenarioId).toBe("trial-wide");
  });

  it("uses the trial-wide scenario for the blended view", () => {
    expect(scenarioForSite(scenarios, "trial-1", null)?.scenarioId).toBe("trial-wide");
  });

  it("ignores scenarios from other trials", () => {
    expect(scenarioForSite(scenarios, "trial-other", TASSIE)).toBeUndefined();
  });
});

describe("blendComparisons", () => {
  const arms = [arm("control", "control", 0), arm("owned", "alternative", 1)];
  // Labour is the only running cost, so each site's benefit is the labour saved.
  const assumptions = [
    assumption("control", "labour", 0.5, "hr/t"),
    assumption("owned", "capex", 450000, "$"),
    assumption("owned", "labour", 0.1, "hr/t"),
  ];

  const walkersValues: ScenarioAssumptions = {
    seasonTonnes: 8000,
    pricePerTonne: 450,
    labourRatePerHour: 40,
  };
  const tassieValues: ScenarioAssumptions = {
    seasonTonnes: 5000,
    pricePerTonne: 420,
    labourRatePerHour: 45,
  };

  it("adds each site's outcome rather than averaging the scenarios", () => {
    const walkers = compareArms(arms, assumptions, walkersValues);
    const tassie = compareArms(arms, assumptions, tassieValues);
    // Walkers: 0.4 hr/t saved x 8000 t x $40 = 128,000
    expect(walkers[0].netBenefit).toBe(128000);
    // Tasmania: 0.4 hr/t saved x 5000 t x $45 = 90,000
    expect(tassie[0].netBenefit).toBe(90000);

    const blended = blendComparisons([walkers, tassie]);
    expect(blended).toHaveLength(1);
    expect(blended[0].netBenefit).toBe(218000);
    expect(blended[0].extraCapex).toBe(900000); // a unit at each site
    expect(blended[0].paybackYears).toBeCloseTo(900000 / 218000, 5);
  });

  it("recomputes payback from the totals, not from an average of paybacks", () => {
    const walkers = compareArms(arms, assumptions, walkersValues);
    const tassie = compareArms(arms, assumptions, tassieValues);
    const averaged =
      ((walkers[0].paybackYears ?? 0) + (tassie[0].paybackYears ?? 0)) / 2;
    const blended = blendComparisons([walkers, tassie]);
    expect(blended[0].paybackYears).not.toBeCloseTo(averaged, 3);
  });

  it("keeps arms sorted and handles a single site unchanged", () => {
    const single = compareArms(arms, assumptions, walkersValues);
    const blended = blendComparisons([single]);
    expect(blended[0].netBenefit).toBe(single[0].netBenefit);
    expect(blended[0].paybackYears).toBeCloseTo(single[0].paybackYears ?? 0, 5);
  });

  it("returns nothing when no site produced comparisons", () => {
    expect(blendComparisons([])).toEqual([]);
  });
});

describe("parseScenarioAssumptions", () => {
  it("falls back to defaults for a missing scenario", () => {
    const values = parseScenarioAssumptions("");
    expect(values.seasonTonnes).toBeGreaterThan(0);
    expect(values.pricePerTonne).toBeGreaterThan(0);
  });
});
