// Fieldwork Template CSV (v1): the standardised, one-row-per-field format
// that turns a spreadsheet into a working trial. See the architecture review
// and docs/fieldwork-template-v1.csv for the reference file.
//
// This module is pure: text in, ParsedTrial or errors out. Publishing is in
// templatePublish.ts; rule-level checks are in templateValidate.ts.

import type { Timing } from "./timing";
import type { FieldType, FormAudience, Result, TrialDesign } from "../types";
import { makeFieldName } from "./templates";

export const TEMPLATE_VERSION = "fieldwork-template v1";

export interface ParsedField {
  fieldName: string;
  label: string;
  type: FieldType;
  required: boolean;
  unit: string | null;
  min: number | null;
  max: number | null;
  options: string[] | null;
  isResponse: boolean;
  row: number;
}

export interface ParsedForm {
  name: string;
  eventType: string;
  audience: FormAudience;
  frequency: string;
  requiresSite: boolean;
  requiresArm: boolean;
  /**
   * When this visit is expected, relative to the crop.
   *
   * Optional, and absent means genuinely unscheduled rather than "not filled
   * in yet" — plenty of forms are recorded whenever something happens and
   * should never nag. But it had no way of being set at all before: every
   * trial built here or imported from a CSV published with timing null, and
   * dueList skips a form without timing, so nothing created through the front
   * door ever reached the due list, the banner, or the calendar.
   */
  timing?: Timing | null;
  fields: ParsedField[];
}

export interface ParsedSite {
  location: string;
  region: string;
  soilType: string;
}

export interface ParsedPractice {
  name: string;
  type: "control" | "alternative";
  description: string;
}

export interface ParsedTrial {
  name: string;
  objective: string;
  design: TrialDesign;
  replicates: number;
  /**
   * How the plots are arranged. Absent means "decide from the design", which
   * for a replicated trial means blocks — the arrangement a paddock almost
   * always wants, and the one the trial page already defaults to.
   */
  blocking?: "none" | "blocks";
  sites: ParsedSite[];
  practices: ParsedPractice[];
  forms: ParsedForm[];
}

const FIELD_TYPES: FieldType[] = [
  "number", "text", "select", "multiselect", "slider",
  "photo", "video", "file", "gps", "date", "boolean",
];

const REQUIRED_COLUMNS = ["form", "label", "type"] as const;

/** RFC-4180 CSV reader: quoted cells, embedded commas/quotes/newlines. */
export function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') { cell += '"'; i += 1; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell); cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function truthy(value: string | undefined): boolean {
  return /^(yes|y|true|1)$/i.test((value ?? "").trim());
}

function numberOrNull(value: string | undefined): number | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parse a Fieldwork Template CSV into a trial definition.
 *
 * Layout:
 *   line 1: "# fieldwork-template v1"
 *   trial rows: `trial,<name>` / `objective,<text>` / `design,<observational|replicated>` / `replicates,<n>`
 *   a header row starting with `form`, then one row per field.
 */
