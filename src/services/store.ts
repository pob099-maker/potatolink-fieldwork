// Local-first repository. Reads come from IndexedDB; grower entries are
// written locally as "pending" and pushed to Supabase by the sync engine
// when a backend is configured and the device is online.

import type { ZodTypeAny } from "zod";
import { summariseSync, type SyncState } from "./syncHealth";
import {
  armAssumptionSchema,
  contactSchema,
  trialMemberSchema,
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
  weatherObservationSchema,
  soilSampleSchema,
  soilResultSchema,
  libraryEntrySchema,
  factorSchema,
  factorLevelSchema,
} from "../schemas";
import type {
  FormAudience,
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
  WeatherObservation,
  SoilSample,
  SoilResult,
  LibraryEntry,
  Factor,
  FactorLevel,
  TrialMember,
} from "../types";
import { newId, nowIso } from "../lib/id";
import { dbDelete, dbGet, dbGetAll, dbPut, dbPutMany, type CollectionName } from "../lib/localdb";
import { fromRow, isBackendConfigured, supabase, toColumn, toRow } from "../lib/supabase";
import { fileExtension, getMedia, isMediaPointer, markUploaded, mediaIdFromPointer } from "./media";
import { makeFieldName } from "./templates";
import { findExisting, fromFormField, isBuiltIn, libraryEntries } from "./measurementLibrary";
import { involvementFor } from "./involvement";
import { buildCombinations, canBuild, designLoad } from "./factorial";

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
  weatherObservations: "weather_observations",
  soilSamples: "soil_samples",
  soilResults: "soil_results",
  measurementLibrary: "measurement_library",
  trialMembers: "trial_members",
  factors: "factors",
  factorLevels: "factor_levels",
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
export const listWeather = (): Promise<WeatherObservation[]> =>
  dbGetAll<WeatherObservation>("weatherObservations");
export const listSoilSamples = (): Promise<SoilSample[]> => dbGetAll<SoilSample>("soilSamples");
export const listSoilResults = (): Promise<SoilResult[]> => dbGetAll<SoilResult>("soilResults");
export const listLibrary = (): Promise<LibraryEntry[]> =>
  dbGetAll<LibraryEntry>("measurementLibrary");
export const listFactors = (): Promise<Factor[]> => dbGetAll<Factor>("factors");
export const listFactorLevels = (): Promise<FactorLevel[]> =>
  dbGetAll<FactorLevel>("factorLevels");

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

/**
 * The primary key of every collection, which is a different question from
 * whether a record is editable. EDITABLE was doing both jobs, so a collection
 * that can be deleted but never carries an updatedAt — sites — had no key at
 * all: its queued deletions were dropped on the floor, and identifying one of
 * its rows fell back to a field that does not exist.
 */
const PRIMARY_KEY: Record<CollectionName, string> = {
  projects: "projectId",
  contacts: "contactId",
  trials: "trialId",
  sites: "siteId",
  practiceArms: "armId",
  armAssumptions: "assumptionId",
  formTemplates: "templateId",
  measurementEvents: "eventId",
  metrics: "metricId",
  economicScenarios: "scenarioId",
  resultSets: "resultId",
  dataEntryLogs: "entryId",
  adoptionFollowups: "followupId",
  weatherObservations: "observationId",
  soilSamples: "sampleId",
  soilResults: "resultId",
  measurementLibrary: "entryId",
  trialMembers: "memberId",
  factors: "factorId",
  factorLevels: "levelId",
  media: "mediaId",
  meta: "key",
};

