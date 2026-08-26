// Seed data for the first use case: the Downs CropVision optical sorter
// post-harvest handling trial. IDs are fixed so seeding is idempotent and
// local records line up with a Supabase project seeded from seed.sql.

import type {
  ArmAssumption,
  Contact,
  EconomicScenario,
  FormField,
  FormTemplate,
  MeasurementEvent,
  Metric,
  PracticeArm,
  Project,
  Site,
  Trial,
} from "../types";
import { dbGet, dbPut, dbPutMany } from "../lib/localdb";

const T0 = "2026-08-01T00:00:00.000Z";

/**
 * A plain date this many days before today.
 *
 * The demo trials anchor their planting dates to whenever the app is first
 * opened, so the timing example always shows something worth looking at — one
 * observation due, one coming up, one late. Hard-coded dates would have made
 * the whole feature look broken a season later.
 */
const daysBeforeToday = (days: number): string =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);


export const SEED_IDS = {
  project: "5f0a6c1e-0001-4000-8000-000000000001",
  trial: "5f0a6c1e-0002-4000-8000-000000000001",
  siteWalkersFlat: "5f0a6c1e-0003-4000-8000-000000000001",
  siteTasmania: "5f0a6c1e-0003-4000-8000-000000000002",
  armControl: "5f0a6c1e-0004-4000-8000-000000000001",
  armOwned: "5f0a6c1e-0004-4000-8000-000000000002",
  armShared: "5f0a6c1e-0004-4000-8000-000000000003",
  armImproved: "5f0a6c1e-0004-4000-8000-000000000004",
  contactGrower: "5f0a6c1e-0005-4000-8000-000000000001",
  contactStaff: "5f0a6c1e-0005-4000-8000-000000000002",
  template: "5f0a6c1e-0006-4000-8000-000000000001",
  heTrial: "5f0a6c1e-0002-4000-8000-000000000002",
  heSite: "5f0a6c1e-0003-4000-8000-000000000003",
  heContact: "5f0a6c1e-0005-4000-8000-000000000003",
  heArmControl: "5f0a6c1e-0004-4000-8000-000000000005",
  heArmFitted: "5f0a6c1e-0004-4000-8000-000000000006",
  heTemplate: "5f0a6c1e-0006-4000-8000-000000000002",
} as const;

const project: Project = {
  projectId: SEED_IDS.project,
  name: "Potato Mechanisation Program",
  funder: "Hort Innovation",
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2028-06-30T00:00:00.000Z",
  status: "active",
  createdAt: T0,
  updatedAt: T0,
};

const trial: Trial = {
  trialId: SEED_IDS.trial,
  projectId: SEED_IDS.project,
  name: "Downs CropVision Post-Harvest Handling Comparison",
  objective:
    "Compare existing post-harvest handling against optical sorter practices across sites in Walkers Flat (SA) and Tasmania.",
  status: "active",
  design: "observational",
  replicates: 0,
  blocking: "none" as const,
  vocabulary: null,
  plotLengthM: null,
  plotWidthM: null,
  dataSources: [],
  layoutSeed: null,
  responseMetric: null,
  createdAt: T0,
  updatedAt: T0,
};

const contacts: Contact[] = [
  {
    contactId: SEED_IDS.contactGrower,
    name: "Sample Grower",
    business: "Walkers Flat Produce",
    role: "grower",
    region: "Murraylands SA",
    email: "",
    phone: "",
    tags: ["cropvision-trial"],
    createdAt: T0,
  },
  {
    contactId: SEED_IDS.contactStaff,
    name: "PotatoLink Staff",
    business: "PotatoLink",
    role: "staff",
    region: "National",
    email: "",
    phone: "",
    tags: [],
    createdAt: T0,
  },
];

const sites: Site[] = [
  {
    siteId: SEED_IDS.siteWalkersFlat,
    trialId: SEED_IDS.trial,
    contactId: SEED_IDS.contactGrower,
    location: "Walkers Flat",
    region: "South Australia",
    soilType: "Sandy loam",
    coordinates: null,
    bomStationId: null,
    plantingDate: daysBeforeToday(40),
    stageDates: {},
    createdAt: T0,
  },
  {
    siteId: SEED_IDS.siteTasmania,
    trialId: SEED_IDS.trial,
    contactId: SEED_IDS.contactGrower,
    location: "Tasmania",
    region: "Tasmania",
    soilType: "Ferrosol",
    coordinates: null,
    bomStationId: null,
    plantingDate: daysBeforeToday(18),
    stageDates: {},
    createdAt: T0,
  },
];

