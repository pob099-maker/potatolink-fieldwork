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
  | "link"
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
  /**
   * For a factorial trial: which level of each factor this arm stands for,
   * keyed by factorId. Empty for a trial that is not factorial.
   *
   * The arm *is* the treatment combination rather than pointing at one. A
   * separate combinations table alongside this would be two rows for a single
   * thing and a synchronisation problem — and everything that already works
   * keys on armId: the layout engine, the plot picker, the export, the
   * replication grid, every recorded entry.
   */
  factorLevels?: Record<string, string>;
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
  /**
   * The account this person signs in with, once they have one.
   *
   * Null for almost everybody, and that is the normal state — a grower who
   * records through a link has no account and does not need one. It exists so
   * that closing reads later is one column set once per person, rather than a
   * migration that has to work out after the fact who owned what.
   */
  /**
   * Optional rather than required on purpose, and it matches the Zod schema:
   * absent means the backend has never heard of the column, null means nobody
   * has linked this person yet. Those are different facts and
   * keepColumnsTheCloudLacks depends on being able to tell them apart.
   */
  authUserId?: string | null;
  createdAt: string;
}

/**
 * Involvement in a trial that cannot be derived from site ownership.
 *
 * A farmer whose paddock holds a site is already involved without a row here;
 * this is for everybody else — the co-operating agronomist, the project
 * officer, the researcher who reads results and records nothing.
 */
export interface TrialMember {
  memberId: string;
  trialId: string;
  contactId: string;
  /**
   * What this person does on this trial, which is not what they are in
   * general: a contact role says somebody is an agronomist, this says they are
   * the one who answers for this particular trial.
   */
  role: "owner" | "collaborator" | "viewer";
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
  /**
   * A note to whoever is recording, shown under the label.
   *
   * Always visible rather than behind a tap. A hover tooltip has no hover on a
   * phone, and tap-to-reveal hides the explanation from the person who did not
   * know they needed it — which is everyone it was written for. "Before
   * grading" has to be read before the weighing, not after.
   */
  guidance?: string;
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
  /**
   * Whether what this form collects is commercially sensitive.
   *
   * Deliberately a label and not a lock, and the interface says so. Reads are
   * open — the entry form has to load its trial before anybody has signed in —
   * so a flag here cannot restrict who sees a row, and pretending otherwise
   * would be the worst kind of security theatre: somebody entering a service
   * contract price believing the app was protecting it.
   *
   * What it does is mark the form on screen and in the export, so a file about
   * to be handed to a third party can be recognised as carrying figures that
   * were given in confidence.
   */
  commerciallySensitive?: boolean;
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


/* ---------------------------------------------------------------------------
   Factorial designs
   ---------------------------------------------------------------------------
   A factorial arrangement is not a kind of trial. It describes how treatments
   are combined — every level of every factor crossed with every other — and
   says nothing about how they are laid out. The field design stays a separate
   choice: randomised complete block, completely randomised, split-plot.

   So these sit on top of the existing model. The combinations they produce
   become practice arms, and the layout engine randomises them exactly as it
   randomises any other set of treatments.
   --------------------------------------------------------------------------- */

/** A variable being tested — variety, nitrogen rate, irrigation regime. */
export interface Factor {
  factorId: string;
  trialId: string;
  name: string;
  /** Short form for plot labels and column headings — "N", "Irr". */
  code: string;
  sortOrder: number;
  createdAt: string;
}

/** One setting of one factor. */
export interface FactorLevel {
  levelId: string;
  factorId: string;
  label: string;
  /**
   * The level as a number where it is one — 0, 80, 160 kg N/ha.
   *
   * Kept apart from the label because a rate is a quantity and "High" is a
   * name, and only one of them can be fitted to a trend or plotted against a
   * response. Null for a genuinely categorical level such as a variety.
   */
  numericValue: number | null;
  sortOrder: number;
  createdAt: string;
}