function recordId(collection: CollectionName, record: Record<string, unknown>): string {
  return String(record[PRIMARY_KEY[collection]]);
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

// A queued save is retried on every sync, which is right for a dropped
// connection and wrong for a permanent refusal — a column the cloud doesn't
// have yet, a row-level security policy that says no. Those retry forever, and
// until now nothing said so: the app looked connected, the dashboard counted
// entries as synced, and the setup records sat on one device. So the last
// refusal is kept and shown.
export interface SyncTrouble {
  /** How many records are waiting. */
  count: number;
  /** What the cloud said, verbatim — it usually names the real problem. */
  message: string;
  at: string;
}

async function recordTrouble(count: number, message: string): Promise<void> {
  await dbPut("meta", { key: "syncTrouble", count, message, at: nowIso() });
}

async function clearTrouble(): Promise<void> {
  await dbDelete("meta", "syncTrouble");
}

/**
 * What has not reached the cloud from this device, split by whether it is
 * going to get there on its own. A record the cloud refused is not "waiting"
 * for anything, and counting it as though it were is how sixteen dead entries
 * sat behind a green banner.
 *
 * This is a property of the device, not of any one trial — the queue and the
 * connection belong to the phone in somebody's hand. A trial's own count of
 * outstanding entries is a different question, answered where the trial is.
 */
export async function waitingToSync(): Promise<SyncState> {
  const queued = (await readOutbox()).length;
  const deletions = (await readDeletions()).length;
  const events = await dbGetAll<MeasurementEvent>("measurementEvents");
  return summariseSync(events, queued, deletions);
}

/**
 * What this device is for.
 *
 * A phone that has recorded an observation is almost certainly a field phone,
 * and sending it to a staff dashboard every time costs the person three taps
 * before they reach the only screen they want. A laptop that sets trials up
 * should keep opening on the dashboard.
 *
 * It follows the last thing actually done rather than asking: saving an entry
 * makes a device a recording device, and following the "setting up trials"
 * link back makes it a setup one. Both are explicit acts, so the guess is
 * always one tap from being corrected — and it is stated in Settings rather
 * than left as magic.
 */
export type DeviceRole = "recording" | "setup";

export async function deviceRole(): Promise<DeviceRole> {
  const stored = await dbGet<{ key: string; role: DeviceRole }>("meta", "deviceRole");
  return stored?.role ?? "setup";
}

export async function setDeviceRole(role: DeviceRole): Promise<void> {
  await dbPut("meta", { key: "deviceRole", role });
  notify();
}

/** The last unresolved push refusal, or null when everything has gone through. */
export async function syncTrouble(): Promise<SyncTrouble | null> {
  const stored = await dbGet<{ key: string } & SyncTrouble>("meta", "syncTrouble");
  if (!stored) return null;
  return { count: stored.count, message: stored.message, at: stored.at };
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
  const done = new Set<string>();
  for (const item of items) {
    const table = TABLE_NAMES[item.collection];
    const key = PRIMARY_KEY[item.collection];
    if (!table || !key) {
      console.warn(`No cloud table or key for a queued ${item.collection} deletion.`);
      continue;
    }
    const { error } = await supabase
      .from(table)
      .delete()
      .eq(toColumn(key), item.id);
    if (!error) done.add(`${item.collection}:${item.id}`);
  }
  if (done.size === 0) return;

  // Re-read before writing. The deletes above are slow, and anything enqueued
  // while they were in flight is not in `items` — writing that snapshot back
  // would drop those deletions on the floor without a trace. Removing only
  // what we know succeeded leaves new arrivals alone.
  const current = await readDeletions();
  await dbPut("meta", {
    key: "deletions",
    items: current.filter((item) => !done.has(`${item.collection}:${item.id}`)),
  });
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
    await recordTrouble((await readOutbox()).length, `${table}: ${error.message}`);
    return {
      success: true,
      data: stamped,
      // Not surfaced as failure: the record is safe locally and queued to retry.
      // The refusal itself is recorded, so a queue that will never drain shows
      // up on the dashboard rather than looking like everything is fine.
    };
  }
  await dequeueOutbox(collection, id);
  if ((await readOutbox()).length === 0) await clearTrouble();
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

async function drainOutbox(): Promise<{ stuck: number; lastError: string | null }> {
  if (!supabase || !navigator.onLine) return { stuck: 0, lastError: null };
  const items = await readOutbox();
  if (items.length === 0) return { stuck: 0, lastError: null };
  const ordered = [...items].sort(
    (a, b) => OUTBOX_ORDER.indexOf(a.collection) - OUTBOX_ORDER.indexOf(b.collection),
  );
  let lastError: string | null = null;
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
    if (error) {
      lastError = `${table}: ${error.message}`;
      continue;
    }
    await dequeueOutbox(item.collection, item.id);
  }

  // Deliberately does not clear the trouble slot on its own any more. It is
  // shared with the entry push, and an empty outbox was wiping a refusal that
  // belonged to somebody's field data. pushPending decides, once, with both
  // halves in front of it.
  return { stuck: (await readOutbox()).length, lastError };
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
  /** The numbered plot, when the trial has a generated layout. */
  plot: number | null;
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
    plot: input.plot,
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

  // Saving an observation is what makes this a field device, so the next time
  // it opens it lands on recording rather than the staff dashboard.
  await setDeviceRole("recording");

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
    blocking: "none" as const,
    vocabulary: null,
    plotLengthM: null,
    plotWidthM: null,
    dataSources: [],
    layoutSeed: null,
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
    // A brand-new form is unscheduled until somebody says when it is wanted.
    timing: null,
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

/**
 * Add another form to a trial that already exists.
 *
 * A trial used to get exactly one form, created with it, and nothing in the
 * app could make a second. That is wrong for almost any real protocol: an
 * emergence count at 30 days, a mid-season disease score and a harvest weight
 * are three different visits with three different question sets, and cramming
 * them into one form means whoever is standing in the paddock at emergence is
 * scrolling past harvest questions. It also capped observation timing at one
 * schedule per trial, since a timing belongs to a form.
 *
 * The eventType is what makes them distinguishable, so it is generated unique
 * within the trial rather than defaulted. Records carry the eventType, not the
 * template id — two forms sharing one would look like the same visit to the
 * due list, to "already recorded here", and to anybody reading the export.
 */
export async function addTemplate(input: {
  trialId: string;
  name: string;
  audience?: FormAudience;
}): Promise<Result<FormTemplate>> {
  const name = input.name.trim();
  if (!name) return { success: false, error: "Give the form a name." };

  const existing = (await dbGetAll<FormTemplate>("formTemplates")).filter(
    (template) => template.trialId === input.trialId,
  );
  if (existing.some((template) => template.name.trim().toLowerCase() === name.toLowerCase())) {
    return { success: false, error: `This trial already has a form called “${name}”.` };
  }

  const createdAt = nowIso();
  const template: FormTemplate = {
    templateId: newId(),
    trialId: input.trialId,
    armId: null,
    name,
    eventType: makeFieldName(
      name,
      existing.map((other) => other.eventType),
    ),
    audience: input.audience ?? "grower",
    frequency: "",
    timing: null,
    requiresSite: true,
    requiresArm: true,
    // One field, because a form with none cannot be saved or filled in. It is
    // the first thing to rename in the editor.
    fields: [
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
    ],
    createdAt,
  };

  const check = formTemplateSchema.safeParse(template);
  if (!check.success) return { success: false, error: "That form isn't valid." };

  try {
    await dbPut("formTemplates", template);
  } catch {
    return { success: false, error: "Could not save the form on this device." };
  }
  if (supabase) void supabase.from("form_templates").upsert(toRow(template)).then();
  notify();
  return { success: true, data: template };
}


/**
 * Store a parsed weather feed.
 *
 * Keyed on station and instant rather than on a generated id, so re-importing
 * a feed after a refresh updates the overlapping hours instead of stacking a
 * second copy of them. BOM's product carries 72 hours and is meant to be
 * fetched repeatedly; without this, a fortnight of daily imports would leave
 * fourteen copies of most observations and a rainfall total to match.
 */
export async function saveWeatherObservations(
  incoming: WeatherObservation[],
): Promise<Result<number>> {
  if (incoming.length === 0) return { success: false, error: "Nothing to save." };

  const existing = await dbGetAll<WeatherObservation>("weatherObservations");
  const byKey = new Map(
    existing.map((row) => [`${row.stationId}:${row.observationTime}`, row]),
  );

  const toWrite: WeatherObservation[] = [];
  for (const row of incoming) {
    const check = weatherObservationSchema.safeParse(row);
    if (!check.success) continue;
    const parsed = check.data as WeatherObservation;
    const already = byKey.get(`${parsed.stationId}:${parsed.observationTime}`);
    // Keep the original id so the cloud row is updated, not duplicated.
    toWrite.push(already ? { ...parsed, observationId: already.observationId } : parsed);
  }
  if (toWrite.length === 0) return { success: false, error: "None of those observations could be read." };

  try {
    await dbPutMany(
      toWrite.map((value) => ({ collection: "weatherObservations" as const, value })),
    );
  } catch {
    return { success: false, error: "Could not save the weather on this device." };
  }
  if (supabase) {
    void supabase
      .from("weather_observations")
      .upsert(toWrite.map((row) => toRow(row)), { onConflict: "station_id,observation_time" })
      .then();
  }
  notify();
  return { success: true, data: toWrite.length };
}

/** Store a parsed soil report: the samples and their results together. */
export async function saveSoil(
  samples: SoilSample[],
  results: SoilResult[],
): Promise<Result<number>> {
  if (samples.length === 0) return { success: false, error: "Nothing to save." };
  for (const sample of samples) {
    if (!soilSampleSchema.safeParse(sample).success) {
      return { success: false, error: "A soil sample failed validation — check the depths." };
    }
  }
  for (const result of results) {
    if (!soilResultSchema.safeParse(result).success) {
      return { success: false, error: "A soil result failed validation — check its value and unit." };
    }
  }

  try {
    await dbPutMany([
      ...samples.map((value) => ({ collection: "soilSamples" as const, value })),
      ...results.map((value) => ({ collection: "soilResults" as const, value })),
    ]);
  } catch {
    return { success: false, error: "Could not save the soil data on this device." };
  }
  if (supabase) {
    // Samples first: a result references its sample, and a foreign key does
    // not wait politely for the other request to land.
    void supabase
      .from("soil_samples")
      .upsert(samples.map((row) => toRow(row)))
      .then(({ error }) => {
        if (!error) void supabase?.from("soil_results").upsert(results.map((row) => toRow(row))).then();
      });
  }
  notify();
  return { success: true, data: results.length };
}


/**
 * Remember a measurement somebody typed, so the next person can pick it.
 *
 * Called after a form is saved rather than while it is being edited: a
 * half-typed label is not a measurement, and a library that collects every
 * keystroke fills with "Marketa", "Marketab" and "Marketabl".
 *
 * Adding is idempotent by name. Using an existing measurement bumps how often
 * it has been used instead of forking it — a library of near-duplicates
 * cannot pool anything, which is the only reason it exists.
 */
export async function rememberMeasurements(fields: FormField[]): Promise<Result<number>> {
  const stored = await dbGetAll<LibraryEntry>("measurementLibrary");
  const merged = libraryEntries(stored);
  const toWrite: LibraryEntry[] = [];
  const bumped: LibraryEntry[] = [];

  for (const field of fields) {
    const already = findExisting(merged, field.label);
    if (already) {
      // Built-ins are not rows, so there is nothing to bump; their ranking
      // comes from the curated order instead.
      if (!isBuiltIn(already)) {
        bumped.push({ ...already, usageCount: already.usageCount + 1 });
      }
      continue;
    }
    const candidate = fromFormField(field, [...merged, ...toWrite]);
    if (!candidate) continue;
    toWrite.push({ ...candidate, entryId: newId(), createdAt: nowIso() });
  }

  const all = [...toWrite, ...bumped];
  if (all.length === 0) return { success: true, data: 0 };

  try {
    await dbPutMany(all.map((value) => ({ collection: "measurementLibrary" as const, value })));
  } catch {
    return { success: false, error: "Could not save to the measurement list." };
  }
  if (supabase) {
    void supabase.from("measurement_library").upsert(all.map((row) => toRow(row))).then();
  }
  notify();
  return { success: true, data: toWrite.length };
}


/**
 * Rebuild a trial's arms from its factors and levels.
 *
 * This is the only place the two models meet. Combinations are generated, and
 * each becomes a practice arm — so the layout engine, the plot picker, the
 * export and every recorded entry carry on keying on armId, knowing nothing
 * about factors at all.
 *
 * Refused once a layout has been recorded against. Regenerating combinations
 * would mint new arm ids, and every measurement already filed against the old
 * ones would be orphaned — the same silent re-labelling that freezing the
 * layout exists to prevent (rule 14). The check is here rather than only in
 * the interface, because an invariant that lives in a disabled button is one
 * button away from not existing.
 */
export async function rebuildFactorialArms(input: {
  trialId: string;
  factors: Factor[];
  levels: FactorLevel[];
}): Promise<Result<number>> {
  const events = await dbGetAll<MeasurementEvent>("measurementEvents");
  const existing = (await dbGetAll<PracticeArm>("practiceArms")).filter(
    (arm) => arm.trialId === input.trialId,
  );
  const armIds = new Set(existing.map((arm) => arm.armId));
  const recorded = events.some((event) => event.armId !== null && armIds.has(event.armId));
  if (recorded) {
    return {
      success: false,
      error:
        "Something has already been recorded against this trial, so the combinations are frozen. Changing them now would re-label every record already taken.",
    };
  }

  const combinations = buildCombinations(input.factors, input.levels);
  if (combinations.length === 0) {
    return { success: false, error: "Give every factor at least one level first." };
  }

  const load = designLoad({
    combinations: combinations.length,
    replicates: 1,
    blocking: "blocks",
  });
  if (!canBuild(load)) {
    return { success: false, error: load.message ?? "That design is too large to run." };
  }

  const createdAt = nowIso();
  // Reuse an arm id where the same combination already exists, so editing a
  // factor's *name* does not throw away arms that mean the same thing.
  const byMembers = new Map(
    existing.map((arm) => [JSON.stringify(arm.factorLevels ?? {}), arm.armId]),
  );

  const arms: PracticeArm[] = combinations.map((combination, index) => ({
    armId: byMembers.get(JSON.stringify(combination.members)) ?? newId(),
    trialId: input.trialId,
    name: combination.shortLabel,
    // The first combination is the reference the others are read against.
    // A factorial has no natural control, so this is a label rather than a
    // claim, and the analysis never treats it as a baseline.
    type: index === 0 ? "control" : "alternative",
    description: combination.label,
    sortOrder: index,
    archived: false,
    factorLevels: combination.members,
    createdAt,
  }));

  const gone = existing.filter((arm) => !arms.some((next) => next.armId === arm.armId));

  try {
    await dbPutMany(arms.map((value) => ({ collection: "practiceArms" as const, value })));
    for (const arm of gone) await dbDelete("practiceArms", arm.armId);
  } catch {
    return { success: false, error: "Could not save the combinations on this device." };
  }
  if (supabase) {
    void supabase.from("practice_arms").upsert(arms.map((arm) => toRow(arm))).then();
    for (const arm of gone) {
      void supabase.from("practice_arms").delete().eq("arm_id", arm.armId).then();
    }
  }
  notify();
  return { success: true, data: arms.length };
}

/** Save a trial's factors and levels, then rebuild the combinations from them. */
export async function saveFactorial(input: {
  trialId: string;
  factors: Factor[];
  levels: FactorLevel[];
}): Promise<Result<number>> {
  for (const factor of input.factors) {
    if (!factorSchema.safeParse(factor).success) {
      return { success: false, error: "Every factor needs a name." };
    }
  }
  for (const level of input.levels) {
    if (!factorLevelSchema.safeParse(level).success) {
      return { success: false, error: "Every level needs a label." };
    }
  }

  const rebuilt = await rebuildFactorialArms(input);
  if (!rebuilt.success) return rebuilt;

  // Written after the rebuild, so a refused rebuild leaves the trial exactly
  // as it was rather than half-changed.
  const currentFactors = (await dbGetAll<Factor>("factors")).filter(
    (factor) => factor.trialId === input.trialId,
  );
  const keptFactors = new Set(input.factors.map((factor) => factor.factorId));
  const keptLevels = new Set(input.levels.map((level) => level.levelId));
  const currentLevels = (await dbGetAll<FactorLevel>("factorLevels")).filter((level) =>
    currentFactors.some((factor) => factor.factorId === level.factorId),
  );

  try {
    await dbPutMany([
      ...input.factors.map((value) => ({ collection: "factors" as const, value })),
      ...input.levels.map((value) => ({ collection: "factorLevels" as const, value })),
    ]);
    for (const level of currentLevels) {
      if (!keptLevels.has(level.levelId)) await dbDelete("factorLevels", level.levelId);
    }
    for (const factor of currentFactors) {
      if (!keptFactors.has(factor.factorId)) await dbDelete("factors", factor.factorId);
    }
  } catch {
    return { success: false, error: "Could not save the factors on this device." };
  }
  if (supabase) {
    void supabase.from("factors").upsert(input.factors.map((row) => toRow(row))).then();
    void supabase.from("factor_levels").upsert(input.levels.map((row) => toRow(row))).then();
  }
  notify();
  return rebuilt;
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
  // Postgres requires a host on every site, but "whoever exists first" is the
  // wrong answer: a brand-new trial's paddocks were being recorded as hosted by
  // an unrelated trial's grower, silently and wrongly. Only reuse a contact
  // already attached to this trial; otherwise start a clearly unfinished one.
  const contacts = await listContacts();
  const trialSites = (await listSites()).filter((site) => site.trialId === input.trialId);
  const trialContactIds = new Set(trialSites.map((site) => site.contactId));
  let contact = contacts.find((candidate) => trialContactIds.has(candidate.contactId));

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
    bomStationId: null,
    plantingDate: null,
    stageDates: {},
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
/** Anything recorded against this trial, at any of its sites or practices? */
export async function trialHasData(trialId: string): Promise<boolean> {
  const [events, sites, arms] = await Promise.all([listEvents(), listSites(), listArms()]);
  const siteIds = new Set(sites.filter((s) => s.trialId === trialId).map((s) => s.siteId));
  const armIds = new Set(arms.filter((a) => a.trialId === trialId).map((a) => a.armId));
  return events.some(
    (event) =>
      event.trialId === trialId ||
      (event.siteId !== null && siteIds.has(event.siteId)) ||
      (event.armId !== null && armIds.has(event.armId)),
  );
}

/**
 * Remove a trial that was created in error, along with the scaffolding that
 * belongs only to it — its sites, practices, forms, scenarios and assumptions.
 *
 * Only a trial with nothing recorded against it can go. That is the same stance
 * as sites and practices take, and it means this can never destroy field data.
 *
 * Deleting straight from the database was not enough on its own: this app is
 * local-first, so any browser still holding the trial pushes it back on the
 * next sync. The deletion has to happen here and be queued, or it does not
 * stick.
 */
export async function removeTrial(trial: Trial): Promise<Result<string>> {
  if (await trialHasData(trial.trialId)) {
    return {
      success: false,
      error: `"${trial.name}" has records against it, so it cannot be removed. Archive it instead.`,
    };
  }

  const [sites, arms, templates, scenarios, assumptions] = await Promise.all([
    listSites(), listArms(), listTemplates(), listScenarios(), listAssumptions(),
  ]);
  const ownSites = sites.filter((s) => s.trialId === trial.trialId);
  const ownArms = arms.filter((a) => a.trialId === trial.trialId);
  const ownTemplates = templates.filter((f) => f.trialId === trial.trialId);
  const ownScenarios = scenarios.filter((s) => s.trialId === trial.trialId);
  const armIds = new Set(ownArms.map((a) => a.armId));
  const ownAssumptions = assumptions.filter((a) => armIds.has(a.armId));

  // Children first, so the foreign keys hold when the queue is replayed.
  const plan: Array<[CollectionName, string]> = [
    ...ownAssumptions.map((a) => ["armAssumptions", a.assumptionId] as [CollectionName, string]),
    ...ownScenarios.map((s) => ["economicScenarios", s.scenarioId] as [CollectionName, string]),
    ...ownTemplates.map((f) => ["formTemplates", f.templateId] as [CollectionName, string]),
    ...ownArms.map((a) => ["practiceArms", a.armId] as [CollectionName, string]),
    ...ownSites.map((s) => ["sites", s.siteId] as [CollectionName, string]),
    ["trials", trial.trialId],
  ];

  try {
    for (const [collection, id] of plan) await dbDelete(collection, id);
  } catch {
    return { success: false, error: "Could not remove the trial on this device." };
  }
  for (const [collection, id] of plan) await enqueueDeletion(collection, id);

  notify();
  void syncPending();
  return { success: true, data: `Removed "${trial.name}".` };
}

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
  // Offer whatever was typed to the next person. Fire and forget: the form is
  // what somebody is trying to save, and a library that cannot be written is
  // no reason to refuse them.
  void rememberMeasurements(template.fields);
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
    // Every unsent entry is retried, refused ones included: a refusal is often
    // temporary in the way that matters here — a migration that has since been
    // applied, a policy since fixed — and an entry nobody retries is an entry
    // nobody recovers.
    const unsent = events.filter((event) => event.syncStatus !== "synced");
    let stuckEvents = 0;
    let lastEventError: string | null = null;

    for (const event of unsent) {
      const eventMetrics = metrics.filter((metric) => metric.eventId === event.eventId);
      const eventLogs = logs.filter((log) => log.eventId === event.eventId);
      const result = await pushEvent(event, eventMetrics, eventLogs);
      if (!result.ok) {
        stuckEvents += 1;
        lastEventError = result.message;
      }
      const status: SyncStatus = result.ok ? "synced" : "error";
      await dbPutMany([
        { collection: "measurementEvents", value: { ...event, syncStatus: status } },
        ...eventLogs.map((log) => ({
          collection: "dataEntryLogs" as const,
          value: { ...log, syncStatus: status },
        })),
      ]);
    }
    if (unsent.length > 0) notify();

    const outbox = await drainOutbox();
    await drainDeletions();

    // One decision, with both halves in front of it. Whichever refusal came
    // last is the one shown, and the count covers everything actually stuck.
    const stuck = stuckEvents + outbox.stuck;
    const reason = lastEventError ?? outbox.lastError;
    if (stuck === 0) {
      await clearTrouble();
    } else if (reason) {
      await recordTrouble(stuck, reason);
    }
  }
}