const arms: PracticeArm[] = [
  {
    armId: SEED_IDS.armControl,
    trialId: SEED_IDS.trial,
    name: "Existing post-harvest handling",
    type: "control",
    description: "Current practice without an optical sorter.",
    sortOrder: 0,
    archived: false,
    createdAt: T0,
  },
  {
    armId: SEED_IDS.armOwned,
    trialId: SEED_IDS.trial,
    name: "CropVision — on-farm owned unit",
    type: "alternative",
    description: "Optical sorter owned and operated on farm.",
    sortOrder: 1,
    archived: false,
    createdAt: T0,
  },
  {
    armId: SEED_IDS.armShared,
    trialId: SEED_IDS.trial,
    name: "CropVision — shared/service model",
    type: "alternative",
    description: "Optical sorter accessed through a shared or contracted service.",
    sortOrder: 2,
    archived: false,
    createdAt: T0,
  },
  {
    armId: SEED_IDS.armImproved,
    trialId: SEED_IDS.trial,
    name: "Improved handling without optical sorter",
    type: "alternative",
    description: "Upgraded conventional handling practices, no optical sorter.",
    sortOrder: 3,
    archived: false,
    createdAt: T0,
  },
];

const template: FormTemplate = {
  templateId: SEED_IDS.template,
  trialId: SEED_IDS.trial,
  armId: null,
  name: "CropVision run record",
  eventType: "field_record",
  audience: "grower",
  frequency: "Each run",
  timing: { stage: "harvest", dapFrom: 0, dapTo: 21 },
  requiresSite: true,
  requiresArm: true,
  fields: [
    {
      fieldName: "tonnesHandled",
      label: "Tonnes handled",
      type: "number",
      required: true,
      options: null,
      min: 0,
      max: null,
      unit: "t",
      displayOrder: 0,
    },
    {
      fieldName: "runDuration",
      label: "How long did the run take?",
      type: "number",
      required: true,
      options: null,
      min: 0,
      max: null,
      unit: "hours",
      displayOrder: 1,
    },
    {
      fieldName: "peopleInvolved",
      label: "People involved",
      type: "number",
      required: true,
      options: null,
      min: 1,
      max: null,
      unit: null,
      displayOrder: 2,
    },
    {
      fieldName: "runWentAsPlanned",
      label: "Did the run go as planned?",
      type: "boolean",
      required: true,
      options: null,
      min: null,
      max: null,
      unit: null,
      displayOrder: 3,
    },
    {
      fieldName: "photo",
      label: "Photo of the run (optional)",
      type: "photo",
      required: false,
      options: null,
      min: null,
      max: null,
      unit: null,
      displayOrder: 4,
    },
    {
      fieldName: "video",
      label: "Short video of the run (optional)",
      type: "video",
      required: false,
      options: null,
      min: null,
      max: null,
      unit: null,
      displayOrder: 8,
    },
    {
      fieldName: "sortingResult",
      label: "How well did the sorting work?",
      type: "slider",
      required: false,
      options: null,
      min: 1,
      max: 5,
      unit: null,
      displayOrder: 5,
    },
    {
      fieldName: "mainRemovalCategory",
      label: "Main thing removed",
      type: "select",
      required: false,
      options: [
        "clods/stones",
        "damaged tubers",
        "rot",
        "green potatoes",
        "misshapes",
        "foreign material",
        "no meaningful separation",
      ],
      min: null,
      max: null,
      unit: null,
      displayOrder: 6,
    },
    {
      fieldName: "notes",
      label: "Anything else worth noting?",
      type: "text",
      required: false,
      options: null,
      min: null,
      max: null,
      unit: null,
      displayOrder: 7,
    },
  ],
  createdAt: T0,
};

// HarvestEye viability trial (planned, North Queensland) — configured from
// docs/harvesteye_trial_protocol.csv. Deliberately added as pure data: a new
// trial type must never require code changes, only new configs.

const heTrial: Trial = {
  trialId: SEED_IDS.heTrial,
  projectId: SEED_IDS.project,
  name: "HarvestEye Viability Trial — North Queensland",
  objective:
    "Validate HarvestEye in-field size and count accuracy against manual grading, and assess fit-up effort, operational disruption, and labour ROI on North Queensland harvest conditions.",
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
  createdAt: T0,
  updatedAt: T0,
};

const heContact: Contact = {
  contactId: SEED_IDS.heContact,
  name: "North QLD Cooperator (TBC)",
  business: "",
  role: "cooperator",
  region: "North Queensland",
  email: "",
  phone: "",
  tags: ["harvesteye-trial"],
  createdAt: T0,
};

