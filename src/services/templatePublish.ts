// Turn a validated ParsedTrial into live config — a trial, its forms, and a
// starter control arm — using the same store writes everything else uses, so
// the new trial syncs to every device like any other.

import type { FormTemplate, Result, Trial } from "../types";
import { newId, nowIso } from "../lib/id";
import {
  addArm,
  addSite,
  addTrial,
  listArms,
  listTemplates,
  saveArm,
  saveTemplate,
  saveTrial,
} from "./store";
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

  // The response variable is set whatever the design.
  //
  // It used to be stored only for a replicated trial, so an observational
  // comparison — two ways of doing something, recorded side by side — imported
  // and recorded perfectly and then compared nothing at all. The statistics do
  // not care: responseSummary produces means and standard errors per practice
  // from whatever was recorded, and the results page renders them off
  // responseMetric alone. Only this gate stood in the way, and a grading line
  // being run two ways is exactly the trial the app describes observational
  // designs as being for: "record what happens under each, and show a
  // neighbour the difference".
  const wantsResponse = responseField && trial.responseMetric !== responseField.fieldName;
  if (parsed.design === "replicated" || wantsResponse) {
    const updated = await saveTrial({
      ...trial,
      design: parsed.design,
      replicates: parsed.design === "replicated" ? parsed.replicates : trial.replicates,
      // Blocked unless told otherwise. Neither route set this, so a trial
      // created by answering "how many blocks?" came out completely
      // randomised — the wizard's own words promising an arrangement the
      // trial did not have, silently.
      blocking: parsed.design === "replicated" ? (parsed.blocking ?? "blocks") : trial.blocking,
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
      // Imported protocols carry prose, not a schedule. Timing is set on the
      // trial page once somebody decides what the form hangs off.
      timing: form.timing ?? null,
      requiresSite: form.requiresSite,
      requiresArm: form.requiresArm,
      commerciallySensitive: form.commerciallySensitive,
      fields: form.fields.map((field, index) => ({
        fieldName: field.fieldName,
        label: field.label,
        type: field.type,
        required: field.required,
        options: field.options,
        min: field.min,
        max: field.max,
        unit: field.unit,
        guidance: field.guidance,
        displayOrder: index,
      })),
      createdAt,
    };
    const saved = await saveTemplate(template);
    if (!saved.success) return { success: false, error: saved.error };
  }

  // Sites from the CSV, so a demosite trial arrives ready to record rather
  // than needing them typed in afterwards.
  for (const site of parsed.sites) {
    const saved = await addSite({
      trialId: trial.trialId,
      location: site.location,
      region: site.region,
      soilType: site.soilType,
    });
    if (!saved.success) return { success: false, error: saved.error };
  }

  // Practices from the CSV. addTrial already created a control arm, so the
  // first control in the file renames it rather than adding a duplicate.
  const existingArms = (await listArms()).filter((arm) => arm.trialId === trial.trialId);
  let starterControl = existingArms.find((arm) => arm.type === "control");

  for (const practice of parsed.practices) {
    if (practice.type === "control" && starterControl) {
      const renamed = await saveArm({
        ...starterControl,
        name: practice.name,
        description: practice.description,
      });
      if (!renamed.success) return { success: false, error: renamed.error };
      starterControl = undefined;
      continue;
    }
    const added = await addArm({
      trialId: trial.trialId,
      name: practice.name,
      type: practice.type,
      description: practice.description,
    });
    if (!added.success) return { success: false, error: added.error };
  }

  // Nothing in the file: leave a second practice so the trial is comparable
  // out of the box, and staff rename it in Practices.
  if (parsed.practices.length === 0) {
    await addArm({ trialId: trial.trialId, name: "Alternative practice", type: "alternative" });
  }

  return { success: true, data: trial };
}
