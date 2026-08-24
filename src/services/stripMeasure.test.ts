import { describe, expect, it } from "vitest";
import { accuracyNote, distanceMetres, stripArea, type Fix } from "./stripMeasure";

const fix = (lat: number, lng: number, accuracyM = 5): Fix => ({ lat, lng, accuracyM });

describe("distance between two fixes", () => {
  it("measures a known north–south run", () => {
    // A tenth of a degree of latitude is close to 11.1 km anywhere on earth.
    expect(distanceMetres(fix(-34.0, 139.0), fix(-34.1, 139.0))).toBeCloseTo(11119, -2);
  });

  it("is zero for the same point", () => {
    expect(distanceMetres(fix(-34.0, 139.0), fix(-34.0, 139.0))).toBe(0);
  });

  it("does not care which end you started from", () => {
    const a = fix(-34.0, 139.0);
    const b = fix(-34.002, 139.003);
    expect(distanceMetres(a, b)).toBeCloseTo(distanceMetres(b, a), 9);
  });
});

describe("a strip's area", () => {
  it("multiplies the walked length by the machine's width", () => {
    // Roughly an 800 m run — the length is measured, the width is known.
    const start = fix(-34.0, 139.0);
    const end = fix(-34.0071946, 139.0);
    const measured = stripArea(start, end, 12);
    expect(measured).not.toBeNull();
    expect(measured!.lengthM).toBeCloseTo(800, 0);
    expect(measured!.areaHa).toBeCloseTo(0.96, 2);
  });

  it("reports the error the two fixes imply, and ignores the width", () => {
    // Five metres of uncertainty at each end of an 800 m run is 10 m in 800.
    const measured = stripArea(fix(-34.0, 139.0), fix(-34.0071946, 139.0), 12);
    expect(measured!.errorPercent).toBeCloseTo(1.25, 1);
  });

  it("refuses a run too short to be one", () => {
    // A few metres apart is the device's own noise, not a strip. An area
    // computed from it would be a guess wearing a decimal point.
    expect(stripArea(fix(-34.0, 139.0), fix(-34.00002, 139.0), 12)).toBeNull();
  });

  it("refuses a width that cannot describe a strip", () => {
    expect(stripArea(fix(-34.0, 139.0), fix(-34.0071946, 139.0), 0)).toBeNull();
    expect(stripArea(fix(-34.0, 139.0), fix(-34.0071946, 139.0), -12)).toBeNull();
  });
});

describe("saying how much to trust it", () => {
  const measure = (accuracyM: number) =>
    stripArea(fix(-34.0, 139.0, accuracyM), fix(-34.0071946, 139.0, accuracyM), 12)!;

  it("passes a tight fix on a long run", () => {
    expect(accuracyNote(measure(3)).level).toBe("good");
  });

  it("flags a loose fix as usable but rough", () => {
    expect(accuracyNote(measure(30)).level).toBe("fair");
  });

  it("says plainly when the number is not worth having", () => {
    // Under a tree line, or a short run — better an honest blank than a
    // number that looks like a measurement.
    const note = accuracyNote(measure(60));
    expect(note.level).toBe("poor");
    expect(note.message).toContain("type the area instead");
  });
});
