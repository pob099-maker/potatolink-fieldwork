// Zod validation schemas — every record is validated with these before any
// database write (CLAUDE.md rule 3).

import { z } from "zod";

const isoDate = z.string().min(1, "Required");

// Postgres hands back an absent timestamp as null, not undefined. Rejecting
// null meant every row written before its updated_at column existed failed
// validation on pull and was silently skipped — so a second device never
// received those trials' forms and practices at all.
const optionalDate = isoDate.nullish().transform((value) => value ?? undefined);
const id = z.string().min(1);

export const projectSchema = z.object({
  projectId: id,
  name: z.string().min(1, "Name is required"),
  funder: z.string(),
  startDate: isoDate,
  endDate: isoDate,
  status: z.enum(["active", "completed", "archived"]),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const dataSourceSchema = z
  .object({
    label: z.string().min(1),
    kind: z.enum(["sensorthings", "isoxml", "weather", "document", "other"]),
    reference: z.string().min(1),
    siteId: id.nullish().transform((v) => v ?? null),
    armId: id.nullish().transform((v) => v ?? null),
    plot: z.number().int().positive().nullish().transform((v) => v ?? null),
    note: z.string().nullish().transform((v) => v ?? ""),
  })
  // Plots are numbered from one in every paddock, so a plot number without a
  // site does not identify anything.
  .refine((source) => source.plot === null || source.siteId !== null, {
    message: "A plot needs the site it is in",
    path: ["plot"],
  });

export const trialSchema = z.object({
  trialId: id,
  projectId: id,
  name: z.string().min(1, "Name is required"),
  objective: z.string(),
  status: z.enum(["draft", "active", "completed", "archived"]),
  design: z.enum(["observational", "replicated"]).default("observational"),
  replicates: z.number().int().min(0).default(0),
  blocking: z.enum(["none", "blocks"]).default("none"),
  vocabulary: z.enum(["treatment", "practice"]).nullish().transform((v) => v ?? null),
  plotLengthM: z.number().positive().nullish().transform((v) => v ?? null),
  plotWidthM: z.number().positive().nullish().transform((v) => v ?? null),
  dataSources: z.array(dataSourceSchema).nullish().transform((v) => v ?? []),
  layoutSeed: z.string().nullish().transform((v) => v ?? null),
  responseMetric: z.string().nullable().default(null),
  createdAt: isoDate,
  updatedAt: isoDate,
});

/**
 * A plain calendar day, not a timestamp.
 *
 * A planting date is a day somebody remembers, not an instant — storing it as
 * a timestamp invites a timezone to shift it across midnight and move every
 * window that hangs off it by a day.
 */
const plainDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-09-01");

/** Day counts are whole days, and cannot run backwards. */
const timingSchema = z
  .object({
    stage: z.string().nullable().default(null),
    dapFrom: z.number().int().nullable().default(null),
    dapTo: z.number().int().nullable().default(null),
  })
  .refine(
    (value) => value.dapFrom === null || value.dapTo === null || value.dapTo >= value.dapFrom,
    { message: "The window has to end on or after it starts.", path: ["dapTo"] },
  );

export const siteSchema = z.object({
  siteId: id,
  trialId: id,
  contactId: id,
  location: z.string().min(1, "Location is required"),
  region: z.string(),
  soilType: z.string(),
  coordinates: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  // Both default rather than being required, so every site written before
  // observation timing existed still parses. A site with no planting date is
  // simply one the app will not schedule against.
  plantingDate: plainDate.nullable().default(null),
  stageDates: z.record(z.string(), plainDate).default({}),
  createdAt: isoDate,
});

export const practiceArmSchema = z.object({
  armId: id,
  trialId: id,
  name: z.string().min(1, "Name is required"),
  type: z.enum(["control", "alternative"]),
  description: z.string(),
  sortOrder: z.number().int(),
  factorLevels: z.record(z.string(), z.string()).default({}),
  archived: z.boolean().default(false),
  createdAt: isoDate,
  updatedAt: optionalDate,
});

export const armAssumptionSchema = z.object({
  assumptionId: id,
  armId: id,
  category: z.enum(["capex", "opex", "labour", "revenue", "other"]),
  fieldName: z.string().min(1),
  value: z.union([z.number(), z.string()]),
  unit: z.string(),
  // Rows written before the flag existed are placeholders by definition.
  status: z.enum(["placeholder", "confirmed"]).default("placeholder"),
  createdAt: isoDate,
  updatedAt: optionalDate,
});

export const syncStatusSchema = z.enum(["pending", "synced", "error"]);

export const measurementEventSchema = z.object({
  eventId: id,
  trialId: id.nullable().default(null),
  siteId: id.nullable().default(null),
  armId: id.nullable().default(null),
  replicate: z.number().int().nullable().default(null),
  plot: z.number().int().nullable().default(null),
  eventDate: isoDate,
  eventType: z.string().min(1),
  enteredBy: z.string(),
  syncStatus: syncStatusSchema,
  createdAt: isoDate,
  updatedAt: optionalDate,
});

export const metricSchema = z.object({
  metricId: id,
  eventId: id,
  metricName: z.string().min(1),
  value: z.union([z.number(), z.string(), z.boolean(), z.array(z.string())]),
  unit: z.string(),
  photoUrl: z.string().nullable(),
  createdAt: isoDate,
  updatedAt: optionalDate,
});

export const economicScenarioSchema = z.object({
  scenarioId: id,
  trialId: id,
  siteId: id.nullable().default(null),
  name: z.string().min(1),
  assumptionsJson: z.string(),
  createdAt: isoDate,
  updatedAt: optionalDate,
});

export const resultSetSchema = z.object({
  resultId: id,
  scenarioId: id,
  armId: id,
  siteId: id.nullable().default(null),
  netBenefit: z.number(),
  paybackPeriod: z.number().nullable(),
  notes: z.string(),
  calculatedAt: isoDate,
});

export const contactSchema = z.object({
  contactId: id,
  name: z.string().min(1, "Name is required"),
  business: z.string(),
  role: z.enum(["grower", "staff", "cooperator", "vendor"]),
  region: z.string(),
  email: z.string(),
  phone: z.string(),
  tags: z.array(z.string()),
  // Absent means the backend has never heard of the column; null means nobody
  // has linked this person to an account. keepColumnsTheCloudLacks in
  // services/store.ts is what stops the first meaning being written over the
  // second, so no default here.
  authUserId: id.nullable().optional(),
  createdAt: isoDate,
});

export const trialMemberSchema = z.object({
  memberId: id,
  trialId: id,
  contactId: id,
  role: z.enum(["owner", "collaborator", "viewer"]),
  createdAt: isoDate,
});

export const adoptionFollowupSchema = z.object({
  followupId: id,
  trialId: id,
  contactId: id,
  adoptionStatus: z.enum([
    "not_started",
    "considering",
    "trialling",
    "adopted",
    "rejected",
  ]),
  behaviourNotes: z.string(),
  followupDate: isoDate,
  createdAt: isoDate,
});

/** The one list of field types. A second copy is a list that can drift. */
export const fieldTypeSchema = z.enum([
  "number",
  "text",
  "select",
  "multiselect",
  "slider",
  "photo",
  "video",
  "file",
  "link",
  "gps",
  "date",
  "boolean",
]);

export const formFieldSchema = z.object({
  fieldName: z.string().min(1),
  label: z.string().min(1),
  type: fieldTypeSchema,
  required: z.boolean(),
  options: z.array(z.string()).nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  unit: z.string().nullable(),
  guidance: z.string().optional(),
  displayOrder: z.number().int(),
});

export const formTemplateSchema = z.object({
  templateId: id,
  trialId: id,
  armId: id.nullable(),
  name: z.string().min(1),
  eventType: z.string().min(1).default("field_record"),
  audience: z.enum(["grower", "staff"]).default("grower"),
  frequency: z.string().default(""),
  timing: timingSchema.nullable().default(null),
  requiresSite: z.boolean().default(true),
  requiresArm: z.boolean().default(true),
  fields: z.array(formFieldSchema).min(1),
  createdAt: isoDate,
  updatedAt: optionalDate,
});

export const dataEntryLogSchema = z.object({
  entryId: id,
  eventId: id,
  enteredBy: z.string(),
  entryDate: isoDate,
  deviceType: z.enum(["mobile", "tablet", "desktop"]),
  syncStatus: syncStatusSchema,
  createdAt: isoDate,
});

/** Build a Zod schema for a grower entry form from its FormTemplate fields. */
export function buildEntryFormSchema(
  fields: Array<z.infer<typeof formFieldSchema>>,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    let value: z.ZodTypeAny;
    switch (field.type) {
      case "number": {
        let num = z.coerce.number({ invalid_type_error: "Enter a number" });
        if (field.min !== null) num = num.min(field.min);
        if (field.max !== null) num = num.max(field.max);
        // An empty box is not a zero. z.coerce.number() turns "" into 0, so a
        // required yield left blank saved silently as 0 t/ha — which drags a
        // treatment mean down and looks like a real observation for the rest
        // of the trial. Blank becomes undefined, and a required field then
        // fails the way it should.
        value = z.preprocess(
          (raw) => (raw === "" || raw === null ? undefined : raw),
          num,
        );
        break;
      }
      case "slider": {
        let num = z.coerce.number();
        if (field.min !== null) num = num.min(field.min);
        if (field.max !== null) num = num.max(field.max);
        value = z.preprocess((raw) => (raw === "" || raw === null ? undefined : raw), num);
        break;
      }
      case "boolean":
        value = z.boolean();
        break;
      case "select":
        value = field.options ? z.enum(field.options as [string, ...string[]]) : z.string();
        break;
      case "multiselect": {
        const choice = field.options
          ? z.enum(field.options as [string, ...string[]])
          : z.string();
        value = field.required
          ? z.array(choice).min(1, "Choose at least one")
          : z.array(choice);
        break;
      }
      case "date":
        value = z.string().min(1, "Pick a date");
        break;
      case "photo":
      case "video":
      case "file":
        value = z.string(); // "media:<id>" pointer to the on-device blob
        break;
      case "gps":
        value = z
          .string()
          .regex(/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/, "Capture a location first");
        break;
      case "link":
        // Checked, but not strictly. A link that will not resolve is somebody
        // else's problem — this catches the case worth catching, which is a
        // paste that lost its scheme or picked up a stray word, because
        // "www.lab.com/result" typed into a notes field is indistinguishable
        // from a typo and nobody finds out until they try to open it.
        value = z
          .string()
          .trim()
          .regex(/^https?:\/\/\S+\.\S+/, "Paste a full web address, starting http:// or https://");
        break;
      case "text":
        value = z.string();
        break;
    }
    if (!field.required) {
      value = value.optional().or(z.literal("").transform(() => undefined));
    }
    shape[field.fieldName] = value;
  }
  return z.object(shape);
}


/* --- Weather and soil ---------------------------------------------------- */

const coordinate = {
  lat: z.number().min(-90).max(90).nullable().default(null),
  lon: z.number().min(-180).max(180).nullable().default(null),
};

export const weatherObservationSchema = z.object({
  observationId: id,
  sourceSystem: z.enum(["bom", "silo", "logger", "manual"]).default("bom"),
  stationId: z.string().min(1),
  stationName: z.string().default(""),
  ...coordinate,
  // Full ISO with an offset. A bare local time would be ambiguous twice a
  // year in every state that moves its clocks.
  observationTime: isoDate,
  airTempC: z.number().nullable().default(null),
  rainfallSince9amMm: z.number().min(0).nullable().default(null),
  relativeHumidityPct: z.number().min(0).max(100).nullable().default(null),
  windSpeedKmh: z.number().min(0).nullable().default(null),
  windDir: z.string().nullable().default(null),
  dewPointC: z.number().nullable().default(null),
  pressureMslHpa: z.number().nullable().default(null),
  rawPayload: z.record(z.string(), z.unknown()).nullable().default(null),
  createdAt: isoDate,
});

export const soilSampleSchema = z
  .object({
    sampleId: id,
    siteId: id,
    soilSource: z.enum(["ansis", "lab", "field", "grower"]).default("lab"),
    soilClassification: z.string().default(""),
    classificationSystem: z.string().default("unspecified"),
    sampleDate: plainDate,
    samplePointId: z.string().default(""),
    ...coordinate,
    depthFromCm: z.number().min(0),
    depthToCm: z.number().min(0),
    note: z.string().default(""),
    createdAt: isoDate,
  })
  .refine((value) => value.depthToCm > value.depthFromCm, {
    message: "The bottom of the interval has to be below the top.",
    path: ["depthToCm"],
  });

export const soilResultSchema = z
  .object({
    resultId: id,
    sampleId: id,
    attributeCode: z.string().min(1),
    attributeName: z.string().default(""),
    value: z.number().nullable().default(null),
    textValue: z.string().default(""),
    unit: z.string().default(""),
    methodCode: z.string().default("unspecified"),
    methodRef: z.string().default(""),
    createdAt: isoDate,
  })
  .refine((entry) => entry.value !== null || entry.textValue !== "", {
    message: "A result needs a number or words.",
    path: ["value"],
  });

/** Only what somebody added is stored; the shipped list lives in code. */
export const libraryEntrySchema = z.object({
  entryId: id,
  code: z.string().min(1),
  label: z.string().min(1),
  type: fieldTypeSchema,
  unit: z.string().default(""),
  minValue: z.number().nullable().default(null),
  maxValue: z.number().nullable().default(null),
  options: z.array(z.string()).nullable().default(null),
  guidance: z.string().default(""),
  source: z.enum(["builtin", "added"]).default("added"),
  usageCount: z.number().int().min(0).default(1),
  createdAt: isoDate,
});

/* --- Factorial ----------------------------------------------------------- */

export const factorSchema = z.object({
  factorId: id,
  trialId: id,
  name: z.string().min(1, "A factor needs a name"),
  code: z.string().default(""),
  sortOrder: z.number().int().default(0),
  createdAt: isoDate,
});

export const factorLevelSchema = z.object({
  levelId: id,
  factorId: id,
  label: z.string().min(1, "A level needs a label"),
  numericValue: z.number().nullable().default(null),
  sortOrder: z.number().int().default(0),
  createdAt: isoDate,
});
