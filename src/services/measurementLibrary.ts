// A shared list of the things trials record.
//
// The app already does this for soil: ph_cacl2 carries its own name, its
// canonical unit and plausible bounds, so a laboratory result cannot arrive as
// "pH" measured in mg/kg. Field measurements had no equivalent, so every trial
// invented its own — and three trials measuring the same thing called it
// "Yield", "yield t/ha" and "Marketable wt".
//
// The convenience is that picking one fills in the type, the unit and sensible
// bounds. That is not the real prize. The prize is that three trials choosing
// `marketableYield` in kg can be pooled a year later, and three trials that
// typed their own labels never can — which nobody discovers until somebody
// tries.
//
// It is a starting list, not a gate. Anything can still be typed by hand, and
// what gets typed is offered back to the next person, so the library grows
// into whatever this programme actually measures rather than whatever was
// imagined up front.

import type { FieldType, FormField } from "../types";

export interface LibraryEntry {
  entryId: string;
  /** Stable machine name. What makes two trials poolable. */
  code: string;
  label: string;
  type: FieldType;
  /** Canonical unit. kg or t unlock the yield-per-hectare conversion. */
  unit: string;
  min: number | null;
  max: number | null;
  /** For a select: the choices, in order. */
  options: string[] | null;
  /** A sentence for whoever is deciding whether this is the right one. */
  guidance: string;
  /**
   * Where it came from. Built-ins ship with the app and are ranked first;
   * added ones came from somebody setting up a trial.
   */
  source: "builtin" | "added";
  /** How many forms use it, for putting the well-worn ones near the top. */
  usageCount: number;
  /** Position in the shipped list; absent for anything somebody added. */
  curatedOrder?: number;
  createdAt: string;
}

/**
 * What ships with the app.
 *
 * Deliberately short. A long list is harder to search than a text box, and the
 * point is to cover the handful of things nearly every potato trial records so
 * that those, at least, are named the same way everywhere. Everything else
 * arrives by being used.
 */
export const BUILT_IN_MEASUREMENTS: Array<Omit<LibraryEntry, "entryId" | "createdAt" | "usageCount">> = [
  {
    code: "marketableYield",
    label: "Marketable yield",
    type: "number",
    unit: "kg",
    min: 0,
    max: null,
    options: null,
    guidance: "Weight off the plot, before grading. In kilograms, so the app can work out tonnes per hectare.",
    source: "builtin",
  },
  {
    code: "totalYield",
    label: "Total yield",
    type: "number",
    unit: "kg",
    min: 0,
    max: null,
    options: null,
    guidance: "Everything harvested from the plot, marketable or not.",
    source: "builtin",
  },
  {
    code: "plantCount",
    label: "Plants counted",
    type: "number",
    unit: "count",
    min: 0,
    max: null,
    options: null,
    guidance: "Plants standing in the counted rows. Say in the trial notes how many rows.",
    source: "builtin",
  },
  {
    code: "emergencePct",
    label: "Emergence",
    type: "number",
    unit: "%",
    min: 0,
    max: 100,
    options: null,
    guidance: "Plants up as a percentage of seed planted.",
    source: "builtin",
  },
  {
    code: "canopyVigour",
    label: "Canopy vigour",
    type: "slider",
    unit: "",
    min: 1,
    max: 5,
    options: null,
    guidance: "A visual score. Agree what 1 and 5 look like before anybody walks the trial.",
    source: "builtin",
  },
  {
    code: "diseaseIncidence",
    label: "Disease incidence",
    type: "number",
    unit: "%",
    min: 0,
    max: 100,
    options: null,
    guidance: "Plants or tubers affected, as a percentage. Record which disease separately.",
    source: "builtin",
  },
  {
    code: "diseaseSeen",
    label: "Disease seen",
    type: "select",
    unit: "",
    min: null,
    max: null,
    options: ["none", "early blight", "target spot", "black scurf", "something else"],
    guidance: "What is showing, if anything. Add to the list if the usual suspects are missing.",
    source: "builtin",
  },
  {
    code: "tuberCount",
    label: "Tubers per plant",
    type: "number",
    unit: "count",
    min: 0,
    max: null,
    options: null,
    guidance: "Counted from a sample of plants, not the whole plot.",
    source: "builtin",
  },
  {
    code: "hollowHeart",
    label: "Hollow heart",
    type: "number",
    unit: "%",
    min: 0,
    max: 100,
    options: null,
    guidance: "Tubers affected in the cut sample, as a percentage.",
    source: "builtin",
  },
  {
    code: "specificGravity",
    label: "Specific gravity",
    type: "number",
    unit: "",
    min: 1,
    max: 1.15,
    options: null,
    guidance: "Usually between 1.06 and 1.10. Say which method in the trial notes.",
    source: "builtin",
  },
  {
    code: "photo",
    label: "Photo",
    type: "photo",
    unit: "",
    min: null,
    max: null,
    options: null,
    guidance: "Opens the camera. Worth one per plot when something unusual is showing.",
    source: "builtin",
  },
  {
    code: "notes",
    label: "Anything worth noting?",
    type: "text",
    unit: "",
    min: null,
    max: null,
    options: null,
    guidance: "Keep this last. A free-text box above a specific one gets used instead of it.",
    source: "builtin",
  },
];

