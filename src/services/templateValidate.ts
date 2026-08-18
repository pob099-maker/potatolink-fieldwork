// Rule-level checks on a parsed template, run before anything is created.
// Errors block publish; warnings ask the person to confirm. This is where
// field mistakes get caught at a desk instead of in a paddock.

import type { ParsedTrial } from "./templateImport";

export interface TemplateIssue {
  level: "error" | "warning";
  row?: number;
  message: string;
}

const RESERVED_FIELD_NAMES = ["replicate"];
const FIELDS_PER_SCREEN = 4;

export function validateTemplate(trial: ParsedTrial): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  const error = (message: string, row?: number) => issues.push({ level: "error", row, message });
  const warn = (message: string, row?: number) => issues.push({ level: "warning", row, message });

  if (!trial.name.trim()) error("The trial has no name.");
  if (trial.design === "replicated" && trial.replicates < 2) {
    error(`A replicated trial needs at least 2 replicates (got ${trial.replicates}).`);
  }

  const eventTypes = new Map<string, string>();
  let growerForms = 0;
  let responseFields = 0;

  for (const form of trial.forms) {
    if (form.fields.length === 0) {
      error(`Form "${form.name}" has no fields.`);
      continue;
    }
    if (form.audience === "grower") growerForms += 1;

    const existing = eventTypes.get(form.eventType);
    if (existing) {
      error(`Forms "${existing}" and "${form.name}" share the event type "${form.eventType}"; records could not be told apart.`);
    }
    eventTypes.set(form.eventType, form.name);

    const seenNames = new Set<string>();
    let freeText = 0;
    for (const field of form.fields) {
      if (seenNames.has(field.fieldName)) {
        error(`Form "${form.name}": two fields share the internal name "${field.fieldName}".`, field.row);
      }
      seenNames.add(field.fieldName);

      if (RESERVED_FIELD_NAMES.includes(field.fieldName)) {
        warn(`Form "${form.name}": "${field.fieldName}" is captured automatically by the app — this field would duplicate it.`, field.row);
      }
      if ((field.type === "select" || field.type === "multiselect") && !field.options) {
        error(`Form "${form.name}": "${field.label}" is a choice list but has no options.`, field.row);
      }
      if (field.min !== null && field.max !== null && field.min > field.max) {
        error(`Form "${form.name}": "${field.label}" has min ${field.min} greater than max ${field.max}.`, field.row);
      }
      if (field.type === "number" && !field.unit) {
        warn(`Form "${form.name}": "${field.label}" is a number with no unit — units keep exported data unambiguous.`, field.row);
      }
      if (field.type === "text") freeText += 1;
      if (field.isResponse) {
        responseFields += 1;
        if (field.type !== "number") {
          error(`"${field.label}" is marked as the response variable but is not a number field.`, field.row);
        }
        if (!form.requiresArm) {
          error(`"${field.label}" is the response variable but its form does not attach to a practice — treatment means could not be computed.`, field.row);
        }
      }
    }

    if (freeText > 2) {
      warn(`Form "${form.name}" has ${freeText} free-text fields — selects and sliders get better completion in the paddock.`);
    }
    if (form.fields.length > FIELDS_PER_SCREEN * 3) {
      warn(`Form "${form.name}" has ${form.fields.length} fields (${Math.ceil(form.fields.length / FIELDS_PER_SCREEN)} screens) — long forms cost completion rate.`);
    }
  }

  if (growerForms === 0) {
    warn("No grower-facing form: the trial page will have no + Add an entry action for growers.");
  }
  if (trial.design === "replicated" && responseFields === 0) {
    error("A replicated trial needs one field marked as the response variable (response column = yes).");
  }
  if (responseFields > 1) {
    error(`${responseFields} fields are marked as the response variable; mark exactly one.`);
  }
  if (trial.design === "observational" && responseFields > 0) {
    warn("A response variable is marked but the design is observational — it will be ignored unless the design is set to replicated.");
  }

  return issues;
}
