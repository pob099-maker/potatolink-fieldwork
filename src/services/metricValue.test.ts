import { describe, expect, it } from "vitest";
import {
  metricDisplay,
  metricExportValues,
  metricFormValue,
  metricNumber,
} from "./metricValue";
import type { FormField, Metric, MetricValue } from "../types";

describe("metricDisplay", () => {
  it("reads a yes/no answer back as a word", () => {
    expect(metricDisplay(true)).toBe("Yes");
    expect(metricDisplay(false)).toBe("No");
  });

  it("still reads records written before values kept their type", () => {
    expect(metricDisplay("true")).toBe("Yes");
    expect(metricDisplay("false")).toBe("No");
  });

  it("lists every choice from a multi-choice answer", () => {
    expect(metricDisplay(["Scab", "Greening"])).toBe("Scab; Greening");
  });

  it("puts the unit after a measurement, and nowhere else", () => {
    expect(metricDisplay(12.4, "t/ha")).toBe("12.4 t/ha");
    expect(metricDisplay(true, "")).toBe("Yes");
  });
});

describe("metricExportValues", () => {
  it("gives a multi-choice answer one value per selection", () => {
    expect(metricExportValues(["Scab", "Greening", "Rot"])).toEqual([
      "Scab",
      "Greening",
      "Rot",
    ]);
  });

  it("exports a yes/no answer as a machine-readable boolean", () => {
    expect(metricExportValues(true)).toEqual(["true"]);
    expect(metricExportValues(false)).toEqual(["false"]);
  });

  it("keeps an empty selection as one blank row rather than dropping it", () => {
    expect(metricExportValues([])).toEqual([""]);
  });
});

describe("metricNumber", () => {
  it("reads numbers, including ones stored as text", () => {
    expect(metricNumber(42)).toBe(42);
    expect(metricNumber("42.5")).toBe(42.5);
  });

  it("refuses answers that are not measurements", () => {
    // Number(true) is 1 and Number([]) is 0, so without this guard a yes/no
    // or multi-choice answer would be averaged as if it were a reading.
    expect(metricNumber(true)).toBeNull();
    expect(metricNumber(["Scab"])).toBeNull();
    expect(metricNumber("")).toBeNull();
    expect(metricNumber("not a number")).toBeNull();
  });
});

describe("metricFormValue", () => {
  const field = (over: Partial<FormField>): FormField => ({
    fieldName: "f",
    label: "F",
    type: "text",
    required: false,
    options: null,
    min: null,
    max: null,
    unit: null,
    displayOrder: 0,
    ...over,
  });
  const metric = (value: MetricValue, photoUrl: string | null = null): Metric => ({
    metricId: "m1",
    eventId: "e1",
    metricName: "f",
    value,
    unit: "",
    photoUrl,
    createdAt: "2026-08-18T00:00:00.000Z",
  });

  it("reopens a correction on what was actually recorded", () => {
    expect(metricFormValue(field({ type: "number" }), metric(42.5))).toBe(42.5);
    expect(metricFormValue(field({ type: "boolean" }), metric(true))).toBe(true);
    expect(metricFormValue(field({ type: "multiselect" }), metric(["a", "b"]))).toEqual(["a", "b"]);
  });

  it("repairs an older record's flattened answer on the way in", () => {
    // Correcting an entry written before answers kept their type is also how
    // that entry gets fixed — it is rewritten in the new shape on save.
    expect(metricFormValue(field({ type: "boolean" }), metric("true"))).toBe(true);
    expect(metricFormValue(field({ type: "multiselect" }), metric("rot, greening"))).toEqual([
      "rot",
      "greening",
    ]);
  });

  it("hands a media field back its pointer, not the type name", () => {
    expect(metricFormValue(field({ type: "photo" }), metric("photo", "media:abc"))).toBe("media:abc");
  });

  it("leaves a field with no recorded answer empty", () => {
    expect(metricFormValue(field({ type: "text" }), undefined)).toBeUndefined();
  });
});
