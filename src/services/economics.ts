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

export interface AssumptionConfidence {
  total: number;
  confirmed: number;
  placeholder: number;
  /** The figures still standing in, so the page can name what to chase down. */
  placeholderNames: string[];
}

/**
 * How much of a calculation rests on real numbers. A payback period built from
 * invented costs looks exactly like one built from invoices, so anywhere a
 * result is shown has to be able to say which it is.
 */
export function assumptionConfidence(assumptions: ArmAssumption[]): AssumptionConfidence {
  const placeholders = assumptions.filter(
    (assumption) => (assumption.status ?? "placeholder") === "placeholder",
  );
  return {
    total: assumptions.length,
    confirmed: assumptions.length - placeholders.length,
    placeholder: placeholders.length,
    placeholderNames: placeholders.map((assumption) => assumption.fieldName),
  };
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

/**
 * The scenario that applies at a site: its own if it has one, otherwise the
 * trial-wide scenario, otherwise the defaults.
 */
export function scenarioForSite(
  scenarios: EconomicScenario[],
  trialId: string,
  siteId: string | null,
): EconomicScenario | undefined {
  const forTrial = scenarios.filter((scenario) => scenario.trialId === trialId);
  return (
    (siteId ? forTrial.find((scenario) => scenario.siteId === siteId) : undefined) ??
    forTrial.find((scenario) => scenario.siteId === null)
  );
}

/**
 * Combine per-site comparisons into one trial-level view: benefits and capital
 * outlay add up across sites, and payback is recomputed from those totals
 * rather than averaged (averaging paybacks would weight a tiny site equally
 * with a large one).
 */
export function blendComparisons(perSite: ArmComparison[][]): ArmComparison[] {
  const byArm = new Map<string, ArmComparison>();
  for (const comparisons of perSite) {
    for (const comparison of comparisons) {
      const existing = byArm.get(comparison.arm.armId);
      if (!existing) {
        byArm.set(comparison.arm.armId, { ...comparison });
        continue;
      }
      existing.netBenefit += comparison.netBenefit;
      existing.extraCapex += comparison.extraCapex;
      existing.economics = {
        armId: existing.economics.armId,
        capex: existing.economics.capex + comparison.economics.capex,
        annualCost: existing.economics.annualCost + comparison.economics.annualCost,
        annualRevenue: existing.economics.annualRevenue + comparison.economics.annualRevenue,
        netAnnual: existing.economics.netAnnual + comparison.economics.netAnnual,
      };
    }
  }
  return [...byArm.values()]
    .map((comparison) => ({
      ...comparison,
      paybackYears:
        comparison.netBenefit > 0
          ? comparison.extraCapex > 0
            ? comparison.extraCapex / comparison.netBenefit
            : 0
          : null,
    }))
    .sort((a, b) => a.arm.sortOrder - b.arm.sortOrder);
}

/** Materialise comparisons as ResultSet records for a scenario and site. */
export function buildResultSets(
  scenario: EconomicScenario,
  comparisons: ArmComparison[],
  siteId: string | null,
): ResultSet[] {
  const calculatedAt = nowIso();
  return comparisons.map((comparison) => ({
    resultId: newId(),
    scenarioId: scenario.scenarioId,
    armId: comparison.arm.armId,
    siteId,
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
