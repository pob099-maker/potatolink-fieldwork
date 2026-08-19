// Domain types for PotatoLink Fieldwork, adapted from docs/schema.md.
// The schema is project-agnostic: new trial types only need new FormTemplate
// configs, never new types. Arms are never hardcoded as A/B.

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type ProjectStatus = "active" | "completed" | "archived";
export type TrialStatus = "draft" | "active" | "completed" | "archived";
export type ArmType = "control" | "alternative";
export type SyncStatus = "pending" | "synced" | "error";
export type ContactRole = "grower" | "staff" | "cooperator" | "vendor";
export type AssumptionCategory = "capex" | "opex" | "labour" | "revenue" | "other";
export type AdoptionStatus =
  | "not_started"
  | "considering"
  | "trialling"
  | "adopted"
  | "rejected";
export type DeviceType = "mobile" | "tablet" | "desktop";
export type FieldType =
  | "number"
  | "text"
  | "select"
  | "multiselect"
  | "slider"
  | "photo"
  | "video"
  | "file"
  | "gps"
  | "date"
  | "boolean";

export type MediaKind = "photo" | "video" | "file";

/** A photo or video captured on-device, held locally until uploaded. */
export interface MediaItem {
  mediaId: string;
  kind: MediaKind;
  mimeType: string;
  blob: Blob;
  uploadedUrl: string | null;
  createdAt: string;
}

export interface Project {
  projectId: string;
  name: string;
  funder: string;
  startDate: string;
  endDate: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export type TrialDesign = "observational" | "replicated";

export interface Trial {
  trialId: string;
  projectId: string;
  name: string;
  objective: string;
  status: TrialStatus;
  /**
   * "observational" (default): practice-change / viability assessment — no
   * reps, no completeness checks. "replicated": a designed experiment with
   * reps and a response variable, for statistical analysis. Opt-in per trial.
   */
  design: TrialDesign;
  /** Target replicates per treatment per site, when design is "replicated". */
  replicates: number;
  /** fieldName of the response variable the analysis is about, or null. */
  responseMetric: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Site {
  siteId: string;
  trialId: string;
  contactId: string;
  location: string;
  region: string;
  soilType: string;
  coordinates: { lat: number; lng: number } | null;
  createdAt: string;
}

export interface PracticeArm {
  armId: string;
  trialId: string;
  name: string;
  type: ArmType;
  description: string;
  sortOrder: number;
  /** Retired: kept for its data, but not offered for new entries. */
  archived: boolean;
  createdAt: string;
  /** Bumped on every edit; drives last-writer-wins on sync. */
  updatedAt?: string;
}

/**
 * Whether a cost or benefit is a stand-in or a real figure. Everything starts
 * as a placeholder so a modelled result is never mistaken for a measured one;
 * someone with the invoice in hand marks it confirmed.
 */
export type AssumptionStatus = "placeholder" | "confirmed";

export interface ArmAssumption {
  assumptionId: string;
  armId: string;
  category: AssumptionCategory;
  fieldName: string;
  value: number | string;
  unit: string;
  status: AssumptionStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface MeasurementEvent {
  eventId: string;
  /**
   * The trial this record belongs to. Always set for new records; may be null
   * on rows created before trials were recorded directly, which are resolved
   * through their site or arm instead.
   */
  trialId: string | null;
  /** null for trial-level records such as a cost log. */
  siteId: string | null;
  /** null for records that aren't about one practice, such as weather. */
  armId: string | null;
  /** Replicate/block number for a replicated trial; null otherwise. */
  replicate: number | null;
  eventDate: string;
  eventType: string;
  enteredBy: string;
  syncStatus: SyncStatus;
  createdAt: string;
  /** Set when the entry is corrected; drives last-writer-wins on sync. */
  updatedAt?: string;
}

/**
 * A recorded answer in its own shape: a measurement, a written note, a yes/no,
 * or the set of choices ticked on a multi-choice question. Kept native so the
 * export can stay tidy — see services/metricValue.ts.
 */
export type MetricValue = number | string | boolean | string[];

export interface Metric {
  metricId: string;
  eventId: string;
  metricName: string;
  value: MetricValue;
  unit: string;
  photoUrl: string | null;
  createdAt: string;
  /** Set when the answer is corrected; drives last-writer-wins on sync. */
  updatedAt?: string;
}

export interface EconomicScenario {
  scenarioId: string;
  trialId: string;
  /** null = applies trial-wide, and is the fallback for sites without one. */
  siteId: string | null;
  name: string;
  assumptionsJson: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ResultSet {
  resultId: string;
  scenarioId: string;
  armId: string;
  /** null = blended across every site in the trial. */
  siteId: string | null;
  netBenefit: number;
  paybackPeriod: number | null;
  notes: string;
  calculatedAt: string;
}

export interface Contact {
  contactId: string;
  name: string;
  business: string;
  role: ContactRole;
  region: string;
  email: string;
  phone: string;
  tags: string[];
  createdAt: string;
}

export interface AdoptionFollowup {
  followupId: string;
  trialId: string;
  contactId: string;
  adoptionStatus: AdoptionStatus;
  behaviourNotes: string;
  followupDate: string;
  createdAt: string;
}

export interface FormField {
  fieldName: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[] | null;
  min: number | null;
  max: number | null;
  unit: string | null;
  displayOrder: number;
}

export type FormAudience = "grower" | "staff";

export interface FormTemplate {
  templateId: string;
  trialId: string;
  armId: string | null;
  name: string;
  /** Distinguishes this form's records from other stages of the protocol. */
  eventType: string;
  /** Who fills it in: growers in the paddock, or staff running the trial. */
  audience: FormAudience;
  /** Plain-language cadence shown to the person filling it in. */
  frequency: string;
  requiresSite: boolean;
  requiresArm: boolean;
  fields: FormField[];
  createdAt: string;
  updatedAt?: string;
}

export interface DataEntryLog {
  entryId: string;
  eventId: string;
  enteredBy: string;
  entryDate: string;
  deviceType: DeviceType;
  syncStatus: SyncStatus;
  createdAt: string;
}
