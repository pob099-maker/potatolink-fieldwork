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
  MetricValue,
  PracticeArm,
  Project,
  Result,
  ResultSet,
  Site,
  SyncStatus,
  Trial,
} from "../types";
import { newId, nowIso } from "../lib/id";
import { dbDelete, dbGet, dbGetAll, dbPut, dbPutMany, type CollectionName } from "../lib/localdb";
import { fromRow, isBackendConfigured, supabase, toColumn, toRow } from "../lib/supabase";
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
// Editable config records — stable IDs that already exist in the cloud, so
// they need last-writer-wins on pull and a retry path when a save can't reach
// the cloud. (Append-only records like measurement events don't.)
// Records that can be changed after they are written, and the key each one is
// identified by. Being in here buys three things: an updatedAt stamp on save,
// a last-writer-wins guard so a cloud pull can't undo a newer local edit, and
// the key a queued deletion is replayed against.
const EDITABLE: Partial<Record<CollectionName, string>> = {
  trials: "trialId",
  formTemplates: "templateId",
  practiceArms: "armId",
  armAssumptions: "assumptionId",
  economicScenarios: "scenarioId",
  measurementEvents: "eventId",
  metrics: "metricId",
  dataEntryLogs: "entryId",
};

function recordId(collection: CollectionName, record: Record<string, unknown>): string {
  return String(record[EDITABLE[collection] ?? "id"]);
}

function recordTimestamp(record: { updatedAt?: string; createdAt?: string }): string {
  return record.updatedAt ?? record.createdAt ?? "";
}

interface OutboxItem {
  collection: CollectionName;
  id: string;
}

async function readOutbox(): Promise<OutboxItem[]> {
  const stored = await dbGet<{ key: string; items: OutboxItem[] }>("meta", "outbox");
  return stored?.items ?? [];
}

async function writeOutbox(items: OutboxItem[]): Promise<void> {
  await dbPut("meta", { key: "outbox", items });
}

async function enqueueOutbox(collection: CollectionName, id: string): Promise<void> {
  const items = await readOutbox();
  if (!items.some((item) => item.collection === collection && item.id === id)) {
    await writeOutbox([...items, { collection, id }]);
  }
}

async function dequeueOutbox(collection: CollectionName, id: string): Promise<void> {
  const items = await readOutbox();
  await writeOutbox(
    items.filter((item) => !(item.collection === collection && item.id === id)),
  );
}

// Deletions need their own queue: a deleted record is gone from the local
// store, so the save outbox — which re-reads the record before pushing — has
// nothing left to work from. Without this a delete made offline never left
// the device, and the next pull brought the record back.
interface DeletionItem {
  collection: CollectionName;
  id: string;
}

async function readDeletions(): Promise<DeletionItem[]> {
  const stored = await dbGet<{ key: string; items: DeletionItem[] }>("meta", "deletions");
  return stored?.items ?? [];
}

async function enqueueDeletion(collection: CollectionName, id: string): Promise<void> {
  const items = await readDeletions();
  if (!items.some((item) => item.collection === collection && item.id === id)) {
    await dbPut("meta", { key: "deletions", items: [...items, { collection, id }] });
  }
}

/** Replay queued deletions against the cloud; drop each one that lands. */
async function drainDeletions(): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  const items = await readDeletions();
  if (items.length === 0) return;
  const remaining: DeletionItem[] = [];
  for (const item of items) {
    const table = TABLE_NAMES[item.collection];
    const key = EDITABLE[item.collection];
    if (!table || !key) {
      console.warn(`No cloud table or key for a queued ${item.collection} deletion.`);
      continue;
    }
    const { error } = await supabase
      .from(table)
      .delete()
      .eq(toColumn(key), item.id);
    if (error) remaining.push(item);
  }
  if (remaining.length !== items.length) {
    await dbPut("meta", { key: "deletions", items: remaining });
  }
}

/**
 * Save a config record locally, stamp updatedAt for last-writer-wins, then push
 * to Supabase. If the push can't happen (offline) or fails, the record is
 * queued in the outbox and retried by syncPending — so an edit made with no
 * signal is never stranded on one device.
 */
