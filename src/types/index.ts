// Domain types for Fieldwork, adapted from docs/schema.md.
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
  /**
   * How the plots are arranged. "blocks" is a randomised complete block —
   * each block holds one plot of every treatment, so a slope or drainage line
   * is absorbed by the block rather than being read as a treatment effect.
   * "none" is completely randomised, which suits uniform ground.
   */
  blocking: "none" | "blocks";
  /**
   * What this trial calls the things it compares — see services/vocabulary.
   * null means "follow the design", which is what every trial does until
   * somebody chooses otherwise.
   */
  vocabulary: "treatment" | "practice" | null;
  /**
   * Plot size in metres. Two typed numbers rather than anything satellite-
   * derived: a trial plot is a few tens of square metres, and a phone fixes a
   * corner to within several metres, so a walked boundary would carry an error
   * larger than the plot. Typed once, it is exact.
   *
   * What it buys is arithmetic nobody should be doing in a paddock — weigh the
   * plot, and the yield per hectare follows.
   */
  plotLengthM: number | null;
  plotWidthM: number | null;
  /**
   * Where data about this trial comes from besides the app itself — a soil
   * probe's SensorThings endpoint, a machinery export, the written protocol.
   * Recorded, not ingested: nothing here is fetched or parsed, and saying so
   * is the point. Provenance is the question a reviewer asks first and the
   * one nothing else in the app could answer.
   */
  dataSources: DataSource[];
  /**
   * The seed the plot layout was generated from, or null before one exists.
   * Stored so the same layout can be reproduced and checked; a layout nobody
   * can regenerate is a layout nobody can verify.
   */
  layoutSeed: string | null;
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
  /**
   * When the crop went in here. The anchor everything else is measured from,
   * and the one date on a trial that somebody always knows exactly.
   *
   * On the site rather than the trial, because two sites planted a fortnight
   * apart are two schedules — the same reason each site gets its own
   * randomised layout.
   */
  /**
   * The BOM station whose observations describe this site's weather.
   *
   * A link, not a copy. Weather rows belong to the station that recorded them
   * and are shared by every site near it — the alternative, weather columns on
   * the trial, means the same rainfall stored once per trial and no way to
   * swap the source later for SILO or an on-farm logger.
   */
  bomStationId: string | null;
  plantingDate: string | null;
  /**
   * Growth stage id → the date it was confirmed to have arrived here.
   *
   * This is what stops the schedule decaying. Estimated windows are worked out
   * from the planting date and a typical day count, which the season moves; a
   * confirmed date replaces the estimate for that stage and everything hung
   * off it re-anchors. Empty until somebody standing in the crop says so.
   */
  stageDates: Record<string, string>;
  createdAt: string;
}

/**
 * What kind of thing a source is. Worth recording even though nothing reads
 * it yet: it is the difference between a note somebody has to interpret and a
 * reference something could later follow.
 */
export type DataSourceKind =
  | "sensorthings"
  | "isoxml"
  | "weather"
  | "document"
  | "other";

export interface DataSource {
  label: string;
  kind: DataSourceKind;
  /** A URL, or a path to a file kept somewhere else. */
  reference: string;
  /**
   * What it measures, narrowest first. A flow meter under a variable-rate
   * pivot belongs to one plot; a probe belongs to a paddock; a protocol
   * belongs to the trial. All null means the whole trial.
   *
   * A plot number is meaningless without its site — plots are numbered from
   * one in every paddock — so a plot always carries the site it is in.
   */
  siteId: string | null;
  armId: string | null;
  plot: number | null;
  note: string;
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
  /**
   * The plot this was recorded in, once the trial has a generated layout. It
   * is the number painted on the peg, so it is what the person in the paddock
   * can actually see — and it pins the record to one square of ground rather
   * than to "some plot of this treatment". null for a trial with no layout.
   */
  plot: number | null;
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

export type { Timing } from "../services/timing";
import type { Timing } from "../services/timing";

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
  /**
   * When this form is expected, relative to the crop rather than the calendar.
   *
   * Kept alongside `frequency` rather than replacing it: the frequency string
   * is what a person reads, and it is free text on purpose because protocols
   * are written in prose. This is the structured half the app can compute a
   * window from. null means the form is filled in whenever it is filled in,
   * which is the honest default and what every existing form is.
   */
  timing: Timing | null;
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


/* ---------------------------------------------------------------------------
   Weather and soil
   ---------------------------------------------------------------------------
   Two datasets rather than trial notes, and two shapes rather than one.

   Weather is a time series belonging to a station; soil is a layered profile
   belonging to a point in the ground. Forcing both into one generic
   "variable" table would make every query about either of them a special
   case — a rainfall window and a pH at 0–10 cm have nothing structurally in
   common. The existing data-source links stay as the relationship layer:
   they say where a number came from, these say what it is.
   --------------------------------------------------------------------------- */

/** Where a weather record came from. Swappable by design. */
export type WeatherSource = "bom" | "silo" | "logger" | "manual";

/**
 * One observation at one station at one moment.
 *
 * Station name and position are carried on the row rather than normalised
 * into a station table, because they are what the source said at that time —
 * a station that moves or is renamed should not silently rewrite history.
 */
export interface WeatherObservation {
  observationId: string;
  sourceSystem: WeatherSource;
  stationId: string;
  stationName: string;
  lat: number | null;
  lon: number | null;
  /** Full ISO 8601 with offset. BOM publishes UTC; it is stored as UTC. */
  observationTime: string;
  airTempC: number | null;
  /**
   * Rain since 9am local, in mm — which is what BOM's `rain_trace` actually
   * is, and the reason this field is not called rainfall_mm. Summing a column
   * of per-observation rainfall is normal; summing this one would multiply a
   * day's rain by the number of observations in it.
   */
  rainfallSince9amMm: number | null;
  relativeHumidityPct: number | null;
  windSpeedKmh: number | null;
  /** Compass point as published — "SSE", "NW". Not degrees; BOM gives letters. */
  windDir: string | null;
  dewPointC: number | null;
  pressureMslHpa: number | null;
  /** The source record verbatim, for auditability. */
  rawPayload: Record<string, unknown> | null;
  createdAt: string;
}

/** Where soil information came from. */
export type SoilSource = "ansis" | "lab" | "field" | "grower";

/**
 * One sampling event: a place, a date, and a depth interval.
 *
 * Depth is on the sample rather than the result because a sample is taken
 * from an interval — national soil datasets are depth-based, and a pH with no
 * depth attached is not comparable with anything.
 */
export interface SoilSample {
  sampleId: string;
  siteId: string;
  soilSource: SoilSource;
  /** Somebody's label for the soil — interpreted, not measured. */
  soilClassification: string;
  /** Which system that label belongs to, so two labels can be told apart. */
  classificationSystem: string;
  /** Plain date; a sampling day, not an instant. */
  sampleDate: string;
  /** The sampler's own point identifier, if they had one. */
  samplePointId: string;
  lat: number | null;
  lon: number | null;
  depthFromCm: number;
  depthToCm: number;
  note: string;
  createdAt: string;
}

/** One measured attribute of one sample. */
export interface SoilResult {
  resultId: string;
  sampleId: string;
  /** Controlled code — see services/soilAttributes. */
  attributeCode: string;
  attributeName: string;
  value: number | null;
  /** Some results are words: a texture grade, a colour. */
  textValue: string;
  /** Always explicit, never implied by the attribute. */
  unit: string;
  /** The method the number was produced by, which changes what it means. */
  methodCode: string;
  methodRef: string;
  createdAt: string;
}

export type { LibraryEntry } from "../services/measurementLibrary";
