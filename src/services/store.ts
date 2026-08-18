// Local-first repository. Reads come from IndexedDB; grower entries are
// written locally as "pending" and pushed to Supabase by the sync engine
// when a backend is configured and the device is online.

import type { ZodTypeAny } from "zod";
import {
  armAssumptionSchema,
  contactSchema,
  dataEntryLogSchema,
  economicScenarioSchema,
  formTemplateSchema,
  measurementEventSchema,
  metricSchema,
  practiceArmSchema,
  projectSchema,
  resultSetSchema,
  siteSchema,
  trialSchema,
} from "../schemas";
import type {
  ArmAssumption,
  Contact,
  DataEntryLog,
  EconomicScenario,
  FormField,
  FormTemplate,
  MeasurementEvent,
  Metric,
  PracticeArm,
  Project,
  Result,
  ResultSet,
  Site,
  SyncStatus,
  Trial,
} from "../types";
import { newId, nowIso } from "../lib/id";
import { dbDelete, dbGetAll, dbPut, dbPutMany, type CollectionName } from "../lib/localdb";
import { fromRow, isBackendConfigured, supabase, toRow } from "../lib/supabase";
import { fileExtension, getMedia, isMediaPointer, markUploaded, mediaIdFromPointer } from "./media";

const TABLE_NAMES: Partial<Record<CollectionName, string>> = {
  projects: "projects",
  trials: "trials",
  sites: "sites",
  practiceArms: "practice_arms",
  armAssumptions: "arm_assumptions",
  measurementEvents: "measurement_events",
  metrics: "metrics",
  economicScenarios: "economic_scenarios",
  resultSets: "result_sets",
  contacts: "contacts",
  formTemplates: "form_templates",
  dataEntryLogs: "data_entry_logs",
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}

export const listProjects = (): Promise<Project[]> => dbGetAll<Project>("projects");
export const listTrials = (): Promise<Trial[]> => dbGetAll<Trial>("trials");
export const listSites = (): Promise<Site[]> => dbGetAll<Site>("sites");
export const listArms = (): Promise<PracticeArm[]> => dbGetAll<PracticeArm>("practiceArms");
export const listContacts = (): Promise<Contact[]> => dbGetAll<Contact>("contacts");
export const listTemplates = (): Promise<FormTemplate[]> =>
  dbGetAll<FormTemplate>("formTemplates");
export const listEvents = (): Promise<MeasurementEvent[]> =>
  dbGetAll<MeasurementEvent>("measurementEvents");
export const listMetrics = (): Promise<Metric[]> => dbGetAll<Metric>("metrics");
export const listEntryLogs = (): Promise<DataEntryLog[]> =>
  dbGetAll<DataEntryLog>("dataEntryLogs");
export const listAssumptions = (): Promise<ArmAssumption[]> =>
  dbGetAll<ArmAssumption>("armAssumptions");
export const listScenarios = (): Promise<EconomicScenario[]> =>
  dbGetAll<EconomicScenario>("economicScenarios");
export const listResults = (): Promise<ResultSet[]> => dbGetAll<ResultSet>("resultSets");

/**
 * Save locally, then mirror to Supabase. The cloud write is awaited rather
 * than fired and forgotten: callers that save related records in sequence
 * (a scenario, then the results referencing it) depend on that order, and an
 * unawaited push can reach Postgres first and be rejected by a foreign key.
 * The local copy is authoritative, so a failed cloud write is reported without
 * losing the record.
 */
async function saveRecord<T extends object>(
  collection: CollectionName,
  record: T,
  failureMessage: string,
): Promise<Result<T>> {
  try {
    await dbPut(collection, record);
  } catch {
    return { success: false, error: failureMessage };
  }
  notify();

  const table = TABLE_NAMES[collection];
  if (supabase && table && navigator.onLine) {
    const { error } = await supabase.from(table).upsert(toRow(record));
    if (error) {
      return {
        success: false,
        error: `Saved on this device, but the cloud copy failed: ${error.message}`,
      };
    }
  }
  return { success: true, data: record };
}

