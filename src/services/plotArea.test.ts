import { describe, expect, it } from "vitest";
import {
  areaAsM2,
  areaUnit,
  describePlot,
  plotAreaM2,
  weightUnit,
  yieldPerHectare,
} from "./plotArea";

const plot = (plotWidthM: number | null, plotLengthM: number | null) => ({
  plotWidthM,
  plotLengthM,
});

describe("plot size", () => {
  it("multiplies the two sides", () => {
    expect(plotAreaM2(plot(2, 10))).toBe(20);
  });

  it("has no area until both sides are known", () => {
    expect(plotAreaM2(plot(2, null))).toBeNull();
    expect(plotAreaM2(plot(null, null))).toBeNull();
  });

  it("refuses a side that is zero or negative", () => {
    // Nothing downstream should have to guard against dividing by it.
    expect(plotAreaM2(plot(0, 10))).toBeNull();
    expect(plotAreaM2(plot(-2, 10))).toBeNull();
  });

  it("reads back the way somebody would say it", () => {
    expect(describePlot(plot(2, 10))).toBe("2 × 10 m — 20 m²");
    expect(describePlot(plot(null, 10))).toBeNull();
  });
});

describe("weight to yield", () => {
  it("converts the arithmetic nobody should do in a paddock", () => {
    // 40 kg off a 2 × 10 m plot: 0.04 t over 0.002 ha.
    expect(yieldPerHectare(40, "kg", 20)).toBeCloseTo(20, 6);
  });

  it("handles a strip measured in tonnes", () => {
    // A hectare-scale strip: 12 t off 0.96 ha.
    expect(yieldPerHectare(12, "t", 9600)).toBeCloseTo(12.5, 6);
  });

  it("gives nothing rather than a guess when the size is unknown", () => {
    expect(yieldPerHectare(40, "kg", null)).toBeNull();
    expect(yieldPerHectare(40, "kg", 0)).toBeNull();
  });
});

describe("recognising units", () => {
  it("matches weights however they were typed", () => {
    // Matched on the unit, not the field name — naming a field is the trial
    // designer's business, and hardcoding one would tie the app to a crop.
    expect(weightUnit("kg")).toBe("kg");
    expect(weightUnit(" Kilograms ")).toBe("kg");
    expect(weightUnit("t")).toBe("t");
    expect(weightUnit("t/ha")).toBeNull();
    expect(weightUnit(null)).toBeNull();
  });

  it("matches areas, including the squared symbol", () => {
    expect(areaUnit("ha")).toBe("ha");
    expect(areaUnit("m²")).toBe("m2");
    expect(areaUnit("m2")).toBe("m2");
    expect(areaUnit("kg")).toBeNull();
  });

  it("converts a captured area to square metres", () => {
    expect(areaAsM2(0.96, "ha")).toBe(9600);
    expect(areaAsM2(20, "m2")).toBe(20);
    expect(areaAsM2(0, "ha")).toBeNull();
  });
});
