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

export const dataSourceSchema = z.object({
  label: z.string().min(1),
  kind: z.enum(["sensorthings", "isoxml", "weather", "document", "other"]),
  reference: z.string().min(1),
  siteId: id.nullable().default(null),
  note: z.string().default(""),
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

export const siteSchema = z.object({
  siteId: id,
  trialId: id,
  contactId: id,
  location: z.string().min(1, "Location is required"),
  region: z.string(),
  soilType: z.string(),
  coordinates: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  createdAt: isoDate,
});

export const practiceArmSchema = z.object({
  armId: id,
  trialId: id,
  name: z.string().min(1, "Name is required"),
  type: z.enum(["control", "alternative"]),
  description: z.string(),
  sortOrder: z.number().int(),
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

export const formFieldSchema = z.object({
  fieldName: z.string().min(1),
  label: z.string().min(1),
  type: z.enum([
    "number",
    "text",
    "select",
    "multiselect",
    "slider",
    "photo",
    "video",
    "file",
    "gps",
    "date",
    "boolean",
  ]),
  required: z.boolean(),
  options: z.array(z.string()).nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  unit: z.string().nullable(),
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
