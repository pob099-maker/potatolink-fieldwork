// The economics engine: pure functions that turn per-arm assumptions plus a
// scenario into an annual net benefit and payback period for every
// alternative arm, always compared against the trial's control arm
// (control-plus-alternatives pattern — arms are never hardcoded).

import type { ArmAssumption, EconomicScenario, PracticeArm, ResultSet } from "../types";
import { newId, nowIso } from "../lib/id";

export interface ScenarioAssumptions {
  seasonTonnes: number;
  pricePerTonne: number;
  labourRatePerHour: number;
}

export const DEFAULT_SCENARIO: ScenarioAssumptions = {
  seasonTonnes: 8000,
  pricePerTonne: 450,
  labourRatePerHour: 40,
};

/**
 * Units an assumption value can carry. How each is turned into dollars:
 * - "$"      one-off amount (used for capex)
 * - "$/yr"   flat annual amount
 * - "$/t"    multiplied by the scenario's season tonnes
 * - "hr/t"   multiplied by season tonnes and the labour rate
 * - "%yield" percentage-point change in marketable yield, valued at the
 *            scenario price across the season (revenue category)
 */
export const ASSUMPTION_UNITS = ["$", "$/yr", "$/t", "hr/t", "%yield"] as const;

export function parseScenarioAssumptions(json: string): ScenarioAssumptions {
  try {
    const parsed = JSON.parse(json) as Partial<ScenarioAssumptions>;
    return {
      seasonTonnes: Number(parsed.seasonTonnes) || DEFAULT_SCENARIO.seasonTonnes,
      pricePerTonne: Number(parsed.pricePerTonne) || DEFAULT_SCENARIO.pricePerTonne,
      labourRatePerHour:
        Number(parsed.labourRatePerHour) || DEFAULT_SCENARIO.labourRatePerHour,
    };
  } catch {
    return { ...DEFAULT_SCENARIO };
  }
}

function annualAmount(assumption: ArmAssumption, scenario: ScenarioAssumptions): number {
  const value = Number(assumption.value);
  if (!Number.isFinite(value)) return 0;
  switch (assumption.unit) {
    case "$/t":
      return value * scenario.seasonTonnes;
    case "hr/t":
      return value * scenario.seasonTonnes * scenario.labourRatePerHour;
    case "%yield":
      return (value / 100) * scenario.seasonTonnes * scenario.pricePerTonne;
    case "$":
    case "$/yr":
    default:
      return value;
  }
}

export interface ArmEconomics {
  armId: string;
  capex: number;
  annualCost: number;
  annualRevenue: number;
  netAnnual: number;
}

export function calculateArm(
  armId: string,
  assumptions: ArmAssumption[],
  scenario: ScenarioAssumptions,
): ArmEconomics {
  let capex = 0;
  let annualCost = 0;
  let annualRevenue = 0;
  for (const assumption of assumptions.filter((candidate) => candidate.armId === armId)) {
    if (assumption.category === "capex") {
      capex += Number(assumption.value) || 0;
    } else if (assumption.category === "revenue") {
      annualRevenue += annualAmount(assumption, scenario);
    } else {
      // opex, labour, other are all annual costs
      annualCost += annualAmount(assumption, scenario);
    }
  }
  return { armId, capex, annualCost, annualRevenue, netAnnual: annualRevenue - annualCost };
}

export interface ArmComparison {
  arm: PracticeArm;
  economics: ArmEconomics;
  /** Annual net benefit of this arm compared to the control arm ($/yr). */
  netBenefit: number;
  /** Capital outlay above the control arm ($). */
  extraCapex: number;
  /** Years to recoup the extra capex; 0 = immediate; null = never pays back. */
  paybackYears: number | null;
}

export function compareArms(
  arms: PracticeArm[],
  assumptions: ArmAssumption[],
  scenario: ScenarioAssumptions,
): ArmComparison[] {
  const control = arms.find((arm) => arm.type === "control");
  if (!control) return [];
  const controlEconomics = calculateArm(control.armId, assumptions, scenario);

  return arms
    .filter((arm) => arm.type === "alternative")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((arm) => {
      const economics = calculateArm(arm.armId, assumptions, scenario);
      const netBenefit = economics.netAnnual - controlEconomics.netAnnual;
      const extraCapex = economics.capex - controlEconomics.capex;
      let paybackYears: number | null = null;
      if (netBenefit > 0) {
        paybackYears = extraCapex > 0 ? extraCapex / netBenefit : 0;
      }
      return { arm, economics, netBenefit, extraCapex, paybackYears };
    });
}

/** Materialise comparisons as ResultSet records for a scenario. */
export function buildResultSets(
  scenario: EconomicScenario,
  comparisons: ArmComparison[],
): ResultSet[] {
  const calculatedAt = nowIso();
  return comparisons.map((comparison) => ({
    resultId: newId(),
    scenarioId: scenario.scenarioId,
    armId: comparison.arm.armId,
    netBenefit: Math.round(comparison.netBenefit),
    paybackPeriod:
      comparison.paybackYears === null
        ? null
        : Math.round(comparison.paybackYears * 100) / 100,
    notes: `vs control; extra capex $${Math.round(comparison.extraCapex).toLocaleString()}`,
    calculatedAt,
  }));
}

export function formatMoney(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}$${Math.abs(rounded).toLocaleString()}`;
}