export function parseTemplateCsv(text: string): Result<ParsedTrial> {
  const rows = readCsv(text);
  if (rows.length === 0) return { success: false, error: "The file is empty." };

  const marker = rows[0].join(",").replace(/^#\s*/, "").trim().toLowerCase();
  if (marker !== TEMPLATE_VERSION) {
    return {
      success: false,
      error: `Line 1 must be "# ${TEMPLATE_VERSION}" so the app knows how to read the file.`,
    };
  }

  const trial: ParsedTrial = {
    name: "",
    objective: "",
    design: "observational",
    replicates: 0,
    sites: [],
    practices: [],
    forms: [],
  };

  let headerIndex = -1;
  for (let i = 1; i < rows.length; i += 1) {
    const key = rows[i][0]?.trim().toLowerCase();
    if (key === "form") { headerIndex = i; break; }
    const value = (rows[i][1] ?? "").trim();
    if (key === "trial") trial.name = value;
    else if (key === "objective") trial.objective = value;
    else if (key === "design") {
      if (value && value !== "observational" && value !== "replicated") {
        return { success: false, error: `Row ${i + 1}: design must be "observational" or "replicated", got "${value}".` };
      }
      trial.design = (value || "observational") as TrialDesign;
    } else if (key === "replicates") trial.replicates = numberOrNull(value) ?? 0;
    else if (key === "site") {
      if (!value) return { success: false, error: `Row ${i + 1}: a site row needs a location.` };
      trial.sites.push({
        location: value,
        region: (rows[i][2] ?? "").trim(),
        soilType: (rows[i][3] ?? "").trim(),
      });
    } else if (key === "practice") {
      if (!value) return { success: false, error: `Row ${i + 1}: a practice row needs a name.` };
      const practiceType = (rows[i][2] ?? "alternative").trim().toLowerCase();
      if (practiceType !== "control" && practiceType !== "alternative") {
        return {
          success: false,
          error: `Row ${i + 1}: practice type must be "control" or "alternative", got "${practiceType}".`,
        };
      }
      trial.practices.push({
        name: value,
        type: practiceType,
        description: (rows[i][3] ?? "").trim(),
      });
    } else if (key) {
      return { success: false, error: `Row ${i + 1}: unknown setting "${rows[i][0]}". Expected trial, objective, design, replicates, site, practice, or the form header.` };
    }
  }
  if (headerIndex === -1) {
    return { success: false, error: "No field header row found (a row starting with \"form\")." };
  }

  const header = rows[headerIndex].map((column) => column.trim().toLowerCase());
  for (const required of REQUIRED_COLUMNS) {
    if (!header.includes(required)) {
      return { success: false, error: `The field header is missing the "${required}" column.` };
    }
  }
  const col = (name: string, row: string[]): string | undefined => {
    const index = header.indexOf(name);
    return index === -1 ? undefined : row[index];
  };

  const formsByName = new Map<string, ParsedForm>();
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNumber = i + 1;
    const formName = (col("form", row) ?? "").trim();
    const label = (col("label", row) ?? "").trim();
    const typeRaw = (col("type", row) ?? "").trim().toLowerCase();
    if (!formName) return { success: false, error: `Row ${rowNumber}: missing form name.` };
    if (!label) return { success: false, error: `Row ${rowNumber}: missing label (the question to show).` };
    if (!FIELD_TYPES.includes(typeRaw as FieldType)) {
      return {
        success: false,
        error: `Row ${rowNumber}: unknown type "${typeRaw}". Use one of: ${FIELD_TYPES.join(", ")}.`,
      };
    }

    let form = formsByName.get(formName);
    if (!form) {
      const audienceRaw = (col("audience", row) ?? "grower").trim().toLowerCase();
      if (audienceRaw !== "grower" && audienceRaw !== "staff") {
        return { success: false, error: `Row ${rowNumber}: audience must be "grower" or "staff", got "${audienceRaw}".` };
      }
      form = {
        name: formName,
        eventType:
          (col("event_type", row) ?? "").trim() ||
          makeFieldName(formName, [...formsByName.values()].map((f) => f.eventType)),
        audience: audienceRaw,
        frequency: (col("frequency", row) ?? "").trim(),
        requiresSite: col("requires_site", row) === undefined ? true : truthy(col("requires_site", row)),
        requiresArm: col("requires_arm", row) === undefined ? true : truthy(col("requires_arm", row)),
        fields: [],
      };
      formsByName.set(formName, form);
    }

    const options = (col("options", row) ?? "")
      .split("|")
      .map((option) => option.trim())
      .filter(Boolean);

    form.fields.push({
      fieldName:
        (col("field_name", row) ?? "").trim() ||
        makeFieldName(label, form.fields.map((field) => field.fieldName)),
      label,
      type: typeRaw as FieldType,
      required: truthy(col("required", row)),
      unit: (col("unit", row) ?? "").trim() || null,
      min: numberOrNull(col("min", row)),
      max: numberOrNull(col("max", row)),
      options: options.length > 0 ? options : null,
      isResponse: truthy(col("response", row)),
      row: rowNumber,
    });
  }

  trial.forms = [...formsByName.values()];
  if (!trial.name) return { success: false, error: "Missing a \"trial,<name>\" row before the field header." };
  if (trial.forms.length === 0) return { success: false, error: "No field rows found after the header." };
  return { success: true, data: trial };
}

/**
 * The blank starter template offered for download on the import page, so
 * nobody needs repository access to get the format. Kept in code (not fetched)
 * so it works offline and always matches the parser version.
 */
export const REFERENCE_TEMPLATE_CSV = [
  "# fieldwork-template v1",
  "trial,My New Trial",
  "objective,What this trial sets out to show.",
  "design,observational",
  "replicates,0",
  "site,Gatton,Queensland,Alluvial loam",
  "site,Tolga,North Queensland,Red ferrosol",
  "practice,Current practice,control,What the grower does now.",
  "practice,New practice,alternative,The change being tested.",
  "form,event_type,audience,frequency,requires_site,requires_arm,label,field_name,type,required,unit,min,max,options,response,help",
  "Run record,run_record,grower,Each run,yes,yes,Tonnes handled,,number,yes,t,0,,,,Core throughput measure",
  "Run record,run_record,grower,Each run,yes,yes,How well did it work?,,slider,no,,1,5,,,Quick operator rating",
  "Run record,run_record,grower,Each run,yes,yes,Main issue seen,,select,no,,,,issue A | issue B | none,,Structured instead of free text",
  "Run record,run_record,grower,Each run,yes,yes,Did the run go as planned?,,boolean,yes,,,,,,Flags runs to follow up",
  "Run record,run_record,grower,Each run,yes,yes,Photo of the result (optional),,photo,no,,,,,,Visual evidence",
  "Run record,run_record,grower,Each run,yes,yes,Anything else worth noting?,notes,text,no,,,,,,Catch-all; keep it last",
  "Daily weather,weather,staff,Daily during the trial,yes,no,Temperature,,number,yes,°C,,,,,Confounding factor",
  "Cost log,cost_log,staff,Once per trial,no,no,Lease or subscription cost,,number,yes,$,0,,,,For costing elsewhere",
].join("\r\n");

export function downloadReferenceTemplate(): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([REFERENCE_TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "fieldwork-template-v1.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
