// The units a trial can record in.
//
// The same argument as the measurement library, with a sharper edge. Two
// trials that typed "Yield" and "Marketable wt" can never be pooled — that is
// bad enough. But a unit is worse than unpoolable when it is typed, because
// something in *this* trial silently stops working.
//
// weightUnit() in plotArea.ts matches "kg", "kgs" or "kilograms" and returns
// null for anything else, and null means no tonnes-per-hectare conversion.
// Type "kilo", "Kg/plot" or "weight (kg)" and the app quietly stops doing the
// arithmetic it exists to do. No error, no warning — the column is simply not
// there afterwards. The fact that somebody had to write a spelling-variant
// matcher at all is the tell: it exists because units arrive typed.
//
// So the list is offered, and what each unit unlocks is stated next to it
// rather than left to be discovered. Anything genuinely unusual can still be
// typed — a trial measuring something nobody anticipated must not be blocked
// by a list — but it is the second choice, not the only one.

/** What choosing this unit makes the app able to do. */
export type UnitPower = "yield" | "area" | null;

export interface UnitOption {
  value: string;
  label: string;
  group: string;
  /** Named so the interface can say what is gained, instead of implying it. */
  power: UnitPower;
}

/**
 * Values are exactly what plotArea.ts matches on, deliberately. A list whose
 * entries did not match the matcher would be the same bug wearing a dropdown.
 */
export const UNIT_OPTIONS: UnitOption[] = [
  { value: "kg", label: "kg — kilograms", group: "Weight", power: "yield" },
  { value: "t", label: "t — tonnes", group: "Weight", power: "yield" },
  { value: "g", label: "g — grams", group: "Weight", power: null },

  { value: "m2", label: "m² — square metres", group: "Area", power: "area" },
  { value: "ha", label: "ha — hectares", group: "Area", power: "area" },

  { value: "count", label: "count — a number of things", group: "Counts", power: null },
  { value: "%", label: "% — per cent", group: "Counts", power: null },
  { value: "plants/m2", label: "plants/m² — plant density", group: "Counts", power: null },

  { value: "mm", label: "mm — millimetres", group: "Size", power: null },
  { value: "cm", label: "cm — centimetres", group: "Size", power: null },
  { value: "m", label: "m — metres", group: "Size", power: null },

  { value: "days", label: "days", group: "Time", power: null },
  { value: "hours", label: "hours", group: "Time", power: null },

  { value: "°C", label: "°C — degrees", group: "Other", power: null },
  { value: "pH", label: "pH", group: "Other", power: null },
  { value: "$", label: "$ — dollars", group: "Other", power: null },
  { value: "$/t", label: "$/t — dollars per tonne", group: "Other", power: null },
];

/** The groups, in the order they should appear, derived from the list itself. */
export function unitGroups(): { group: string; options: UnitOption[] }[] {
  const order: string[] = [];
  const byGroup = new Map<string, UnitOption[]>();
  for (const option of UNIT_OPTIONS) {
    if (!byGroup.has(option.group)) {
      byGroup.set(option.group, []);
      order.push(option.group);
    }
    byGroup.get(option.group)?.push(option);
  }
  return order.map((group) => ({ group, options: byGroup.get(group) ?? [] }));
}

export const findUnit = (value: string): UnitOption | undefined =>
  UNIT_OPTIONS.find((option) => option.value === value);

/** Whether a typed unit is one the list already covers, however it was spelled. */
export function isKnownUnit(unit: string): boolean {
  return UNIT_OPTIONS.some(
    (option) => option.value.toLowerCase() === unit.trim().toLowerCase(),
  );
}

/**
 * What a unit buys, in words, or null when it buys nothing in particular.
 *
 * Shown beside the choice rather than after it. Somebody picking a unit for a
 * harvest weight should be told there that kg unlocks tonnes per hectare —
 * finding out later, from its absence, is not finding out.
 */
export function describePower(unit: string): string | null {
  const power = findUnit(unit)?.power ?? null;
  if (power === "yield") return "Lets the app work out tonnes per hectare.";
  if (power === "area") return "Lets a record carry its own plot size.";
  return null;
}

/**
 * Nudge a typed unit onto the canonical spelling where it plainly means the
 * same thing.
 *
 * Only for units already in the app: imports and older trials carry hand-typed
 * strings, and quietly correcting "kilograms" to "kg" is the difference
 * between a trial that converts and one that does not. Never invents a unit it
 * does not recognise — an unknown unit stays exactly as typed, because
 * guessing at somebody's meaning is how a number changes silently.
 */
export function canonicalUnit(unit: string): string {
  const cleaned = unit.trim();
  if (!cleaned) return "";
  const lower = cleaned.toLowerCase();

  const aliases: Record<string, string> = {
    kgs: "kg",
    kilogram: "kg",
    kilograms: "kg",
    kilo: "kg",
    kilos: "kg",
    tonne: "t",
    tonnes: "t",
    ton: "t",
    tons: "t",
    hectare: "ha",
    hectares: "ha",
    "m^2": "m2",
    "m²": "m2",
    sqm: "m2",
    "sq m": "m2",
    percent: "%",
    "per cent": "%",
    pct: "%",
    number: "count",
    num: "count",
    day: "days",
    hour: "hours",
    c: "°C",
    celsius: "°C",
  };

  if (aliases[lower]) return aliases[lower];
  const exact = UNIT_OPTIONS.find((option) => option.value.toLowerCase() === lower);
  return exact ? exact.value : cleaned;
}
