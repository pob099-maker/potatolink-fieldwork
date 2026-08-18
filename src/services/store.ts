// Local-first repository. Reads come from IndexedDB; grower entries are
// written locally as "pending" and pushed to Supabase by the sync engine
// when a backend is configured and the device is online.

import {
  dataEntryLogSchema,
  formTemplateSchema,
  measurementEventSchema,
  metricSchema,
  trialSchema,
} from "../schemas";
import type {
  Contact,
  DataEntryLog,
  FormField,
  FormTemplate,
  MeasurementEvent,
  Metric,
  PracticeArm,
  Project,
  Result,
  Site,
  SyncStatus,
  Trial,
} from "../types";
import { newId, nowIso } from "../lib/id";
import { dbGetAll, dbPut, dbPutMany, type CollectionName } from "../lib/localdb";
import { isBackendConfigured, supabase, toRow } from "../lib/supabase";
import { fileExtension, getMedia, isMediaPointer, markUploaded, mediaIdFromPointer } from "./media";

const TABLE_NAMES: Partial<Record<CollectionName, string>> = {
  projects: "projects",
  trials: "trials",
  sites: "sites",
  practiceArms: "practice_arms",
  measurementEvents: "measurement_events",
  metrics: "metrics",
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

export interface NewEntryInput {
  siteId: string;
  armId: string;
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
    siteId: input.siteId,
    armId: input.armId,
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
    fields: starterFields,
    createdAt,
  };
  try {
    await dbPutMany([
      { collection: "trials", value: trial },
      { collection: "formTemplates", value: starterTemplate },
    ]);
  } catch {
    return { success: false, error: "Could not save the trial on this device." };
  }
  if (supabase) {
    void supabase.from("trials").upsert(toRow(trial)).then();
    void supabase.from("form_templates").upsert(toRow(starterTemplate)).then();
  }
  notify();
  return { success: true, data: trial };
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

export function startSyncLoop(): void {
  window.addEventListener("online", () => void syncPending());
  window.setInterval(() => void syncPending(), 30_000);
  void syncPending();
}