/**
 * Put every refused entry back in the queue and try again now.
 *
 * A refusal usually has a cause outside the app — a migration not yet run, a
 * policy that says no — and the person who fixes that cause needs a way to say
 * "try again" without waiting out the retry timer or, worse, re-entering the
 * data. Nothing is deleted and nothing is invented: the records were always
 * still here, which is the one good thing about this failure mode.
 */
export async function retryFailedEntries(): Promise<Result<number>> {
  const events = await listEvents();
  const failed = events.filter((event) => event.syncStatus === "error");
  if (failed.length === 0) return { success: true, data: 0 };

  try {
    await dbPutMany(
      failed.map((event) => ({
        collection: "measurementEvents" as const,
        value: { ...event, syncStatus: "pending" as SyncStatus },
      })),
    );
  } catch {
    return { success: false, error: "Could not queue the entries on this device." };
  }
  notify();
  await syncPending();

  // Count the ones that actually arrived, by id. Counting "no longer an error"
  // would score a record that merely went back to pending — which is what
  // happens on a device with no cloud configured at all — as a success, and
  // report data as sent that never moved.
  const retried = new Set(failed.map((event) => event.eventId));
  const sent = (await listEvents()).filter(
    (event) => retried.has(event.eventId) && event.syncStatus === "synced",
  ).length;
  return { success: true, data: sent };
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

/**
 * The outcome of a push, with the reason when there is one.
 *
 * This used to be a bare boolean, which made a dropped connection and a
 * permanent refusal indistinguishable to everything downstream — and threw
 * away the one piece of text that names the actual problem. The outbox learned
 * this lesson already; the path carrying the field data had not.
 */
type PushResult = { ok: true } | { ok: false; message: string };

async function pushEvent(
  event: MeasurementEvent,
  metrics: Metric[],
  logs: DataEntryLog[],
): Promise<PushResult> {
  if (!supabase) return { ok: false, message: "No cloud is configured on this device." };

  const resolvedMetrics: Metric[] = [];
  for (const metric of metrics) {
    const resolved = await resolveMediaPointer(metric);
    if (!resolved) {
      return { ok: false, message: "A photo or video attached to this entry could not be uploaded." };
    }
    if (resolved !== metric) await dbPut("metrics", resolved);
    resolvedMetrics.push(resolved);
  }

  const eventResult = await supabase
    .from("measurement_events")
    .upsert(toRow({ ...event, syncStatus: "synced" }));
  if (eventResult.error) {
    return { ok: false, message: `measurement_events: ${eventResult.error.message}` };
  }
  const metricsResult = await supabase
    .from("metrics")
    .upsert(resolvedMetrics.map((m) => toRow(m)));
  if (metricsResult.error) {
    return { ok: false, message: `metrics: ${metricsResult.error.message}` };
  }
  const logsResult = await supabase
    .from("data_entry_logs")
    .upsert(logs.map((log) => toRow({ ...log, syncStatus: "synced" })));
  if (logsResult.error) {
    return { ok: false, message: `data_entry_logs: ${logsResult.error.message}` };
  }
  return { ok: true };
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
  { collection: "weatherObservations", table: "weather_observations", schema: weatherObservationSchema },
  { collection: "soilSamples", table: "soil_samples", schema: soilSampleSchema },
  { collection: "soilResults", table: "soil_results", schema: soilResultSchema },
  { collection: "measurementLibrary", table: "measurement_library", schema: libraryEntrySchema },
  { collection: "factors", table: "factors", schema: factorSchema },
  { collection: "factorLevels", table: "factor_levels", schema: factorLevelSchema },
  { collection: "trialMembers", table: "trial_members", schema: trialMemberSchema },
];

export const listTrialMembers = (): Promise<TrialMember[]> =>
  dbGetAll<TrialMember>("trialMembers");

/**
 * Put somebody on a trial, or change what they do on it.
 *
 * Adding a person who is already there updates their role rather than making a
 * second row: the pair is unique in the database, and a duplicate would make
 * them vanish from any list keyed on it.
 *
 * A farmer whose paddock already holds a site needs no row at all — they are
 * involved by virtue of the site, and saying so again would be a row that goes
 * stale the moment the site moves. The interface offers them anyway, because
 * naming somebody explicitly is how you record a role.
 */
export async function addTrialMember(input: {
  trialId: string;
  contactId: string;
  role: TrialMember["role"];
}): Promise<Result<TrialMember>> {
  const existing = (await listTrialMembers()).find(
    (member) => member.trialId === input.trialId && member.contactId === input.contactId,
  );
  const member: TrialMember = existing
    ? { ...existing, role: input.role }
    : {
        memberId: newId(),
        trialId: input.trialId,
        contactId: input.contactId,
        role: input.role,
        createdAt: nowIso(),
      };

  const parsed = trialMemberSchema.safeParse(member);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid member." };
  }
  return saveRecord("trialMembers", member, "Could not save who is on this trial.");
}