const heSite: Site = {
  siteId: SEED_IDS.heSite,
  trialId: SEED_IDS.heTrial,
  contactId: SEED_IDS.heContact,
  location: "Atherton Tablelands",
  region: "North Queensland",
  soilType: "Red ferrosol",
  coordinates: null,
  bomStationId: null,
  plantingDate: daysBeforeToday(132),
  stageDates: { harvest: daysBeforeToday(6) },
  createdAt: T0,
};

const heArms: PracticeArm[] = [
  {
    armId: SEED_IDS.heArmControl,
    trialId: SEED_IDS.heTrial,
    name: "Manual grading (current practice)",
    type: "control",
    description: "Hand-graded samples only; no in-field sensing.",
    sortOrder: 0,
    archived: false,
    createdAt: T0,
  },
  {
    armId: SEED_IDS.heArmFitted,
    trialId: SEED_IDS.heTrial,
    name: "HarvestEye-fitted harvester",
    type: "alternative",
    description: "HarvestEye unit mounted on the harvester, validated against hand grading.",
    sortOrder: 1,
    archived: false,
    createdAt: T0,
  },
];

const heTemplate: FormTemplate = {
  templateId: SEED_IDS.heTemplate,
  trialId: SEED_IDS.heTrial,
  armId: null,
  name: "HarvestEye harvest run record",
  eventType: "field_record",
  audience: "grower",
  frequency: "Each pass",
  timing: { stage: "harvest", dapFrom: 0, dapTo: 14 },
  requiresSite: true,
  requiresArm: true,
  fields: [
    {
      fieldName: "varietyName",
      label: "Variety",
      type: "text",
      required: true,
      options: null,
      min: null,
      max: null,
      unit: null,
      displayOrder: 0,
    },
    {
      fieldName: "plotId",
      label: "Plot / row number",
      type: "text",
      required: true,
      options: null,
      min: null,
      max: null,
      unit: null,
      displayOrder: 1,
    },
    {
      fieldName: "replicate",
      label: "Replicate number",
      type: "number",
      required: true,
      options: null,
      min: 1,
      max: null,
      unit: null,
      displayOrder: 2,
    },
    {
      fieldName: "harvesterSpeed",
      label: "Harvester speed",
      type: "number",
      required: true,
      options: null,
      min: 0,
      max: null,
      unit: "km/h",
      displayOrder: 3,
    },
    {
      fieldName: "slowDownsFromUnit",
      label: "Did the unit cause any slow-downs?",
      type: "boolean",
      required: true,
      options: null,
      min: null,
      max: null,
      unit: null,
      displayOrder: 4,
    },
    {
      fieldName: "marketableYield",
      label: "HarvestEye marketable yield",
      type: "number",
      required: false,
      options: null,
      min: 0,
      max: 100,
      unit: "%",
      displayOrder: 5,
    },
    {
      fieldName: "tuberCount",
      label: "HarvestEye tuber count",
      type: "number",
      required: false,
      options: null,
      min: 0,
      max: null,
      unit: null,
      displayOrder: 6,
    },
    {
      fieldName: "manualSampleWeight",
      label: "Hand-graded sample weight",
      type: "number",
      required: false,
      options: null,
      min: 0,
      max: null,
      unit: "kg",
      displayOrder: 7,
    },
    {
      fieldName: "mainDefect",
      label: "Defects graded out (choose all that apply)",
      type: "multiselect",
      required: false,
      options: ["none", "rot", "greening", "misshapen", "cracking", "mechanical damage"],
      min: null,
      max: null,
      unit: null,
      displayOrder: 8,
    },
    {
      fieldName: "defectPhoto",
      label: "Photo of graded-out tubers (optional)",
      type: "photo",
      required: false,
      options: null,
      min: null,
      max: null,
      unit: null,
      displayOrder: 9,
    },
    {
      fieldName: "sensorVideo",
      label: "30–60 s video of tubers passing the sensor (optional)",
      type: "video",
      required: false,
      options: null,
      min: null,
      max: null,
      unit: null,
      displayOrder: 10,
    },
    {
      fieldName: "csvExport",
      label: "HarvestEye CSV export (optional)",
      type: "file",
      required: false,
      options: null,
      min: null,
      max: null,
      unit: null,
      displayOrder: 11,
    },
    {
      fieldName: "passLocation",
      label: "Where was this pass? (optional)",
      type: "gps",
      required: false,
      options: null,
      min: null,
      max: null,
      unit: null,
      displayOrder: 12,
    },
    {
      fieldName: "notes",
      label: "Anything else worth noting?",
      type: "text",
      required: false,
      options: null,
      min: null,
      max: null,
      unit: null,
      displayOrder: 13,
    },
  ],
  createdAt: T0,
};