export async function saveAssumption(assumption: ArmAssumption): Promise<Result<ArmAssumption>> {
  const check = armAssumptionSchema.safeParse(assumption);
  if (!check.success) {
    return { success: false, error: "That assumption isn't valid — check the value." };
  }
  return saveRecord("armAssumptions", assumption, "Could not save the assumption.");
}

/** Remove an assumption locally. Cloud rows are kept (no delete policy yet). */
export async function removeAssumption(assumptionId: string): Promise<void> {
  await dbDelete("armAssumptions", assumptionId);
  if (supabase) {
    // Best effort: mark the value zero in the cloud so calculations elsewhere match.
    void supabase
      .from("arm_assumptions")
      .update({ value: 0 })
      .eq("assumption_id", assumptionId)
      .then();
  }
  notify();
}

export async function saveScenario(scenario: EconomicScenario): Promise<Result<EconomicScenario>> {
  const check = economicScenarioSchema.safeParse(scenario);
  if (!check.success) {
    return { success: false, error: "The scenario isn't valid — check the numbers." };
  }
  return saveRecord("economicScenarios", scenario, "Could not save the scenario.");
}

export async function saveResults(results: ResultSet[]): Promise<Result<string>> {
  await dbPutMany(results.map((result) => ({ collection: "resultSets" as const, value: result })));
  notify();
  if (supabase && navigator.onLine && results.length > 0) {
    const { error } = await supabase
      .from("result_sets")
      .upsert(results.map((result) => toRow(result)));
    if (error) {
      return {
        success: false,
        error: `Results saved on this device, but the cloud copy failed: ${error.message}`,
      };
    }
  }
  return { success: true, data: `Stored ${results.length} results.` };
}

export interface NewEntryInput {
  trialId: string;
  siteId: string | null;
  armId: string | null;
  replicate: number | null;
  eventType: string;
  enteredBy: string;
  deviceType: DataEntryLog["deviceType"];
  values: Array<{
    metricName: string;
    value: number | string;
    unit: string;
    photoUrl: string | null;
  }>;
}

/** Save a grower entry locally (event + metrics + entry log), then try to sync. */
export async function addEntry(input: NewEntryInput): Promise<Result<MeasurementEvent>> {
  const createdAt = nowIso();
  const event: MeasurementEvent = {
    eventId: newId(),
    trialId: input.trialId,
    siteId: input.siteId,
    armId: input.armId,
    replicate: input.replicate,
    eventDate: createdAt,
    eventType: input.eventType,
    enteredBy: input.enteredBy,
    syncStatus: "pending",
    createdAt,
  };
  const metrics: Metric[] = input.values.map((value) => ({
    metricId: newId(),
    eventId: event.eventId,
    metricName: value.metricName,
    value: value.value,
    unit: value.unit,
    photoUrl: value.photoUrl,
    createdAt,
  }));
  const log: DataEntryLog = {
    entryId: newId(),
    eventId: event.eventId,
    enteredBy: input.enteredBy,
    entryDate: createdAt,
    deviceType: input.deviceType,
    syncStatus: "pending",
    createdAt,
  };

  const eventCheck = measurementEventSchema.safeParse(event);
  const metricsCheck = metrics.map((metric) => metricSchema.safeParse(metric));
  const logCheck = dataEntryLogSchema.safeParse(log);
  if (!eventCheck.success || !logCheck.success || metricsCheck.some((check) => !check.success)) {
    return { success: false, error: "Entry failed validation and was not saved." };
  }

  try {
    await dbPutMany([
      { collection: "measurementEvents", value: event },
      ...metrics.map((metric) => ({ collection: "metrics" as const, value: metric })),
      { collection: "dataEntryLogs", value: log },
    ]);
  } catch {
    return { success: false, error: "Could not save the entry on this device." };
  }

  notify();
  void syncPending();
  return { success: true, data: event };
}