/**
 * Take somebody off a trial.
 *
 * Only removes the explicit row. Somebody involved because a site is theirs
 * stays involved, and the interface says so rather than offering a button that
 * appears to work and changes nothing.
 */
export async function removeTrialMember(memberId: string): Promise<Result<string>> {
  try {
    await dbDelete("trialMembers", memberId);
  } catch {
    return { success: false, error: "Could not remove them on this device." };
  }
  await enqueueDeletion("trialMembers", memberId);
  notify();
  void syncPending();
  return { success: true, data: "Removed." };
}

/** Everyone involved in a trial, site owners and named members together. */
export async function involvementForTrial(trialId: string) {
  const [sites, members] = await Promise.all([listSites(), listTrialMembers()]);
  return involvementFor(trialId, sites, members);
}

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

/**
 * Drop local records the cloud no longer has.
 *
 * A pull only ever wrote, so a trial deleted on one device stayed on every
 * other one forever — and because nothing was queued, the app cheerfully
 * reported that everything had reached the cloud. Worse, editing one of those
 * ghosts pushed it straight back, resurrecting a deleted trial.
 *
 * Three things are deliberately kept, because "not in the cloud" does not
 * always mean "deleted":
 *   - anything queued in the outbox, which has not been sent yet;
 *   - anything queued for deletion, which is on its way out anyway;
 *   - any record still marked pending, which is a local entry the cloud has
 *     not seen. That is the grower's unsent paddock data, and losing it would
 *     be far worse than showing a stale trial.
 */
