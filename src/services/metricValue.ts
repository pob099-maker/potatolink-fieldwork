// How a recorded answer is stored, read and exported.
//
// Yes/no and multi-choice answers used to be flattened to strings on the way
// in — `true`, or `"Scab, Greening"`. That reads fine on screen and badly
// everywhere else: a biometrician receiving the export had to split a comma
// field back apart and guess whether "true" was a word or a boolean. Values
// now keep their own shape in storage, and are turned into text only at the
// edges, here.

import type { FormField, Metric, MetricValue } from "../types";

function asText(value: MetricValue): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  // Records written before values kept their type still hold these strings.
  if (value === "true") return "Yes";
  if (value === "false") return "No";
  if (Array.isArray(value)) return value.join("; ");
  return String(value);
}

/** A value as a person reads it: "Yes", "Scab; Greening", "12.4 t/ha". */
export function metricDisplay(value: MetricValue, unit = ""): string {
  const text = asText(value);
  return unit && text !== "" ? `${text} ${unit}` : text;
}

/**
 * The values a metric contributes to a tidy export — normally one, but a
 * multi-choice answer becomes one row per selection. That is what long format
 * means: three defects observed is three observations, not one joined string
 * for the analyst to unpick.
 */
export function metricExportValues(value: MetricValue): string[] {
  if (Array.isArray(value)) return value.length > 0 ? value.map(String) : [""];
  if (typeof value === "boolean") return [value ? "true" : "false"];
  return [String(value)];
}

/**
 * The number behind a value, or null when there isn't one. Guards the stats
 * summaries: `Number([])` is 0 and `Number(true)` is 1, so a multi-choice or
 * yes/no answer would otherwise be averaged as if it were a measurement.
 */
export function metricNumber(value: MetricValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** True when the metric points at an uploaded or on-device file. */
export function isMediaMetric(metric: Metric): boolean {
  return metric.photoUrl !== null && metric.photoUrl !== "";
}

/**
 * Turn a stored answer back into what the form control expects, so an entry
 * being corrected opens with what was actually recorded. Records written
 * before answers kept their type are converted on the way in, which is also
 * how an old entry gets repaired simply by being corrected.
 */
export function metricFormValue(field: FormField, metric: Metric | undefined): unknown {
  if (!metric) return undefined;
  if (field.type === "photo" || field.type === "video" || field.type === "file") {
    return metric.photoUrl ?? "";
  }
  const { value } = metric;
  switch (field.type) {
    case "multiselect":
      if (Array.isArray(value)) return value;
      return typeof value === "string" && value !== ""
        ? value.split(/[,;]\s*/).filter(Boolean)
        : [];
    case "boolean":
      return typeof value === "boolean" ? value : value === "true";
    case "number":
    case "slider":
      return metricNumber(value) ?? undefined;
    default:
      return Array.isArray(value) ? value.join("; ") : String(value);
  }
}