// Staff forms for the HarvestEye protocol stages that aren't per-pass
// (docs/harvesteye_trial_protocol.csv). Each names who fills it in and how
// often; those that describe a site or the whole trial don't attach to a
// practice arm.

type SeedField = [
  fieldName: string,
  label: string,
  type: FormField["type"],
  required?: boolean,
  extra?: Partial<Pick<FormField, "options" | "min" | "max" | "unit">>,
];

function staffForm(
  templateId: string,
  name: string,
  eventType: string,
  frequency: string,
  scope: { requiresSite: boolean; requiresArm: boolean },
  fields: SeedField[],
): FormTemplate {
  return {
    templateId,
    trialId: SEED_IDS.heTrial,
    armId: null,
    name,
    eventType,
    audience: "staff",
    frequency,
    // Staff forms are event-driven — a calibration happens when the machine is
    // calibrated. Nothing to schedule, so nothing claimed.
    timing: null,
    requiresSite: scope.requiresSite,
    requiresArm: scope.requiresArm,
    fields: fields.map(([fieldName, label, type, required = false, extra], index) => ({
      fieldName,
      label,
      type,
      required,
      options: extra?.options ?? null,
      min: extra?.min ?? null,
      max: extra?.max ?? null,
      unit: extra?.unit ?? null,
      displayOrder: index,
    })),
    createdAt: T0,
  };
}

const SITE_ONLY = { requiresSite: true, requiresArm: false };
const TRIAL_ONLY = { requiresSite: false, requiresArm: false };

const heStaffForms: FormTemplate[] = [
  staffForm(
    "5f0a6c1e-0006-4000-8000-000000000010",
    "Site setup",
    "site_setup",
    "Once per site, before harvest",
    SITE_ONLY,
    [
      ["siteBoundary", "Field boundary location", "gps"],
      ["varietyLayout", "Variety layout map (photo or file)", "file"],
      ["rowSpacing", "Row spacing", "number", false, { unit: "cm", min: 0 }],
      ["plantingDate", "Planting date", "date"],
      ["daysToHarvest", "Days to harvest", "number", false, { min: 0 }],
      ["irrigationRegime", "Irrigation regime", "text"],
    ],
  ),
  staffForm(
    "5f0a6c1e-0006-4000-8000-000000000011",
    "Calibration record",
    "calibration",
    "Start of each session",
    SITE_ONLY,
    [
      ["calibrationMethod", "Calibration method used", "text", true],
      ["technician", "Technician", "text", true],
      ["calibrationPhoto", "Photo of the calibration", "photo"],
      ["calibrationNotes", "Anything unusual?", "text"],
    ],
  ),
  staffForm(
    "5f0a6c1e-0006-4000-8000-000000000012",
    "Install / removal log",
    "install_log",
    "Each install and removal",
    SITE_ONLY,
    [
      ["action", "Install or removal?", "select", true, { options: ["install", "removal"] }],
      ["minutesTaken", "Time taken", "number", true, { unit: "minutes", min: 0 }],
      ["fitPhoto", "Photo of the unit fitted", "photo"],
      ["disruption", "Did fitting disrupt normal work?", "boolean", true],
      ["installNotes", "Notes", "text"],
    ],
  ),
  staffForm(
    "5f0a6c1e-0006-4000-8000-000000000013",
    "Daily weather",
    "weather",
    "Daily during the trial",
    SITE_ONLY,
    [
      ["temperature", "Temperature", "number", true, { unit: "°C" }],
      ["rainfall7Day", "Rainfall, last 7 days", "number", false, { unit: "mm", min: 0 }],
      ["soilMoisture", "Soil moisture", "number", false, { unit: "%", min: 0, max: 100 }],
      ["weatherNotes", "Conditions worth noting", "text"],
    ],
  ),
  staffForm(
    "5f0a6c1e-0006-4000-8000-000000000014",
    "Portal output check",
    "portal_output",
    "End of each harvest day",
    SITE_ONLY,
    [
      ["portalScreenshot", "Portal export (screenshot or PDF)", "file", true],
      ["dataLagMinutes", "Time from harvest to portal-ready data", "number", true, { unit: "minutes", min: 0 }],
      ["outputUsable", "Was the output usable as-is?", "boolean", true],
      ["portalNotes", "Notes", "text"],
    ],
  ),
  staffForm(
    "5f0a6c1e-0006-4000-8000-000000000015",
    "Observer feedback",
    "observer_feedback",
    "End of each site visit",
    SITE_ONLY,
    [
      ["observerName", "Observer name", "text", true],
      [
        "observerRole",
        "Role",
        "select",
        true,
        { options: ["grower", "processor", "agronomist", "other"] },
      ],
      ["relevanceRating", "How relevant is this to your operation?", "slider", true, { min: 1, max: 5 }],
      ["wouldUse", "Would you consider using it?", "boolean", true],
      ["observerComments", "Comments", "text"],
    ],
  ),
  staffForm(
    "5f0a6c1e-0006-4000-8000-000000000016",
    "Cost log",
    "cost_log",
    "Once per trial",
    TRIAL_ONLY,
    [
      ["leaseCost", "Lease or subscription cost", "number", true, { unit: "$", min: 0 }],
      ["technicianCost", "Technician time", "number", false, { unit: "$", min: 0 }],
      ["freightCost", "Freight", "number", false, { unit: "$", min: 0 }],
      ["costNotes", "What's included in these figures?", "text"],
    ],
  ),
];