async function reconcileDeleted(
  collection: CollectionName,
  cloudIdList: string[],
  outbox: OutboxItem[],
  deletions: DeletionItem[],
): Promise<number> {
  const cloudIds = new Set(cloudIdList);
  const queued = new Set(
    outbox.filter((item) => item.collection === collection).map((item) => item.id),
  );
  for (const item of deletions) {
    if (item.collection === collection) queued.add(item.id);
  }

  const local = await dbGetAll<Record<string, unknown>>(collection);
  const gone = local.filter((row) => {
    const id = recordId(collection, row);
    if (cloudIds.has(id) || queued.has(id)) return false;
    return row.syncStatus === undefined || row.syncStatus === "synced";
  });

  for (const row of gone) await dbDelete(collection, recordId(collection, row));
  return gone.length;
}

/**
 * Test seam for reconcileDeleted. The real call sits inside a pull, which
 * needs a live Supabase; the rule about what survives is the part worth
 * pinning down, and it is pure enough to exercise on its own.
 */
export async function reconcileForTest(
  collection: CollectionName,
  cloudIds: string[],
): Promise<number> {
  return reconcileDeleted(collection, cloudIds, await readOutbox(), await readDeletions());
}


/**
 * Keep local values for columns the backend has never heard of.
 *
 * A pull parses each cloud row through its Zod schema, and any field the
 * schema has a default for gets filled in when the column is missing. That is
 * right for a genuinely empty value and badly wrong for a column that does not
 * exist yet: a backend one migration behind sends no `planting_date` at all,
 * the schema helpfully supplies `null`, and the pull writes that over a real
 * planting date. The device loses data it had, because the server is old.
 *
 * The distinction that matters is absent versus null. Supabase returns every
 * column it has, nulls included — so a key that is simply not in the row means
 * the column is not there, not that somebody cleared it. In that one case the
 * local value stands.
 *
 * Nothing here rescues a value the cloud actually cleared, and nothing applies
 * to a record this device has never seen.
 */