export async function addTrial(input: {
  projectId: string;
  name: string;
  objective: string;
}): Promise<Result<Trial>> {
  const createdAt = nowIso();
  const trial: Trial = {
    trialId: newId(),
    projectId: input.projectId,
    name: input.name,
    objective: input.objective,
    status: "draft",
    design: "observational",
    replicates: 0,
    responseMetric: null,
    createdAt,
    updatedAt: createdAt,
  };
  const check = trialSchema.safeParse(trial);
  if (!check.success) {
    return { success: false, error: "Trial failed validation." };
  }
  // Every trial starts with an editable form so setup continues in the app.
  const starterFields: FormField[] = [
    {
      fieldName: "notes",
      label: "What did you observe?",
      type: "text",
      required: true,
      options: null,
      min: null,
      max: null,
      unit: null,
      displayOrder: 0,
    },
  ];
  const starterTemplate: FormTemplate = {
    templateId: newId(),
    trialId: trial.trialId,
    armId: null,
    name: `${input.name} record`,
    eventType: "field_record",
    audience: "grower",
    frequency: "",
    requiresSite: true,
    requiresArm: true,
    fields: starterFields,
    createdAt,
  };
  // A trial needs at least a control arm to compare against, so start with one.
  const controlArm: PracticeArm = {
    armId: newId(),
    trialId: trial.trialId,
    name: "Current practice",
    type: "control",
    description: "",
    sortOrder: 0,
    archived: false,
    createdAt,
  };
  try {
    await dbPutMany([
      { collection: "trials", value: trial },
      { collection: "formTemplates", value: starterTemplate },
      { collection: "practiceArms", value: controlArm },
    ]);
  } catch {
    return { success: false, error: "Could not save the trial on this device." };
  }
  if (supabase) {
    void supabase.from("trials").upsert(toRow(trial)).then();
    void supabase.from("form_templates").upsert(toRow(starterTemplate)).then();
    void supabase.from("practice_arms").upsert(toRow(controlArm)).then();
  }
  notify();
  return { success: true, data: trial };
}

/** Persist trial changes, including its design mode. */
export async function saveTrial(trial: Trial): Promise<Result<Trial>> {
  const next = { ...trial, updatedAt: nowIso() };
  const check = trialSchema.safeParse(next);
  if (!check.success) {
    return { success: false, error: "That trial isn't valid — check the design settings." };
  }
  return saveRecord("trials", next, "Could not save the trial.");
}

/** Add a practice arm to a trial. New arms sort after the existing ones. */
export async function addArm(input: {
  trialId: string;
  name: string;
  type: PracticeArm["type"];
  description?: string;
}): Promise<Result<PracticeArm>> {
  const existing = (await listArms()).filter((arm) => arm.trialId === input.trialId);
  const arm: PracticeArm = {
    armId: newId(),
    trialId: input.trialId,
    name: input.name,
    type: input.type,
    description: input.description ?? "",
    sortOrder: existing.reduce((max, candidate) => Math.max(max, candidate.sortOrder), -1) + 1,
    archived: false,
    createdAt: nowIso(),
  };
  const check = practiceArmSchema.safeParse(arm);
  if (!check.success) {
    return { success: false, error: "That practice isn't valid — check the name." };
  }
  return saveRecord("practiceArms", arm, "Could not save the practice.");
}

/** Persist an edited arm (rename, reorder, archive/restore). */
export async function saveArm(arm: PracticeArm): Promise<Result<PracticeArm>> {
  const check = practiceArmSchema.safeParse(arm);
  if (!check.success) {
    return { success: false, error: "That practice isn't valid — check the name." };
  }
  return saveRecord("practiceArms", arm, "Could not save the practice.");
}

/** Whether an arm has any records or economics against it. */
export async function armHasData(armId: string): Promise<boolean> {
  const [events, assumptions, results] = await Promise.all([
    listEvents(),
    listAssumptions(),
    listResults(),
  ]);
  return (
    events.some((event) => event.armId === armId) ||
    assumptions.some((assumption) => assumption.armId === armId) ||
    results.some((result) => result.armId === armId)
  );
}

/**
 * Retire an arm: delete it outright if nothing has been recorded against it
 * (added in error), otherwise archive it so its data survives. Returns which
 * of the two happened.
 */
