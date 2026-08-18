// Turn a validated ParsedTrial into live config — a trial, its forms, and a
// starter control arm — using the same store writes everything else uses, so
// the new trial syncs to every device like any other.

import type { FormTemplate, Result, Trial } from "../types";
import { newId, nowIso } from "../lib/id";
import { addArm, addTrial, listTemplates, saveTemplate, saveTrial } from "./store";
import type { ParsedTrial } from "./templateImport";
import { validateTemplate } from "./templateValidate";

export async function publishParsedTrial(parsed: ParsedTrial): Promise<Result<Trial>> {
  const blocking = validateTemplate(parsed).filter((issue) => issue.level === "error");
  if (blocking.length > 0) {
    return { success: false, error: `Fix ${blocking.length} error(s) before creating the trial.` };
  }

  // Response variable: the single field flagged in the CSV.
  const responseField = parsed.forms
    .flatMap((form) => form.fields)
    .find((field) => field.isResponse);

  const created = await addTrial({
    projectId: "5f0a6c1e-0001-4000-8000-000000000001",
    name: parsed.name,
    objective: parsed.objective,
  });
  if (!created.success) return created;
  let trial = created.data;

  if (parsed.design === "replicated") {
    const updated = await saveTrial({
      ...trial,
      design: "replicated",
      replicates: parsed.replicates,
      responseMetric: responseField?.fieldName ?? null,
    });
    if (!updated.success) return { success: false, error: updated.error };
    trial = updated.data;
  }

  // addTrial creates a one-question starter grower form. Rather than deleting
  // it (a local delete would resurrect from the cloud on the next pull), the
  // CSV's first grower form takes over its templateId and overwrites it.
  const starter = (await listTemplates()).find(
    (candidate) => candidate.trialId === trial.trialId && candidate.audience === "grower",
  );
  let starterId: string | null = starter?.templateId ?? null;

  const createdAt = nowIso();

  for (const form of parsed.forms) {
    const reuseId = form.audience === "grower" ? starterId : null;
    if (reuseId) starterId = null;
    const template: FormTemplate = {
      templateId: reuseId ?? newId(),
      trialId: trial.trialId,
      armId: null,
      name: form.name,
      eventType: form.eventType,
      audience: form.audience,
      frequency: form.frequency,
      requiresSite: form.requiresSite,
      requiresArm: form.requiresArm,
      fields: form.fields.map((field, index) => ({
        fieldName: field.fieldName,
        label: field.label,
        type: field.type,
        required: field.required,
        options: field.options,
        min: field.min,
        max: field.max,
        unit: field.unit,
        displayOrder: index,
      })),
      createdAt,
    };
    const saved = await saveTemplate(template);
    if (!saved.success) return { success: false, error: saved.error };
  }

  // A second practice so the trial is comparable out of the box; staff rename
  // or extend in Practices.
  await addArm({ trialId: trial.trialId, name: "Alternative practice", type: "alternative" });

  return { success: true, data: trial };
}
