// Turning what was weighed into what gets compared.
//
// A form that asks for "yield (t/ha)" is asking somebody standing in a paddock
// to do a unit conversion: forty kilograms off a two-by-ten-metre plot is
// twenty tonnes per hectare, via 0.04 t over 0.002 ha. Nothing checks that
// arithmetic, and a misplaced decimal is invisible in the data forever.
//
// So the plot size is recorded once, on the trial, and the field question
// becomes the one thing a person can actually measure — the weight on the
// scales. Typed rather than measured by satellite on purpose: a trial plot is
// a few tens of square metres and a phone fixes a corner to within several
// metres, so a walked boundary would carry an error larger than the plot it
// described. At paddock scale that trade reverses, which is why this is about
// plots and not paddocks.

import type { Trial } from "../types";

const SQUARE_METRES_PER_HECTARE = 10_000;
const KILOGRAMS_PER_TONNE = 1_000;

/** The plot's area in square metres, or null until both sides are known. */
export function plotAreaM2(trial: Pick<Trial, "plotLengthM" | "plotWidthM">): number | null {
  const { plotLengthM: length, plotWidthM: width } = trial;
  if (length === null || width === null) return null;
  if (length <= 0 || width <= 0) return null;
  return length * width;
}

/**
 * Whether a field's unit is a weight this can convert from. Matched on the
 * unit rather than the field's name, because naming a field is the trial
 * designer's business and hardcoding one here would tie the app to a crop.
 */
export function weightUnit(unit: string | null): "kg" | "t" | null {
  const cleaned = (unit ?? "").trim().toLowerCase();
  if (cleaned === "kg" || cleaned === "kgs" || cleaned === "kilograms") return "kg";
  if (cleaned === "t" || cleaned === "tonnes" || cleaned === "tonne") return "t";
  return null;
}

/**
 * Whether a field's unit is an area, so a record can carry its own.
 *
 * A trial-wide plot size is right where plots are uniform, and wrong for
 * exactly the case that motivated this: strips across an irregular field or a
 * pivot circle are different lengths, so each one has its own area. A form
 * that asks for it lets the record override the trial's default.
 */
export function areaUnit(unit: string | null): "ha" | "m2" | null {
  const cleaned = (unit ?? "").trim().toLowerCase();
  if (cleaned === "ha" || cleaned === "hectares" || cleaned === "hectare") return "ha";
  if (cleaned === "m2" || cleaned === "m²" || cleaned === "sqm") return "m2";
  return null;
}

/** An area reading in whatever unit it was captured, as square metres. */
export function areaAsM2(value: number, unit: "ha" | "m2"): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return unit === "ha" ? value * SQUARE_METRES_PER_HECTARE : value;
}

/**
 * Tonnes per hectare from a weight off one plot. Null when the trial has no
 * plot size, because a guess here would be worse than the blank it replaces.
 */
export function yieldPerHectare(
  weight: number,
  unit: "kg" | "t",
  areaM2: number | null,
): number | null {
  if (areaM2 === null || areaM2 <= 0) return null;
  if (!Number.isFinite(weight)) return null;
  const tonnes = unit === "kg" ? weight / KILOGRAMS_PER_TONNE : weight;
  return tonnes / (areaM2 / SQUARE_METRES_PER_HECTARE);
}

/** How the plot size reads on screen: "2 × 10 m — 20 m²". */
export function describePlot(trial: Pick<Trial, "plotLengthM" | "plotWidthM">): string | null {
  const area = plotAreaM2(trial);
  if (area === null) return null;
  const round = (value: number) => Number(value.toFixed(2)).toString();
  return `${round(trial.plotWidthM as number)} × ${round(trial.plotLengthM as number)} m — ${round(area)} m²`;
}