export async function removeArm(arm: PracticeArm): Promise<Result<"deleted" | "archived">> {
  if (await armHasData(arm.armId)) {
    const archived = await saveArm({ ...arm, archived: true });
    return archived.success
      ? { success: true, data: "archived" }
      : { success: false, error: archived.error };
  }
  await dbDelete("practiceArms", arm.armId);
  if (supabase) {
    void supabase.from("practice_arms").delete().eq("arm_id", arm.armId).then();
  }
  notify();
  return { success: true, data: "deleted" };
}

/** Validate and persist an edited form template, locally and to Supabase. */
export async function saveTemplate(template: FormTemplate): Promise<Result<FormTemplate>> {
  const check = formTemplateSchema.safeParse(template);
  if (!check.success) {
    const firstIssue = check.error.issues[0];
    return {
      success: false,
      error: `The form isn't valid yet: ${firstIssue?.message ?? "check the fields"}.`,
    };
  }
  const names = template.fields.map((field) => field.fieldName);
  if (new Set(names).size !== names.length) {
    return { success: false, error: "Two fields ended up with the same internal name." };
  }
  try {
    await dbPut("formTemplates", template);
  } catch {
    return { success: false, error: "Could not save the form on this device." };
  }
  if (supabase) {
    void supabase.from("form_templates").upsert(toRow(template)).then();
  }
  notify();
  return { success: true, data: template };
}

let syncing = false;

/** Push all pending measurement events (with metrics and logs) to Supabase. */
export async function syncPending(): Promise<void> {
  if (syncing || !isBackendConfigured() || !navigator.onLine) return;
  syncing = true;
  try {
    const [events, metrics, logs] = await Promise.all([
      listEvents(),
      listMetrics(),
      listEntryLogs(),
    ]);
    const pending = events.filter((event) => event.syncStatus !== "synced");
    for (const event of pending) {
      const eventMetrics = metrics.filter((metric) => metric.eventId === event.eventId);
      const eventLogs = logs.filter((log) => log.eventId === event.eventId);
      const status: SyncStatus = (await pushEvent(event, eventMetrics, eventLogs))
        ? "synced"
        : "error";
      await dbPutMany([
        { collection: "measurementEvents", value: { ...event, syncStatus: status } },
        ...eventLogs.map((log) => ({
          collection: "dataEntryLogs" as const,
          value: { ...log, syncStatus: status },
        })),
      ]);
    }
    if (pending.length > 0) notify();
  } finally {
    syncing = false;
  }
}

const MEDIA_BUCKET = "media";

/**
 * Upload a metric's on-device media blob to Supabase Storage and return the
 * metric with its pointer replaced by the public URL. Returns null when the
 * upload fails so the whole event is retried on the next sync cycle.
 */
async function resolveMediaPointer(metric: Metric): Promise<Metric | null> {
  if (!supabase || !isMediaPointer(metric.photoUrl)) return metric;
  const item = await getMedia(mediaIdFromPointer(metric.photoUrl));
  if (!item) {
    // The blob is gone (cleared browser data); sync the record without media.
    return { ...metric, photoUrl: null };
  }
  if (item.uploadedUrl) {
    return { ...metric, photoUrl: item.uploadedUrl };
  }
  const path = `${metric.eventId}/${item.mediaId}.${fileExtension(item.mimeType)}`;
  const upload = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, item.blob, { contentType: item.mimeType, upsert: true });
  if (upload.error) return null;
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  await markUploaded(item, data.publicUrl);
  return { ...metric, photoUrl: data.publicUrl };
}

async function pushEvent(
  event: MeasurementEvent,
  metrics: Metric[],
  logs: DataEntryLog[],
): Promise<boolean> {
  if (!supabase) return false;

  const resolvedMetrics: Metric[] = [];
  for (const metric of metrics) {
    const resolved = await resolveMediaPointer(metric);
    if (!resolved) return false;
    if (resolved !== metric) await dbPut("metrics", resolved);
    resolvedMetrics.push(resolved);
  }

  const eventResult = await supabase
    .from("measurement_events")
    .upsert(toRow({ ...event, syncStatus: "synced" }));
  if (eventResult.error) return false;
  const metricsResult = await supabase
    .from("metrics")
    .upsert(resolvedMetrics.map((m) => toRow(m)));
  if (metricsResult.error) return false;
  const logsResult = await supabase
    .from("data_entry_logs")
    .upsert(logs.map((log) => toRow({ ...log, syncStatus: "synced" })));
  return !logsResult.error;
}