// Placeholder economics for the CropVision trial so the Results page
// demonstrates the engine out of the box. Values are illustrative only and
// fully editable in the app.

type SeedAssumption = [id: string, armId: string, category: ArmAssumption["category"], fieldName: string, value: number, unit: string];

const assumptionRows: SeedAssumption[] = [
  ["5f0a6c1e-0007-4000-8000-000000000001", SEED_IDS.armControl, "labour", "Grading labour", 0.5, "hr/t"],
  ["5f0a6c1e-0007-4000-8000-000000000002", SEED_IDS.armControl, "opex", "Line maintenance", 5000, "$/yr"],
  ["5f0a6c1e-0007-4000-8000-000000000003", SEED_IDS.armOwned, "capex", "CropVision unit purchase & install", 450000, "$"],
  ["5f0a6c1e-0007-4000-8000-000000000004", SEED_IDS.armOwned, "opex", "Service & consumables", 18000, "$/yr"],
  ["5f0a6c1e-0007-4000-8000-000000000005", SEED_IDS.armOwned, "labour", "Grading labour with sorter", 0.15, "hr/t"],
  ["5f0a6c1e-0007-4000-8000-000000000006", SEED_IDS.armOwned, "revenue", "Marketable yield uplift", 2, "%yield"],
  ["5f0a6c1e-0007-4000-8000-000000000007", SEED_IDS.armShared, "opex", "Sorting service fee", 8, "$/t"],
  ["5f0a6c1e-0007-4000-8000-000000000008", SEED_IDS.armShared, "labour", "Grading labour with service", 0.2, "hr/t"],
  ["5f0a6c1e-0007-4000-8000-000000000009", SEED_IDS.armShared, "revenue", "Marketable yield uplift", 1.5, "%yield"],
  ["5f0a6c1e-0007-4000-8000-000000000010", SEED_IDS.armImproved, "capex", "Handling upgrades", 60000, "$"],
  ["5f0a6c1e-0007-4000-8000-000000000011", SEED_IDS.armImproved, "labour", "Grading labour after upgrades", 0.35, "hr/t"],
  ["5f0a6c1e-0007-4000-8000-000000000012", SEED_IDS.armImproved, "revenue", "Marketable yield uplift", 0.5, "%yield"],
];

const seedAssumptions: ArmAssumption[] = assumptionRows.map(
  ([assumptionId, armId, category, fieldName, value, unit]) => ({
    assumptionId,
    armId,
    category,
    fieldName,
    value,
    unit,
    // Indicative figures for the demonstration, not the grower's own costs.
    status: "placeholder",
    createdAt: T0,
  }),
);

// One scenario per site: season throughput, price and labour rates genuinely
// differ between the Murraylands and Tasmania. The trial-wide scenario stays
// as the fallback for any site that hasn't been given its own.
const seedScenarios: EconomicScenario[] = [
  {
    scenarioId: "5f0a6c1e-0008-4000-8000-000000000001",
    trialId: SEED_IDS.trial,
    siteId: null,
    name: "Trial-wide default (placeholder numbers)",
    assumptionsJson: JSON.stringify({
      seasonTonnes: 8000,
      pricePerTonne: 450,
      labourRatePerHour: 40,
    }),
    createdAt: T0,
  },
  {
    scenarioId: "5f0a6c1e-0008-4000-8000-000000000002",
    trialId: SEED_IDS.trial,
    siteId: SEED_IDS.siteWalkersFlat,
    name: "Walkers Flat base case (placeholder numbers)",
    assumptionsJson: JSON.stringify({
      seasonTonnes: 8000,
      pricePerTonne: 450,
      labourRatePerHour: 40,
    }),
    createdAt: T0,
  },
  {
    scenarioId: "5f0a6c1e-0008-4000-8000-000000000003",
    trialId: SEED_IDS.trial,
    siteId: SEED_IDS.siteTasmania,
    name: "Tasmania base case (placeholder numbers)",
    assumptionsJson: JSON.stringify({
      seasonTonnes: 5000,
      pricePerTonne: 420,
      labourRatePerHour: 45,
    }),
    createdAt: T0,
  },
];

