// Helpers for editing form templates in the app. Templates are pure data:
// the grower form renders whatever is configured here, so no code changes
// are ever needed for new questions or trial types.

import type { FieldType, FormField } from "../types";

/** Turn a plain-language label into a stable camelCase field name. */
export function makeFieldName(label: string, taken: string[]): string {
  const words = label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
  let base =
    words.length === 0
      ? "field"
      : words[0] + words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join("");
  if (/^\d/.test(base)) base = `f${base}`;
  let candidate = base;
  let counter = 2;
  while (taken.includes(candidate)) {
    candidate = `${base}${counter}`;
    counter += 1;
  }
  return candidate;
}

export function blankField(label: string, taken: string[], order: number): FormField {
  return {
    fieldName: makeFieldName(label, taken),
    label,
    type: "text",
    required: false,
    options: null,
    min: null,
    max: null,
    unit: null,
    displayOrder: order,
  };
}

export function moveField(fields: FormField[], index: number, delta: -1 | 1): FormField[] {
  const target = index + delta;
  if (target < 0 || target >= fields.length) return fields;
  const next = [...fields];
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((field, order) => ({ ...field, displayOrder: order }));
}

const OPTION_TYPES: FieldType[] = ["select", "multiselect"];

/** Clear the attributes that don't apply to a field's (possibly new) type. */
export function normaliseField(field: FormField, type: FieldType): FormField {
  const next: FormField = { ...field, type };
  if (!OPTION_TYPES.includes(type)) next.options = null;
  if (type !== "number" && type !== "slider") {
    next.min = null;
    next.max = null;
  }
  if (type === "slider") {
    next.min = next.min ?? 1;
    next.max = next.max ?? 5;
  }
  if (type !== "number") {
    next.unit = null;
    // A sum only makes sense as a number. Left behind on a photo field it
    // would be invisible and still saved, which is how a stale formula comes
    // back to life the day somebody switches the type back.
    delete next.formula;
  }
  if (OPTION_TYPES.includes(type) && (!next.options || next.options.length === 0)) {
    next.options = ["option 1", "option 2"];
  }
  return next;
}

export function hasOptions(type: FieldType): boolean {
  return OPTION_TYPES.includes(type);
}

export const FIELD_TYPE_HELP: Array<{ type: FieldType; label: string; hint: string }> = [
  { type: "number", label: "Number", hint: "Measured or counted values — set a unit and limits" },
  { type: "select", label: "Choice list (pick one)", hint: "A known list of outcomes; better than free text" },
  {
    type: "multiselect",
    label: "Choice list (pick many)",
    hint: "Tap-all-that-apply chips — e.g. every defect seen",
  },
  { type: "slider", label: "Rating slider", hint: "Gut-feel scores, 1–5 works best" },
  { type: "boolean", label: "Yes / no", hint: "Two big buttons" },
  { type: "date", label: "Date", hint: "Only when it differs from the entry date" },
  { type: "photo", label: "Photo", hint: "Camera capture, up to 20 MB" },
  { type: "video", label: "Video", hint: "Camera capture, up to 100 MB (~1 min)" },
  { type: "file", label: "File attachment", hint: "CSV exports, PDFs, spreadsheets — up to 25 MB" },
  { type: "gps", label: "GPS location", hint: "One tap captures the phone's coordinates" },
  { type: "text", label: "Free text", hint: "Last resort — keep one notes field at the end" },
];