/**
 * Mirror seed/base records up to Supabase so a fresh backend matches local.
 * Order matters: referenced tables (projects, contacts) go before the tables
 * that point at them.
 */
export async function pushBaseData(): Promise<Result<string>> {
  if (!supabase) return { success: false, error: "No Supabase project configured." };
  const pairs: Array<[CollectionName, unknown[]]> = [
    ["projects", await listProjects()],
    ["contacts", await listContacts()],
    ["trials", await listTrials()],
    ["sites", await listSites()],
    ["practiceArms", await listArms()],
    ["formTemplates", await listTemplates()],
  ];
  let pushed = 0;
  for (const [collection, records] of pairs) {
    const table = TABLE_NAMES[collection];
    if (!table || records.length === 0) continue;
    const { error } = await supabase
      .from(table)
      .upsert(records.map((record) => toRow(record as Record<string, unknown>)));
    if (error) {
      return { success: false, error: `Could not push ${table}: ${error.message}` };
    }
    pushed += records.length;
  }
  return { success: true, data: `Pushed ${pushed} setup records to Supabase.` };
}

// Cloud → device. Every synced table is fetched, validated, and merged into
// the local store by ID. Local *pending* entries are never touched — their
// IDs don't exist in the cloud until this device pushes them.
const PULL_SPECS: Array<{ collection: CollectionName; table: string; schema: ZodTypeAny }> = [
  { collection: "projects", table: "projects", schema: projectSchema },
  { collection: "contacts", table: "contacts", schema: contactSchema },
  { collection: "trials", table: "trials", schema: trialSchema },
  { collection: "sites", table: "sites", schema: siteSchema },
  { collection: "practiceArms", table: "practice_arms", schema: practiceArmSchema },
  { collection: "armAssumptions", table: "arm_assumptions", schema: armAssumptionSchema },
  { collection: "formTemplates", table: "form_templates", schema: formTemplateSchema },
  { collection: "measurementEvents", table: "measurement_events", schema: measurementEventSchema },
  { collection: "metrics", table: "metrics", schema: metricSchema },
  { collection: "economicScenarios", table: "economic_scenarios", schema: economicScenarioSchema },
  { collection: "resultSets", table: "result_sets", schema: resultSetSchema },
  { collection: "dataEntryLogs", table: "data_entry_logs", schema: dataEntryLogSchema },
];

let pulling = false;

/** Fetch every synced table from Supabase into the local store. */
export async function pullFromCloud(): Promise<Result<string>> {
  if (!isBackendConfigured() || !supabase) {
    return { success: false, error: "No Supabase project configured." };
  }
  if (!navigator.onLine) {
    return { success: false, error: "Offline — will refresh when a connection returns." };
  }
  if (pulling) return { success: true, data: "Refresh already in progress." };
  pulling = true;
  try {
    let pulled = 0;
    for (const spec of PULL_SPECS) {
      const { data, error } = await supabase.from(spec.table).select("*");
      if (error) {
        return { success: false, error: `Could not fetch ${spec.table}: ${error.message}` };
      }
      const valid: unknown[] = [];
      for (const row of data ?? []) {
        const check = spec.schema.safeParse(fromRow(row as Record<string, unknown>));
        if (check.success) valid.push(check.data);
      }
      await dbPutMany(valid.map((value) => ({ collection: spec.collection, value })));
      pulled += valid.length;
    }
    if (pulled > 0) notify();
    return { success: true, data: `Refreshed ${pulled} records from the cloud.` };
  } finally {
    pulling = false;
  }
}

export function startSyncLoop(): void {
  window.addEventListener("online", () => {
    void syncPending();
    void pullFromCloud();
  });
  window.setInterval(() => void syncPending(), 30_000);
  window.setInterval(() => void pullFromCloud(), 60_000);
  void syncPending();
  void pullFromCloud();
}