/**
 * The whole list: what ships with the app, plus what people have added.
 *
 * Built-ins are not rows. Storing them would mean seeding them into every
 * deployment, and a pull removes local records the cloud does not have — so
 * the shipped list would vanish the first time somebody synced, exactly as the
 * demo forms did. Keeping them in code also means they improve with the app
 * rather than being frozen at whatever was seeded a year ago.
 *
 * Only what somebody adds is stored, which is the part that has to outlive
 * them.
 */
export function libraryEntries(stored: LibraryEntry[]): LibraryEntry[] {
  const takenNames = new Set(stored.map((entry) => normaliseName(entry.label)));
  const builtins: LibraryEntry[] = BUILT_IN_MEASUREMENTS
    // If somebody has added their own version of a built-in, theirs wins —
    // it carries their wording and their usage.
    .filter((entry) => !takenNames.has(normaliseName(entry.label)))
    .map((entry, index) => ({
      ...entry,
      entryId: `builtin:${entry.code}`,
      usageCount: 0,
      // Position in the curated list, so an untouched library still reads in
      // the order somebody thought about rather than alphabetically.
      curatedOrder: index,
      createdAt: "",
    })) as LibraryEntry[];
  return [...builtins, ...stored];
}

export const isBuiltIn = (entry: LibraryEntry): boolean => entry.entryId.startsWith("builtin:");

/**
 * A name reduced to what makes two of them the same thing.
 *
 * "Marketable yield", "marketable yield" and "Marketable Yield  " are one
 * measurement typed three ways. Without this the library silts up with
 * near-duplicates, and near-duplicates defeat the entire point of having it.
 */
export function normaliseName(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A machine name from a label, unique against what is already taken. */
export function codeFor(label: string, taken: string[]): string {
  const words = normaliseName(label).split(" ").filter(Boolean).slice(0, 4);
  let base = words.length === 0 ? "measurement" : words[0] + words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join("");
  if (/^\d/.test(base)) base = `m${base}`;
  let candidate = base;
  let suffix = 2;
  while (taken.includes(candidate)) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/** The entry that already means this, if there is one. */
export function findExisting(entries: LibraryEntry[], label: string): LibraryEntry | null {
  const wanted = normaliseName(label);
  return entries.find((entry) => normaliseName(entry.label) === wanted) ?? null;
}

/**
 * The list somebody picks from.
 *
 * Ranked rather than alphabetical: what this programme actually uses rises,
 * built-ins hold the middle, and one-offs somebody added for a single trial
 * sink. Alphabetical would put "Anything worth noting?" first for ever.
 */
export function rankEntries(entries: LibraryEntry[], search = ""): LibraryEntry[] {
  const wanted = normaliseName(search);
  const matches = wanted
    ? entries.filter(
        (entry) =>
          normaliseName(entry.label).includes(wanted) || entry.code.toLowerCase().includes(wanted),
      )
    : entries;

  return [...matches].sort((a, b) => {
    if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
    if (a.source !== b.source) return a.source === "builtin" ? -1 : 1;
    // Within the shipped list, the order somebody curated beats the alphabet:
    // "Anything worth noting?" should not lead a list of measurements.
    if (a.curatedOrder !== undefined && b.curatedOrder !== undefined) {
      return a.curatedOrder - b.curatedOrder;
    }
    return a.label.localeCompare(b.label);
  });
}

/** A library entry as a form field, ready to drop into a template. */
export function toFormField(entry: LibraryEntry, displayOrder: number, required = false): FormField {
  return {
    fieldName: entry.code,
    label: entry.label,
    type: entry.type,
    required,
    options: entry.options,
    min: entry.min,
    max: entry.max,
    unit: entry.unit || null,
    // Written for exactly this moment and shown, until now, only to the person
    // choosing the measurement rather than the one taking it.
    guidance: entry.guidance,
    displayOrder,
  };
}

/**
 * A field somebody typed by hand, as a candidate for the library.
 *
 * Returns null when the library already holds it, so using an existing
 * measurement never quietly creates a second copy of it.
 */
export function fromFormField(
  field: FormField,
  existing: LibraryEntry[],
): Omit<LibraryEntry, "entryId" | "createdAt"> | null {
  if (!field.label.trim()) return null;
  if (findExisting(existing, field.label)) return null;
  return {
    code: codeFor(field.label, existing.map((entry) => entry.code)),
    label: field.label.trim(),
    type: field.type,
    unit: field.unit ?? "",
    min: field.min,
    max: field.max,
    options: field.options,
    guidance: field.guidance ?? "",
    source: "added",
    usageCount: 1,
  };
}
