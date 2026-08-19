import { describe, expect, it } from "vitest";
import {
  assumptionConfidence,
  calculateArm,
  compareArms,
  parseScenarioAssumptions,
  type ScenarioAssumptions,
} from "./economics";
import type { ArmAssumption, PracticeArm } from "../types";

const scenario: ScenarioAssumptions = {
  seasonTonnes: 8000,
  pricePerTonne: 450,
  labourRatePerHour: 40,
};

function arm(armId: string, type: PracticeArm["type"], sortOrder: number): PracticeArm {
  return {
    armId,
    trialId: "trial",
    name: armId,
    type,
    description: "",
    sortOrder,
    archived: false,
    createdAt: "2026-08-18T00:00:00.000Z",
  };
}

function assumption(
  armId: string,
  category: ArmAssumption["category"],
  value: number,
  unit: string,
): ArmAssumption {
  return {
    assumptionId: `${armId}-${category}-${unit}-${value}`,
    armId,
    category,
    fieldName: "test",
    value,
    unit,
    status: "placeholder",
    createdAt: "2026-08-18T00:00:00.000Z",
  };
}

describe("calculateArm", () => {
  it("interprets every unit against the scenario", () => {
    const result = calculateArm(
      "a",
      [
        assumption("a", "capex", 450000, "$"),
        assumption("a", "opex", 18000, "$/yr"),
        assumption("a", "opex", 8, "$/t"), // 64,000
        assumption("a", "labour", 0.15, "hr/t"), // 48,000
        assumption("a", "revenue", 2, "%yield"), // 72,000
      ],
      scenario,
    );
    expect(result.capex).toBe(450000);
    expect(result.annualCost).toBe(18000 + 64000 + 48000);
    expect(result.annualRevenue).toBe(72000);
    expect(result.netAnnual).toBe(72000 - 130000);
  });

  it("ignores assumptions belonging to other arms and non-numeric values", () => {
    const result = calculateArm(
      "a",
      [assumption("b", "opex", 999, "$/yr"), { ...assumption("a", "opex", 0, "$/yr"), value: "n/a" }],
      scenario,
    );
    expect(result.annualCost).toBe(0);
  });
});

describe("compareArms", () => {
  const arms = [arm("control", "control", 0), arm("owned", "alternative", 1), arm("shared", "alternative", 2)];
  const assumptions = [
    assumption("control", "labour", 0.5, "hr/t"), // 160,000/yr
    assumption("owned", "capex", 450000, "$"),
    assumption("owned", "labour", 0.15, "hr/t"), // 48,000/yr
    assumption("owned", "revenue", 2, "%yield"), // 72,000/yr
    assumption("shared", "labour", 0.2, "hr/t"), // 64,000/yr
  ];

  it("computes net benefit and payback against the control", () => {
    const [owned, shared] = compareArms(arms, assumptions, scenario);
    // owned: netAnnual = 72,000 - 48,000 = 24,000; control = -160,000 → benefit 184,000
    expect(owned.netBenefit).toBe(184000);
    expect(owned.extraCapex).toBe(450000);
    expect(owned.paybackYears).toBeCloseTo(450000 / 184000, 5);
    // shared: benefit 96,000/yr with no capex → immediate payback
    expect(shared.netBenefit).toBe(96000);
    expect(shared.paybackYears).toBe(0);
  });

  it("returns null payback when an alternative never pays back", () => {
    const worse = [
      arm("control", "control", 0),
      arm("bad", "alternative", 1),
    ];
    const badAssumptions = [
      assumption("bad", "capex", 100000, "$"),
      assumption("bad", "opex", 50000, "$/yr"),
    ];
    const [comparison] = compareArms(worse, badAssumptions, scenario);
    expect(comparison.netBenefit).toBeLessThan(0);
    expect(comparison.paybackYears).toBeNull();
  });

  it("returns nothing without a control arm", () => {
    expect(compareArms([arm("a", "alternative", 0)], [], scenario)).toEqual([]);
  });
});

describe("parseScenarioAssumptions", () => {
  it("falls back to defaults on bad json", () => {
    const parsed = parseScenarioAssumptions("not json");
    expect(parsed.seasonTonnes).toBeGreaterThan(0);
  });

  it("reads stored values", () => {
    const parsed = parseScenarioAssumptions(
      JSON.stringify({ seasonTonnes: 1000, pricePerTonne: 500, labourRatePerHour: 45 }),
    );
    expect(parsed).toEqual({ seasonTonnes: 1000, pricePerTonne: 500, labourRatePerHour: 45 });
  });
});

describe("assumptionConfidence", () => {
  it("counts what is still a stand-in and names it", () => {
    const confidence = assumptionConfidence([
      { ...assumption("a", "capex", 450000, "$"), fieldName: "Sorter purchase" },
      {
        ...assumption("a", "opex", 18000, "$/yr"),
        fieldName: "Service contract",
        status: "confirmed",
      },
    ]);
    expect(confidence.total).toBe(2);
    expect(confidence.confirmed).toBe(1);
    expect(confidence.placeholder).toBe(1);
    expect(confidence.placeholderNames).toEqual(["Sorter purchase"]);
  });

  it("treats a figure with no status as a placeholder", () => {
    // Rows written before the flag existed were never verified by anyone, so
    // the safe reading is the cautious one.
    const legacy = { ...assumption("a", "opex", 100, "$/yr") };
    delete (legacy as { status?: string }).status;
    expect(assumptionConfidence([legacy]).placeholder).toBe(1);
  });
});
