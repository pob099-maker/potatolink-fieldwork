// Seed data for the first use case: the Downs CropVision optical sorter
// post-harvest handling trial. IDs are fixed so seeding is idempotent and
// local records line up with a Supabase project seeded from seed.sql.

import type { Contact, FormTemplate, PracticeArm, Project, Site, Trial } from "../types";
import { dbGet, dbPut, dbPutMany } from "../lib/localdb";

const T0 = "2026-08-01T00:00:00.000Z";

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
    createdAt: T0,
  },
  {
    armId: SEED_IDS.armOwned,
    trialId: SEED_IDS.trial,
    name: "CropVision — on-farm owned unit",
    type: "alternative",
    description: "Optical sorter owned and operated on farm.",
    sortOrder: 1,
    createdAt: T0,
  },
  {
    armId: SEED_IDS.armShared,
    trialId: SEED_IDS.trial,
    name: "CropVision — shared/service model",
    type: "alternative",
    description: "Optical sorter accessed through a shared or contracted service.",
    sortOrder: 2,
    createdAt: T0,
  },
  {
    armId: SEED_IDS.armImproved,
    trialId: SEED_IDS.trial,
    name: "Improved handling without optical sorter",
    type: "alternative",
    description: "Upgraded conventional handling practices, no optical sorter.",
    sortOrder: 3,
    createdAt: T0,
  },
];

const template: FormTemplate = {
  templateId: SEED_IDS.template,
  trialId: SEED_IDS.trial,
  armId: null,
  name: "CropVision run record",
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
    createdAt: T0,
  },
  {
    armId: SEED_IDS.heArmFitted,
    trialId: SEED_IDS.heTrial,
    name: "HarvestEye-fitted harvester",
    type: "alternative",
    description: "HarvestEye unit mounted on the harvester, validated against hand grading.",
    sortOrder: 1,
    createdAt: T0,
  },
];

const heTemplate: FormTemplate = {
  templateId: SEED_IDS.heTemplate,
  trialId: SEED_IDS.heTrial,
  armId: null,
  name: "HarvestEye harvest run record",
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
      label: "Main defect graded out",
      type: "select",
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
      fieldName: "notes",
      label: "Anything else worth noting?",
      type: "text",
      required: false,
      options: null,
      min: null,
      max: null,
      unit: null,
      displayOrder: 11,
    },
  ],
  createdAt: T0,
};

const SEED_FLAG = { key: "seeded", version: 5 };

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
  ]);
  await dbPut("meta", SEED_FLAG);
}