async function saveRecord<T extends object>(
  collection: CollectionName,
  record: T,
  failureMessage: string,
): Promise<Result<T>> {
  const stamped = (
    EDITABLE[collection] ? { ...record, updatedAt: nowIso() } : record
  ) as T & Record<string, unknown>;
  try {
    await dbPut(collection, stamped);
  } catch {
    return { success: false, error: failureMessage };
  }
  notify();

  const table = TABLE_NAMES[collection];
  const id = recordId(collection, stamped);
  if (!supabase || !table) return { success: true, data: stamped };

  if (!navigator.onLine) {
    await enqueueOutbox(collection, id);
    return { success: true, data: stamped };
  }
  const { error } = await supabase.from(table).upsert(toRow(stamped));
  if (error) {
    await enqueueOutbox(collection, id);
    return {
      success: true,
      data: stamped,
      // Not surfaced as failure: the record is safe locally and queued to retry.
    };
  }
  await dequeueOutbox(collection, id);
  return { success: true, data: stamped };
}

/** Push every queued config record to Supabase, in foreign-key-safe order. */
const OUTBOX_ORDER: CollectionName[] = [
  "trials",
  "practiceArms",
  "formTemplates",
  "economicScenarios",
  "armAssumptions",
];

async function drainOutbox(): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  const items = await readOutbox();
  if (items.length === 0) return;
  const ordered = [...items].sort(
    (a, b) => OUTBOX_ORDER.indexOf(a.collection) - OUTBOX_ORDER.indexOf(b.collection),
  );
  for (const item of ordered) {
    const table = TABLE_NAMES[item.collection];
    if (!table) {
      await dequeueOutbox(item.collection, item.id);
      continue;
    }
    const all = await dbGetAll<Record<string, unknown>>(item.collection);
    const record = all.find((candidate) => recordId(item.collection, candidate) === item.id);
    if (!record) {
      await dequeueOutbox(item.collection, item.id);
      continue;
    }
    const { error } = await supabase.from(table).upsert(toRow(record));
    if (!error) await dequeueOutbox(item.collection, item.id);
  }
}

export async function saveAssumption(assumption: ArmAssumption): Promise<Result<ArmAssumption>> {
  const check = armAssumptionSchema.safeParse(assumption);
  if (!check.success) {
    return { success: false, error: "That assumption isn't valid — check the value." };
  }
  return saveRecord("armAssumptions", assumption, "Could not save the assumption.");
}

/**
 * Remove an assumption everywhere. It used to be zeroed in the cloud rather
 * than deleted, because anon had no delete permission — so the next pull
 * brought it back as a live $0 line that quietly sat in the calculation.
 * Migration 0011 grants the delete; if it still fails the row is queued so a
 * later sync finishes the job rather than leaving the two copies disagreeing.
 */
export async function removeAssumption(assumptionId: string): Promise<Result<string>> {
  await dbDelete("armAssumptions", assumptionId);
  notify();
  if (!supabase || !navigator.onLine) {
    await enqueueDeletion("armAssumptions", assumptionId);
    return { success: true, data: "Removed on this device; will remove from the cloud." };
  }
  const { error } = await supabase
    .from("arm_assumptions")
    .delete()
    .eq("assumption_id", assumptionId);
  if (error) {
    await enqueueDeletion("armAssumptions", assumptionId);
    return { success: true, data: "Removed on this device; will remove from the cloud." };
  }
  return { success: true, data: "Removed." };
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
    value: MetricValue;
    unit: string;
    photoUrl: string | null;
  }>;
}

/**
 * Rewrite the answers on an entry that is already saved. A wrong number gets
 * noticed a minute after saving, and the alternative to fixing it is a second
 * entry contradicting the first — which is worse for whoever analyses it.
 *
 * Answers are matched by name: an answer that is gone from the form is deleted
 * rather than left behind, and the entry goes back to pending so the correction
 * reaches the cloud.
 */
