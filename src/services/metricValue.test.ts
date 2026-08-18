import { describe, expect, it } from "vitest";
import { metricDisplay, metricExportValues, metricNumber } from "./metricValue";

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
