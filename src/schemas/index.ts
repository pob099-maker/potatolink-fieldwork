// Zod validation schemas — every record is validated with these before any
// database write (CLAUDE.md rule 3).

import { z } from "zod";

const isoDate = z.string().min(1, "Required");
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

export const trialSchema = z.object({
  trialId: id,
  projectId: id,
  name: z.string().min(1, "Name is required"),
  objective: z.string(),
  status: z.enum(["draft", "active", "completed", "archived"]),
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
  createdAt: isoDate,
});

export const armAssumptionSchema = z.object({
  assumptionId: id,
  armId: id,
  category: z.enum(["capex", "opex", "labour", "revenue", "other"]),
  fieldName: z.string().min(1),
  value: z.union([z.number(), z.string()]),
  unit: z.string(),
  createdAt: isoDate,
});

export const syncStatusSchema = z.enum(["pending", "synced", "error"]);

export const measurementEventSchema = z.object({
  eventId: id,
  siteId: id,
  armId: id,
  eventDate: isoDate,
  eventType: z.string().min(1),
  enteredBy: z.string(),
  syncStatus: syncStatusSchema,
  createdAt: isoDate,
});

export const metricSchema = z.object({
  metricId: id,
  eventId: id,
  metricName: z.string().min(1),
  value: z.union([z.number(), z.string()]),
  unit: z.string(),
  photoUrl: z.string().nullable(),
  createdAt: isoDate,
});

export const economicScenarioSchema = z.object({
  scenarioId: id,
  trialId: id,
  name: z.string().min(1),
  assumptionsJson: z.string(),
  createdAt: isoDate,
});

export const resultSetSchema = z.object({
  resultId: id,
  scenarioId: id,
  armId: id,
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
  type: z.enum(["number", "text", "select", "slider", "photo", "date", "boolean"]),
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
  fields: z.array(formFieldSchema).min(1),
  createdAt: isoDate,
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
        value = num;
        break;
      }
      case "slider": {
        let num = z.coerce.number();
        if (field.min !== null) num = num.min(field.min);
        if (field.max !== null) num = num.max(field.max);
        value = num;
        break;
      }
      case "boolean":
        value = z.boolean();
        break;
      case "select":
        value = field.options ? z.enum(field.options as [string, ...string[]]) : z.string();
        break;
      case "date":
        value = z.string().min(1, "Pick a date");
        break;
      case "photo":
        value = z.string(); // data URL captured from the camera
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