// A worked REPLICATED trial so colleagues can see the "proper trial" support:
// a nitrogen-rate response experiment, 3 treatments x 3 replicates at one site,
// with yield (t/ha) as the response variable. Eight of the nine plots are
// recorded so the completeness grid shows an outstanding plot.

const NT = {
  trial: "5f0a6c1e-0002-4000-8000-000000000003",
  site: "5f0a6c1e-0003-4000-8000-000000000004",
  contact: "5f0a6c1e-0005-4000-8000-000000000004",
  armStd: "5f0a6c1e-0004-4000-8000-000000000007",
  armHigh: "5f0a6c1e-0004-4000-8000-000000000008",
  armSplit: "5f0a6c1e-0004-4000-8000-000000000009",
  template: "5f0a6c1e-0006-4000-8000-000000000020",
  emergenceForm: "5f0a6c1e-0006-4000-8000-000000000021",
  midSeasonForm: "5f0a6c1e-0006-4000-8000-000000000022",
} as const;

const ntTrial: Trial = {
  trialId: NT.trial,
  projectId: SEED_IDS.project,
  name: "Nitrogen Rate Response Trial",
  objective:
    "Measure the yield response to three nitrogen strategies under a replicated design, for statistical comparison.",
  status: "active",
  design: "replicated",
  replicates: 3,
  blocking: "none" as const,
  vocabulary: null,
  plotLengthM: null,
  plotWidthM: null,
  dataSources: [],
  layoutSeed: null,
  responseMetric: "yield",
  createdAt: T0,
  updatedAt: T0,
};

const ntContact: Contact = {
  contactId: NT.contact,
  name: "Trial Cooperator",
  business: "",
  role: "cooperator",
  region: "South Australia",
  email: "",
  phone: "",
  tags: ["nitrogen-trial"],
  createdAt: T0,
};

const ntSite: Site = {
  siteId: NT.site,
  trialId: NT.trial,
  contactId: NT.contact,
  location: "Mallee block",
  region: "South Australia",
  soilType: "Sandy loam",
  coordinates: null,
  bomStationId: null,
  plantingDate: daysBeforeToday(44),
  stageDates: { emergence: daysBeforeToday(20) },
  createdAt: T0,
};

const ntArms: PracticeArm[] = [
  {
    armId: NT.armStd,
    trialId: NT.trial,
    name: "Standard N",
    type: "control",
    description: "District-standard nitrogen rate.",
    sortOrder: 0,
    archived: false,
    createdAt: T0,
  },
  {
    armId: NT.armHigh,
    trialId: NT.trial,
    name: "High N",
    type: "alternative",
    description: "Elevated nitrogen rate.",
    sortOrder: 1,
    archived: false,
    createdAt: T0,
  },
  {
    armId: NT.armSplit,
    trialId: NT.trial,
    name: "Split N",
    type: "alternative",
    description: "Standard total nitrogen, split across the season.",
    sortOrder: 2,
    archived: false,
    createdAt: T0,
  },
];

const ntTemplate: FormTemplate = {
  templateId: NT.template,
  trialId: NT.trial,
  armId: null,
  name: "Plot yield record",
  eventType: "field_record",
  audience: "grower",
  frequency: "Once per plot at harvest",
  timing: { stage: "harvest", dapFrom: 0, dapTo: 14 },
  requiresSite: true,
  requiresArm: true,
  // No "plot number" question here: the trial has a layout, so the form asks
  // which plot before it opens and files the answer structurally. Asking again
  // gets two plot numbers per record that can disagree with each other.
  fields: [
    {
      fieldName: "yield",
      label: "Plot yield",
      type: "number",
      required: true,
      options: null,
      min: 0,
      max: null,
      unit: "t/ha",
      displayOrder: 0,
    },
    {
      fieldName: "notes",
      label: "Anything worth noting?",
      type: "text",
      required: false,
      options: null,
      min: null,
      max: null,
      unit: null,
      displayOrder: 1,
    },
  ],
  createdAt: T0,
};

