import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { makeFieldName, moveField, normaliseField } from "./templates";
import { saveTemplate } from "./store";
import type { FormField, FormTemplate } from "../types";

function field(name: string, order: number): FormField {
  return {
    fieldName: name,
    label: name,
    type: "text",
    required: false,
    options: null,
    min: null,
    max: null,
    unit: null,
    displayOrder: order,
  };
}

describe("makeFieldName", () => {
  it("camel-cases plain language labels", () => {
    expect(makeFieldName("Tonnes handled", [])).toBe("tonnesHandled");
    expect(makeFieldName("How long did the run take?", [])).toBe("howLongDidTheRun");
  });

  it("avoids collisions with existing names", () => {
    expect(makeFieldName("Notes", ["notes"])).toBe("notes2");
  });

  it("never starts with a digit and survives empty labels", () => {
    expect(makeFieldName("30 second video", [])).toBe("f30SecondVideo");
    expect(makeFieldName("???", [])).toBe("field");
  });
});

describe("moveField", () => {
  it("swaps neighbours and renumbers displayOrder", () => {
    const moved = moveField([field("a", 0), field("b", 1), field("c", 2)], 2, -1);
    expect(moved.map((f) => f.fieldName)).toEqual(["a", "c", "b"]);
    expect(moved.map((f) => f.displayOrder)).toEqual([0, 1, 2]);
  });

  it("ignores moves past the ends", () => {
    const fields = [field("a", 0), field("b", 1)];
    expect(moveField(fields, 0, -1)).toBe(fields);
  });
});

describe("normaliseField", () => {
  it("clears attributes that don't apply to the new type", () => {
    const numeric = { ...field("speed", 0), type: "number" as const, unit: "km/h", min: 0 };
    const asBoolean = normaliseField(numeric, "boolean");
    expect(asBoolean.unit).toBeNull();
    expect(asBoolean.min).toBeNull();
  });

  it("gives sliders default bounds and selects starter options", () => {
    expect(normaliseField(field("rating", 0), "slider").min).toBe(1);
    expect(normaliseField(field("choice", 0), "select").options).toHaveLength(2);
  });
});

describe("saveTemplate", () => {
  const base: FormTemplate = {
    templateId: "11111111-1111-4111-8111-111111111111",
    trialId: "22222222-2222-4222-8222-222222222222",
    armId: null,
    name: "Test form",
    fields: [field("notes", 0)],
    createdAt: "2026-08-18T00:00:00.000Z",
  };

  it("saves a valid template", async () => {
    const result = await saveTemplate(base);
    expect(result.success).toBe(true);
  });

  it("rejects a template with no fields", async () => {
    const result = await saveTemplate({ ...base, fields: [] });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate internal field names", async () => {
    const result = await saveTemplate({ ...base, fields: [field("notes", 0), field("notes", 1)] });
    expect(result.success).toBe(false);
  });
});