export function keepColumnsTheCloudLacks(
  parsed: Record<string, unknown>,
  raw: Record<string, unknown>,
  local: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!local) return parsed;
  let merged: Record<string, unknown> | null = null;
  for (const key of Object.keys(parsed)) {
    if (key in raw) continue;
    if (local[key] === undefined) continue;
    merged ??= { ...parsed };
    merged[key] = local[key];
  }
  return merged ?? parsed;
}

async function pullTables(): Promise<Result<string>> {
  if (!supabase) return { success: false, error: "No Supabase project configured." };
  {
    const outbox = await readOutbox();
    const deletions = await readDeletions();
    let pulled = 0;
    let removed = 0;
    let unreadable = 0;
    for (const spec of PULL_SPECS) {
      const { data, error } = await supabase.from(spec.table).select("*");
      if (error) {
        return { success: false, error: `Could not fetch ${spec.table}: ${error.message}` };
      }
      const localRows = await dbGetAll<Record<string, unknown>>(spec.collection);
      const localById = new Map(
        localRows.map((row) => [recordId(spec.collection, row), row]),
      );

      const valid: Record<string, unknown>[] = [];
      for (const row of data ?? []) {
        const camel = fromRow(row as Record<string, unknown>);
        const check = spec.schema.safeParse(camel);
        if (check.success) {
          const parsed = check.data as Record<string, unknown>;
          valid.push(
            keepColumnsTheCloudLacks(parsed, camel, localById.get(recordId(spec.collection, parsed))),
          );
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
      // Every id the cloud returned, including rows that failed validation.
      // Passing only the parsed ones would let a single schema drift read as
      // "deleted everywhere" and take the local copy with it.
      const cloudIds = (data ?? []).map((row) =>
        String((row as Record<string, unknown>)[toColumn(PRIMARY_KEY[spec.collection])]),
      );
      removed += await reconcileDeleted(spec.collection, cloudIds, outbox, deletions);
    }
    if (pulled > 0 || removed > 0) notify();
    const goneNote =
      removed > 0
        ? ` ${removed} record${removed === 1 ? "" : "s"} deleted elsewhere ${
            removed === 1 ? "was" : "were"
          } removed from this device.`
        : "";
    const warning =
      unreadable > 0
        ? ` ${unreadable} row${unreadable === 1 ? "" : "s"} could not be read and ${
            unreadable === 1 ? "was" : "were"
          } skipped — check the browser console.`
        : "";
    return {
      success: true,
      data: `Refreshed ${pulled} records from the cloud.${goneNote}${warning}`,
    };
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