// Plot yields (t/ha): each treatment across three reps. High N rep 3 not yet in.
const ntPlots: Array<[arm: string, rep: number, plot: string, yieldValue: number]> = [
  [NT.armStd, 1, "101", 46.2],
  [NT.armStd, 2, "102", 44.8],
  [NT.armStd, 3, "103", 45.5],
  [NT.armHigh, 1, "201", 49.1],
  [NT.armHigh, 2, "202", 50.3],
  // High N rep 3 (plot 203) deliberately missing
  [NT.armSplit, 1, "301", 48.0],
  [NT.armSplit, 2, "302", 47.4],
  [NT.armSplit, 3, "303", 48.9],
];

const ntEvents: MeasurementEvent[] = ntPlots.map(([armId, rep], index) => ({
  eventId: `5f0a6c1e-00e0-4000-8000-0000000000${(index + 10).toString().padStart(2, "0")}`,
  trialId: NT.trial,
  siteId: NT.site,
  armId,
  replicate: rep,
  plot: null,
  eventDate: T0,
  eventType: "field_record",
  enteredBy: NT.contact,
  // "pending", not "synced": these have never been near the cloud. Claiming
  // otherwise made the dashboard report demo entries as safely uploaded when
  // no copy existed anywhere but this browser — and once a pull learned to
  // remove records the cloud no longer has, that lie deleted them.
  syncStatus: "pending",
  createdAt: T0,
}));

const ntMetrics: Metric[] = ntPlots.flatMap(([, , plot, yieldValue], index) => {
  const eventId = ntEvents[index].eventId;
  return [
    {
      metricId: `5f0a6c1e-00e1-4000-8000-0000000000${(index + 10).toString().padStart(2, "0")}`,
      eventId,
      metricName: "plotId",
      value: plot,
      unit: "",
      photoUrl: null,
      createdAt: T0,
    },
    {
      metricId: `5f0a6c1e-00e2-4000-8000-0000000000${(index + 10).toString().padStart(2, "0")}`,
      eventId,
      metricName: "yield",
      value: yieldValue,
      unit: "t/ha",
      photoUrl: null,
      createdAt: T0,
    },
  ];
});

/**
 * Every record the seed writes shares this prefix, which is what makes a
 * demonstration trial recognisable later. It matters because the app has to
 * warn that the example figures are not anybody's real numbers — and that
 * warning has to disappear on its own once real trials arrive, or it becomes
 * a lie about the user's own data and teaches them to ignore warnings.
 */
const SEED_ID_PREFIX = "5f0a6c1e-";

/** Whether this trial came from the built-in demonstration data. */
export function isSeedTrial(trialId: string): boolean {
  return trialId.startsWith(SEED_ID_PREFIX);
}

export type SeedPresence = "none" | "some" | "all";

/** How the demonstration trials sit among the real ones, if any. */
export function seedPresence(trialIds: string[]): SeedPresence {
  if (trialIds.length === 0) return "none";
  const seeded = trialIds.filter(isSeedTrial).length;
  if (seeded === 0) return "none";
  return seeded === trialIds.length ? "all" : "some";
}

// Bumped so devices that already ran v11 re-seed, restoring the demonstration
// entries the sync-status lie caused to be removed.

/**
 * The rest of the season.
 *
 * One form per visit, which is what the add-a-form button is for and what
 * almost every real protocol needs: an emergence count while the crop is
 * coming up, a canopy and disease check mid-season, the weights at harvest.
 * Each carries its own timing, so the trial has three schedules rather than
 * one — and between them the three land on the three states the due list can
 * show, which is the point of seeding them at all.
 */
const ntEmergenceForm: FormTemplate = {
  templateId: NT.emergenceForm,
  trialId: NT.trial,
  armId: null,
  name: "Emergence count",
  // Its own event type, because records carry the type rather than the form
  // id — two forms sharing one look like a single visit to everything
  // downstream.
  eventType: "emergenceCount",
  audience: "grower",
  frequency: "Once per plot, as the crop comes up",
  timing: { stage: "emergence", dapFrom: 0, dapTo: 7 },
  requiresSite: true,
  requiresArm: true,
  fields: [
    {
      fieldName: "plantsEmerged",
      label: "Plants up in the counted rows",
      type: "number",
      required: true,
      options: null,
      min: 0,
      max: null,
      unit: "count",
      displayOrder: 0,
    },
    {
      fieldName: "gaps",
      label: "Any obvious gaps?",
      type: "boolean",
      required: false,
      options: null,
      min: null,
      max: null,
      unit: null,
      displayOrder: 1,
    },
    {
      fieldName: "notes",
      label: "Anything worth noting?",
      type: "text",
      required: false,
      options: null,
      min: null,
      max: null,
      unit: null,
      displayOrder: 2,
    },
  ],
  createdAt: T0,
};

