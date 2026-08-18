import { describe, expect, it } from "vitest";
import { buildEntryFormSchema, measurementEventSchema, trialSchema } from "./index";
import type { FormField } from "../types";

const numberField: FormField = {
  fieldName: "tonnesHandled",
  label: "Tonnes handled",
  type: "number",
  required: true,
  options: null,
  min: 0,
  max: null,
  unit: "t",
  displayOrder: 0,
};

const optionalSelect: FormField = {
  fieldName: "mainRemovalCategory",
  label: "Main thing removed",
  type: "select",
  required: false,
  options: ["rot", "misshapes"],
  min: null,
  max: null,
  unit: null,
  displayOrder: 1,
};

describe("buildEntryFormSchema", () => {
  it("accepts valid values and coerces number strings", () => {
    const schema = buildEntryFormSchema([numberField, optionalSelect]);
    const parsed = schema.safeParse({ tonnesHandled: "42.5", mainRemovalCategory: "rot" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.tonnesHandled).toBe(42.5);
    }
  });

  it("rejects a required number below its minimum", () => {
    const schema = buildEntryFormSchema([numberField]);
    expect(schema.safeParse({ tonnesHandled: -1 }).success).toBe(false);
  });

  it("allows optional fields to be empty", () => {
    const schema = buildEntryFormSchema([numberField, optionalSelect]);
    const parsed = schema.safeParse({ tonnesHandled: 10, mainRemovalCategory: "" });
    expect(parsed.success).toBe(true);
  });

  it("rejects select values outside the configured options", () => {
    const schema = buildEntryFormSchema([optionalSelect]);
    expect(schema.safeParse({ mainRemovalCategory: "gold nuggets" }).success).toBe(false);
  });
});

describe("record schemas", () => {
  it("rejects a trial with an unknown status", () => {
    const parsed = trialSchema.safeParse({
      trialId: "t1",
      projectId: "p1",
      name: "Trial",
      objective: "",
      status: "paused",
      createdAt: "2026-08-18T00:00:00.000Z",
      updatedAt: "2026-08-18T00:00:00.000Z",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a valid measurement event", () => {
    const parsed = measurementEventSchema.safeParse({
      eventId: "e1",
      siteId: "s1",
      armId: "a1",
      eventDate: "2026-08-18T00:00:00.000Z",
      eventType: "field_record",
      enteredBy: "c1",
      syncStatus: "pending",
      createdAt: "2026-08-18T00:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
  });
});
