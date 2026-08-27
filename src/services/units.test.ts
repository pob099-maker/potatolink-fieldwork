import { describe, expect, it } from "vitest";
import {
  UNIT_OPTIONS,
  canonicalUnit,
  describePower,
  findUnit,
  isKnownUnit,
  unitGroups,
} from "./units";
import { areaUnit, weightUnit } from "./plotArea";

// A typed unit is worse than unpoolable. weightUnit returns null for anything
// outside its list, and null means the tonnes-per-hectare conversion does not
// happen — silently, with no error and no empty column to notice.

describe("the offered list and the matcher agree", () => {
  // The one test that matters most here. A list whose entries the matcher does
  // not recognise would be the same bug wearing a dropdown.
  it("every unit promising a yield conversion actually gets one", () => {
    for (const option of UNIT_OPTIONS.filter((o) => o.power === "yield")) {
      expect(weightUnit(option.value)).not.toBeNull();
    }
  });

  it("every unit promising an area actually gets one", () => {
    for (const option of UNIT_OPTIONS.filter((o) => o.power === "area")) {
      expect(areaUnit(option.value)).not.toBeNull();
    }
  });

  it("does not promise a conversion the matcher would refuse", () => {
    for (const option of UNIT_OPTIONS.filter((o) => o.power === null)) {
      expect(weightUnit(option.value)).toBeNull();
      expect(areaUnit(option.value)).toBeNull();
    }
  });
});

describe("saying what a unit buys", () => {
  it("says so where the choice is made, not by its later absence", () => {
    expect(describePower("kg")).toMatch(/tonnes per hectare/);
    expect(describePower("t")).toMatch(/tonnes per hectare/);
    expect(describePower("ha")).toMatch(/plot size/);
  });

  it("claims nothing for a unit that buys nothing", () => {
    expect(describePower("count")).toBeNull();
    expect(describePower("cm")).toBeNull();
  });

  it("claims nothing for a unit it has never seen", () => {
    expect(describePower("bushels")).toBeNull();
  });
});

describe("tidying a unit somebody typed", () => {
  it("puts the spellings that already reach the app onto the canonical one", () => {
    // These are exactly the variants plotArea had to grow a matcher for.
    expect(canonicalUnit("kilograms")).toBe("kg");
    expect(canonicalUnit("Kgs")).toBe("kg");
    expect(canonicalUnit("tonnes")).toBe("t");
    expect(canonicalUnit("Hectares")).toBe("ha");
    expect(canonicalUnit("m²")).toBe("m2");
  });

  it("rescues a spelling the matcher would have refused", () => {
    // "kilo" is not in weightUnit's list, so a trial that typed it lost its
    // yield conversion entirely.
    expect(weightUnit("kilo")).toBeNull();
    expect(weightUnit(canonicalUnit("kilo"))).toBe("kg");
  });

  it("leaves an unfamiliar unit exactly as typed", () => {
    // Guessing at somebody's meaning is how a number changes silently. A trial
    // measuring something nobody anticipated keeps its own word for it.
    expect(canonicalUnit("bushels/acre")).toBe("bushels/acre");
    expect(canonicalUnit("  brix  ")).toBe("brix");
  });

  it("leaves a blank blank", () => {
    expect(canonicalUnit("")).toBe("");
    expect(canonicalUnit("   ")).toBe("");
  });

  it("is idempotent, so re-saving a form cannot drift it", () => {
    for (const option of UNIT_OPTIONS) {
      expect(canonicalUnit(canonicalUnit(option.value))).toBe(option.value);
    }
  });
});

describe("the list itself", () => {
  it("groups without losing or duplicating anything", () => {
    const grouped = unitGroups().flatMap((entry) => entry.options);
    expect(grouped).toHaveLength(UNIT_OPTIONS.length);
    expect(new Set(grouped.map((o) => o.value)).size).toBe(UNIT_OPTIONS.length);
  });

  it("knows what it holds, whatever the case", () => {
    expect(isKnownUnit("KG")).toBe(true);
    expect(isKnownUnit(" ha ")).toBe(true);
    expect(isKnownUnit("furlongs")).toBe(false);
  });

  it("can find a unit by its stored value", () => {
    expect(findUnit("kg")?.group).toBe("Weight");
    expect(findUnit("nope")).toBeUndefined();
  });
});