const ntMidSeasonForm: FormTemplate = {
  templateId: NT.midSeasonForm,
  trialId: NT.trial,
  armId: null,
  name: "Canopy and disease check",
  eventType: "midSeasonCheck",
  audience: "grower",
  frequency: "Once per plot, around tuber initiation",
  timing: { stage: "tuberInitiation", dapFrom: null, dapTo: null },
  requiresSite: true,
  requiresArm: true,
  fields: [
    {
      fieldName: "canopyVigour",
      label: "Canopy vigour",
      type: "slider",
      required: true,
      options: null,
      min: 1,
      max: 5,
      unit: null,
      displayOrder: 0,
    },
    {
      fieldName: "diseaseSeen",
      label: "Any disease showing?",
      type: "select",
      required: false,
      options: ["none", "early blight", "target spot", "something else"],
      min: null,
      max: null,
      unit: null,
      displayOrder: 1,
    },
    {
      fieldName: "photo",
      label: "Photo of the canopy",
      type: "photo",
      required: false,
      options: null,
      min: null,
      max: null,
      unit: null,
      displayOrder: 2,
    },
  ],
  createdAt: T0,
};

// Emergence counts, already taken — so the demo shows a visit that is done
// alongside one that is due and one still coming.
const ntEmergenceDate = `${daysBeforeToday(18)}T00:00:00.000Z`;
const ntEmergenceEvents: MeasurementEvent[] = ntPlots.map(([armId, rep], index) => ({
  eventId: `5f0a6c1e-00e3-4000-8000-0000000000${(index + 10).toString().padStart(2, "0")}`,
  trialId: NT.trial,
  siteId: NT.site,
  armId,
  replicate: rep,
  plot: null,
  eventDate: ntEmergenceDate,
  eventType: "emergenceCount",
  enteredBy: NT.contact,
  syncStatus: "pending",
  createdAt: ntEmergenceDate,
}));

const ntEmergenceMetrics: Metric[] = ntEmergenceEvents.map((event, index) => ({
  metricId: `5f0a6c1e-00e4-4000-8000-0000000000${(index + 10).toString().padStart(2, "0")}`,
  eventId: event.eventId,
  metricName: "plantsEmerged",
  value: 92 + ((index * 3) % 9),
  unit: "count",
  photoUrl: null,
  createdAt: ntEmergenceDate,
}));

const SEED_FLAG = { key: "seeded", version: 15 };

export async function seedIfNeeded(): Promise<void> {
  const existing = await dbGet<{ key: string; version: number }>("meta", "seeded");
  if (existing && existing.version >= SEED_FLAG.version) return;

  await dbPutMany([
    { collection: "projects", value: project },
    { collection: "trials", value: trial },
    { collection: "trials", value: heTrial },
    ...contacts.map((contact) => ({ collection: "contacts" as const, value: contact })),
    { collection: "contacts", value: heContact },
    ...sites.map((site) => ({ collection: "sites" as const, value: site })),
    { collection: "sites", value: heSite },
    ...arms.map((arm) => ({ collection: "practiceArms" as const, value: arm })),
    ...heArms.map((arm) => ({ collection: "practiceArms" as const, value: arm })),
    { collection: "formTemplates", value: template },
    { collection: "formTemplates", value: heTemplate },
    ...heStaffForms.map((form) => ({ collection: "formTemplates" as const, value: form })),
    { collection: "trials", value: ntTrial },
    { collection: "contacts", value: ntContact },
    { collection: "sites", value: ntSite },
    ...ntArms.map((arm) => ({ collection: "practiceArms" as const, value: arm })),
    { collection: "formTemplates", value: ntTemplate },
    { collection: "formTemplates", value: ntEmergenceForm },
    { collection: "formTemplates", value: ntMidSeasonForm },
    ...ntEvents.map((event) => ({ collection: "measurementEvents" as const, value: event })),
    ...ntEmergenceEvents.map((event) => ({ collection: "measurementEvents" as const, value: event })),
    ...ntEmergenceMetrics.map((metric) => ({ collection: "metrics" as const, value: metric })),
    ...ntMetrics.map((metric) => ({ collection: "metrics" as const, value: metric })),
    ...seedAssumptions.map((assumption) => ({
      collection: "armAssumptions" as const,
      value: assumption,
    })),
    ...seedScenarios.map((scenario) => ({
      collection: "economicScenarios" as const,
      value: scenario,
    })),
  ]);
  await dbPut("meta", SEED_FLAG);
}