export async function updateEntry(
  eventId: string,
  values: NewEntryInput["values"],
): Promise<Result<MeasurementEvent>> {
  const events = await listEvents();
  const event = events.find((candidate) => candidate.eventId === eventId);
  if (!event) return { success: false, error: "That entry no longer exists." };

  const updatedAt = nowIso();
  const existing = (await listMetrics()).filter((metric) => metric.eventId === eventId);
  const byName = new Map(existing.map((metric) => [metric.metricName, metric]));

  const next: Metric[] = values.map((value) => {
    const previous = byName.get(value.metricName);
    byName.delete(value.metricName);
    return {
      metricId: previous?.metricId ?? newId(),
      eventId,
      metricName: value.metricName,
      value: value.value,
      unit: value.unit,
      photoUrl: value.photoUrl,
      createdAt: previous?.createdAt ?? updatedAt,
      updatedAt,
    };
  });
  if (next.some((metric) => !metricSchema.safeParse(metric).success)) {
    return { success: false, error: "That correction failed validation and was not saved." };
  }

  const corrected: MeasurementEvent = { ...event, syncStatus: "pending", updatedAt };
  try {
    await dbPutMany([
      { collection: "measurementEvents", value: corrected },
      ...next.map((metric) => ({ collection: "metrics" as const, value: metric })),
    ]);
    // Whatever the form no longer asks for is removed rather than stranded.
    for (const orphan of byName.values()) {
      await dbDelete("metrics", orphan.metricId);
      await enqueueDeletion("metrics", orphan.metricId);
    }
  } catch {
    return { success: false, error: "Could not save the correction on this device." };
  }

  notify();
  void syncPending();
  return { success: true, data: corrected };
}

/**
 * Remove an entry and everything filed under it. Children go first so the
 * foreign keys hold, both locally and when the queue is replayed.
 */
export async function removeEntry(eventId: string): Promise<Result<string>> {
  const [metrics, logs] = await Promise.all([listMetrics(), listEntryLogs()]);
  const ownMetrics = metrics.filter((metric) => metric.eventId === eventId);
  const ownLogs = logs.filter((log) => log.eventId === eventId);

  try {
    for (const log of ownLogs) await dbDelete("dataEntryLogs", log.entryId);
    for (const metric of ownMetrics) await dbDelete("metrics", metric.metricId);
    await dbDelete("measurementEvents", eventId);
  } catch {
    return { success: false, error: "Could not remove the entry on this device." };
  }

  for (const log of ownLogs) await enqueueDeletion("dataEntryLogs", log.entryId);
  for (const metric of ownMetrics) await enqueueDeletion("metrics", metric.metricId);
  await enqueueDeletion("measurementEvents", eventId);

  notify();
  void syncPending();
  return { success: true, data: "Entry removed." };
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

/**
 * Add a site to a trial. A site needs a host contact for the database
 * relationship; an existing cooperator/grower is reused when there is one,
 * otherwise a placeholder is created that staff can rename later.
 */
export async function addSite(input: {
  trialId: string;
  location: string;
  region?: string;
  soilType?: string;
}): Promise<Result<Site>> {
  const contacts = await listContacts();
  let contact =
    contacts.find((candidate) => candidate.role === "cooperator") ??
    contacts.find((candidate) => candidate.role === "grower") ??
    contacts[0];

  if (!contact) {
    contact = {
      contactId: newId(),
      name: "Site host (to be confirmed)",
      business: "",
      role: "cooperator",
      region: input.region ?? "",
      email: "",
      phone: "",
      tags: [],
      createdAt: nowIso(),
    };
    const savedContact = await saveRecord("contacts", contact, "Could not save the site host.");
    if (!savedContact.success) return { success: false, error: savedContact.error };
  }

  const site: Site = {
    siteId: newId(),
    trialId: input.trialId,
    contactId: contact.contactId,
    location: input.location,
    region: input.region ?? "",
    soilType: input.soilType ?? "",
    coordinates: null,
    createdAt: nowIso(),
  };
  const check = siteSchema.safeParse(site);
  if (!check.success) {
    return { success: false, error: "That site isn't valid — check the location." };
  }
  return saveRecord("sites", site, "Could not save the site.");
}

export async function saveSite(site: Site): Promise<Result<Site>> {
  const check = siteSchema.safeParse(site);
  if (!check.success) {
    return { success: false, error: "That site isn't valid — check the location." };
  }
  return saveRecord("sites", site, "Could not save the site.");
}

/** Whether any record has been filed against a site. */
export async function siteHasData(siteId: string): Promise<boolean> {
  const events = await listEvents();
  return events.some((event) => event.siteId === siteId);
}

/**
 * Remove a site. Only a site with no records is deleted; one that already has
 * data is kept, because deleting it would orphan those records.
 */
export async function removeSite(site: Site): Promise<Result<"deleted" | "kept">> {
  if (await siteHasData(site.siteId)) {
    return {
      success: false,
      error: `"${site.location}" has records against it, so it cannot be removed.`,
    };
  }
  await dbDelete("sites", site.siteId);
  if (supabase) {
    void supabase.from("sites").delete().eq("site_id", site.siteId).then();
  }
  notify();
  return { success: true, data: "deleted" };
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
  return saveRecord("formTemplates", template, "Could not save the form on this device.");
}

// One sync at a time. Push and pull held separate locks, so a pull could land
// a cloud row on top of a record the push was midway through writing and mark
// it synced when it never went (S-5). They now queue behind each other. A
// second call to work already in flight is dropped rather than stacked up —
// the interval comes round again soon enough.
let syncLock: Promise<void> = Promise.resolve();
const inFlight = new Set<string>();

async function serialize<T>(key: string, work: () => Promise<T>, skipped: T): Promise<T> {
  if (inFlight.has(key)) return skipped;
  inFlight.add(key);
  const previous = syncLock;
  let release = (): void => {};
  syncLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await previous;
    return await work();
  } finally {
    inFlight.delete(key);
    release();
  }
}

