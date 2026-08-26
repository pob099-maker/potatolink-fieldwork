// Reading a soil report into samples and results.
//
// One row per attribute result, which is the shape a laboratory report and
// ANSIS both arrive in, and the shape that survives a new attribute being
// added. A column-per-attribute sheet — pH, EC, OC across the top — has to be
// migrated every time somebody measures something new, and cannot hold two
// methods for the same attribute at all.
//
// Rows are grouped into samples by point, date and depth interval, because
// that is what a sample is: a place, a day, and a slice of the profile. Depth
// is not optional. A pH with no depth attached cannot be compared with the pH
// from the next paddock, and national soil datasets are depth-based for that
// reason.
//
// The interpreted label and the measured values are kept apart on purpose. A
// classification is somebody's judgement — useful, and not a measurement —
// so it sits on the sample, while everything with a unit sits in the results.

import { newId } from "../lib/id";
import { readCsv } from "./templateImport";
import { attributeProblem, findAttribute } from "./soilAttributes";
import type { Result, SoilResult, SoilSample, SoilSource } from "../types";

export const SOIL_TEMPLATE_HEADERS = [
  "sample_point_id",
  "sample_date",
  "depth_from_cm",
  "depth_to_cm",
  "lat",
  "lon",
  "soil_source",
  "soil_classification",
  "classification_system",
  "attribute_code",
  "attribute_name",
  "value",
  "text_value",
  "unit",
  "method_code",
  "method_ref",
  "note",
] as const;

const REQUIRED = ["sample_point_id", "sample_date", "depth_from_cm", "depth_to_cm", "attribute_code"];

export interface ParsedSoil {
  samples: SoilSample[];
  results: SoilResult[];
  /** Attribute codes not in the controlled list — stored, but worth saying. */
  uncontrolled: string[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const number = (raw: string | undefined): number | null => {
  const text = (raw ?? "").trim();
  if (text === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

const SOURCES: SoilSource[] = ["ansis", "lab", "field", "grower"];

/**
 * Parse a soil CSV for one site.
 *
 * Everything is checked before anything is created: a half-imported soil
 * profile is worse than none, because the gap is invisible once the file has
 * been filed away.
 */
export function parseSoilCsv(text: string, siteId: string): Result<ParsedSoil> {
  const rows = readCsv(text);
  if (rows.length === 0) return { success: false, error: "The file is empty." };

  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const missing = REQUIRED.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    return {
      success: false,
      error: `The file is missing ${missing.join(", ")}. Download the blank template to see the columns.`,
    };
  }

  const col = (name: string, row: string[]): string => {
    const at = header.indexOf(name);
    return at === -1 ? "" : (row[at] ?? "").trim();
  };

  const samples = new Map<string, SoilSample>();
  const results: SoilResult[] = [];
  const uncontrolled = new Set<string>();
  const createdAt = new Date().toISOString();

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.every((cell) => cell.trim() === "")) continue;
    const line = index + 1;

    const pointId = col("sample_point_id", row);
    const sampleDate = col("sample_date", row);
    const from = number(col("depth_from_cm", row));
    const to = number(col("depth_to_cm", row));
    const attributeCode = col("attribute_code", row).toLowerCase();

    if (!pointId) return { success: false, error: `Row ${line}: sample_point_id is blank.` };
    if (!DATE.test(sampleDate)) {
      return { success: false, error: `Row ${line}: sample_date must look like 2026-09-01, got "${sampleDate}".` };
    }
    if (from === null || to === null) {
      return { success: false, error: `Row ${line}: both depths are needed — a result with no depth cannot be compared with anything.` };
    }
    if (from < 0 || to < 0) return { success: false, error: `Row ${line}: depths cannot be negative.` };
    if (to <= from) {
      return { success: false, error: `Row ${line}: depth_to_cm (${to}) must be below depth_from_cm (${from}).` };
    }
    if (!attributeCode) return { success: false, error: `Row ${line}: attribute_code is blank.` };

    const sourceRaw = (col("soil_source", row) || "lab").toLowerCase();
    if (!SOURCES.includes(sourceRaw as SoilSource)) {
      return {
        success: false,
        error: `Row ${line}: soil_source must be one of ${SOURCES.join(", ")}, got "${sourceRaw}".`,
      };
    }

    const lat = number(col("lat", row));
    const lon = number(col("lon", row));
    if (lat !== null && (lat < -90 || lat > 90)) {
      return { success: false, error: `Row ${line}: latitude ${lat} is not on Earth.` };
    }
    if (lon !== null && (lon < -180 || lon > 180)) {
      return { success: false, error: `Row ${line}: longitude ${lon} is not on Earth.` };
    }

    const key = `${pointId}|${sampleDate}|${from}|${to}`;
    let sample = samples.get(key);
    if (!sample) {
      sample = {
        sampleId: newId(),
        siteId,
        soilSource: sourceRaw as SoilSource,
        soilClassification: col("soil_classification", row),
        classificationSystem: col("classification_system", row) || "unspecified",
        sampleDate,
        samplePointId: pointId,
        lat,
        lon,
        depthFromCm: from,
        depthToCm: to,
        note: col("note", row),
        createdAt,
      };
      samples.set(key, sample);
    }

    const attribute = findAttribute(attributeCode);
    if (!attribute) uncontrolled.add(attributeCode);

    const value = number(col("value", row));
    const textValue = col("text_value", row);
    const unit = col("unit", row) || attribute?.unit || "";

    if (value === null && !textValue) {
      return { success: false, error: `Row ${line}: needs a value or a text_value.` };
    }

    // Only bounds-check what the vocabulary knows about; an uncontrolled code
    // is stored as given rather than judged against rules that do not exist.
    if (attribute && value !== null) {
      const problem = attributeProblem(attributeCode, value, unit);
      if (problem) return { success: false, error: `Row ${line}: ${problem}` };
    }

    results.push({
      resultId: newId(),
      sampleId: sample.sampleId,
      attributeCode,
      attributeName: col("attribute_name", row) || attribute?.name || attributeCode,
      value,
      textValue,
      unit,
      methodCode: col("method_code", row) || "unspecified",
      methodRef: col("method_ref", row),
      createdAt,
    });
  }

  if (results.length === 0) return { success: false, error: "No soil results found after the header." };

  return {
    success: true,
    data: { samples: [...samples.values()], results, uncontrolled: [...uncontrolled] },
  };
}

/** A blank file with the columns and one worked row, matching the CSV importer's idiom. */
export function soilTemplateCsv(): string {
  const example = [
    "P1", "2026-09-01", "0", "10", "-34.7412", "142.1938", "lab",
    "Red Chromosol", "asc", "ph_cacl2", "pH (CaCl₂)", "5.4", "", "pH",
    "rayment_4b1", "Rayment & Lyons 4B1", "Sampled before planting",
  ];
  const second = [
    "P1", "2026-09-01", "10", "30", "-34.7412", "142.1938", "lab",
    "Red Chromosol", "asc", "organic_carbon", "Organic carbon", "0.9", "", "%",
    "rayment_6b2", "", "",
  ];
  return [SOIL_TEMPLATE_HEADERS.join(","), example.join(","), second.join(",")].join("\r\n") + "\r\n";
}