/** Push all pending measurement events (with metrics and logs) to Supabase. */
export async function syncPending(): Promise<void> {
  if (!isBackendConfigured() || !navigator.onLine) return;
  return serialize("push", pushPending, undefined);
}

async function pushPending(): Promise<void> {
  {
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
    await drainOutbox();
    await drainDeletions();
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

/** Fetch every synced table from Supabase into the local store. */
export async function pullFromCloud(): Promise<Result<string>> {
  if (!isBackendConfigured() || !supabase) {
    return { success: false, error: "No Supabase project configured." };
  }
  if (!navigator.onLine) {
    return { success: false, error: "Offline — will refresh when a connection returns." };
  }
  return serialize<Result<string>>("pull", pullTables, {
    success: true,
    data: "Refresh already in progress.",
  });
}

async function pullTables(): Promise<Result<string>> {
  if (!supabase) return { success: false, error: "No Supabase project configured." };
  {
    const outbox = await readOutbox();
    const deletions = await readDeletions();
    let pulled = 0;
    let unreadable = 0;
    for (const spec of PULL_SPECS) {
      const { data, error } = await supabase.from(spec.table).select("*");
      if (error) {
        return { success: false, error: `Could not fetch ${spec.table}: ${error.message}` };
      }
      const valid: Record<string, unknown>[] = [];
      for (const row of data ?? []) {
        const check = spec.schema.safeParse(fromRow(row as Record<string, unknown>));
        if (check.success) {
          valid.push(check.data as Record<string, unknown>);
        } else {
          // A row the app can't read is a real problem — a schema drift or a
          // bad write. It used to vanish silently, so the device just showed
          // fewer records than the cloud held (S-5).
          unreadable += 1;
          console.warn(
            `Skipped an unreadable ${spec.table} row:`,
            check.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`),
          );
        }
      }

      // A record deleted here but not yet deleted in the cloud must not come
      // back on the next refresh, whatever kind of record it is.
      const pendingDeletes = new Set(
        deletions.filter((item) => item.collection === spec.collection).map((item) => item.id),
      );
      let toWrite = valid.filter(
        (row) => !pendingDeletes.has(recordId(spec.collection, row)),
      );
      // For editable records, never overwrite a newer or still-queued local
      // edit — that is the silent-loss the timestamp guard prevents (S-1).
      if (EDITABLE[spec.collection]) {
        const local = await dbGetAll<Record<string, unknown>>(spec.collection);
        const localById = new Map(local.map((row) => [recordId(spec.collection, row), row]));
        const queued = new Set(
          outbox.filter((item) => item.collection === spec.collection).map((item) => item.id),
        );
        toWrite = toWrite.filter((row) => {
          const id = recordId(spec.collection, row);
          if (queued.has(id)) return false;
          const existing = localById.get(id);
          if (!existing) return true;
          return recordTimestamp(row) >= recordTimestamp(existing);
        });
      }

      await dbPutMany(toWrite.map((value) => ({ collection: spec.collection, value })));
      pulled += toWrite.length;
    }
    if (pulled > 0) notify();
    const warning =
      unreadable > 0
        ? ` ${unreadable} row${unreadable === 1 ? "" : "s"} could not be read and ${
            unreadable === 1 ? "was" : "were"
          } skipped — check the browser console.`
        : "";
    return { success: true, data: `Refreshed ${pulled} records from the cloud.${warning}` };
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
