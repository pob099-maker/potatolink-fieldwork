import { describe, expect, it } from "vitest";
import {
  BUILT_IN_MEASUREMENTS,
  isBuiltIn,
  libraryEntries,
  codeFor,
  findExisting,
  fromFormField,
  normaliseName,
  rankEntries,
  toFormField,
  type LibraryEntry,
} from "./measurementLibrary";
import type { FormField } from "../types";

const entry = (over: Partial<LibraryEntry> = {}): LibraryEntry => ({
  entryId: "e1",
  code: "marketableYield",
  label: "Marketable yield",
  type: "number",
  unit: "kg",
  min: 0,
  max: null,
  options: null,
  guidance: "",
  source: "builtin",
  usageCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("the built-in list", () => {
  it("has no duplicate codes", () => {
    // A duplicate code is two measurements that pool as one, silently.
    const codes = BUILT_IN_MEASUREMENTS.map((m) => m.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("has no two entries that reduce to the same name", () => {
    const names = BUILT_IN_MEASUREMENTS.map((m) => normaliseName(m.label));
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every number a unit, because a bare number means nothing", () => {
    for (const m of BUILT_IN_MEASUREMENTS) {
      if (m.type !== "number") continue;
      // Specific gravity is genuinely dimensionless; everything else needs one.
      if (m.code === "specificGravity") continue;
      expect(m.unit, m.code).not.toBe("");
    }
  });

  it("keeps yield in kilograms, so the app can do the conversion", () => {
    // Asking for t/ha makes somebody convert in a paddock, and nothing checks
    // that sum. kg or t is what unlocks the derived yield.
    const yields = BUILT_IN_MEASUREMENTS.filter((m) => m.code.toLowerCase().includes("yield"));
    expect(yields.length).toBeGreaterThan(0);
    for (const m of yields) expect(["kg", "t"]).toContain(m.unit);
  });

  it("bounds a percentage at 0 and 100", () => {
    for (const m of BUILT_IN_MEASUREMENTS.filter((m) => m.unit === "%")) {
      expect(m.min, m.code).toBe(0);
      expect(m.max, m.code).toBe(100);
    }
  });
});

describe("normaliseName", () => {
  it("treats the same name typed differently as one thing", () => {
    const forms = ["Marketable yield", "marketable yield", "  Marketable  Yield  ", "Marketable-yield"];
    expect(new Set(forms.map(normaliseName)).size).toBe(1);
  });

  it("keeps genuinely different names apart", () => {
    expect(normaliseName("Total yield")).not.toBe(normaliseName("Marketable yield"));
  });
});

describe("codeFor", () => {
  it("makes a machine name from a label", () => {
    expect(codeFor("Marketable yield", [])).toBe("marketableYield");
  });

  it("avoids one that is taken", () => {
    expect(codeFor("Marketable yield", ["marketableYield"])).toBe("marketableYield2");
  });

  it("does not start with a digit", () => {
    expect(codeFor("50g grade", [])).toMatch(/^[a-z]/i);
  });

  it("copes with a label that is all punctuation", () => {
    expect(codeFor("???", [])).toBe("measurement");
  });
});

describe("findExisting", () => {
  it("finds the entry that already means this", () => {
    const found = findExisting([entry()], "  marketable YIELD ");
    expect(found?.code).toBe("marketableYield");
  });

  it("returns null when nothing matches", () => {
    expect(findExisting([entry()], "Specific gravity")).toBeNull();
  });
});

describe("rankEntries", () => {
  it("puts what this programme actually uses first", () => {
    const ranked = rankEntries([
      entry({ entryId: "a", code: "a", label: "Rarely used", usageCount: 0 }),
      entry({ entryId: "b", code: "b", label: "Used a lot", usageCount: 12 }),
    ]);
    expect(ranked[0].label).toBe("Used a lot");
  });

  it("prefers a built-in over something somebody added, all else equal", () => {
    const ranked = rankEntries([
      entry({ entryId: "a", code: "a", label: "Added one", source: "added" }),
      entry({ entryId: "b", code: "b", label: "Zebra", source: "builtin" }),
    ]);
    // Alphabetically "Added one" wins; the built-in should still lead.
    expect(ranked[0].label).toBe("Zebra");
  });

  it("searches by label and by code", () => {
    const entries = [entry(), entry({ entryId: "b", code: "hollowHeart", label: "Hollow heart" })];
    expect(rankEntries(entries, "hollow")).toHaveLength(1);
    expect(rankEntries(entries, "marketableyield")).toHaveLength(1);
  });

  it("ignores punctuation and case when searching", () => {
    expect(rankEntries([entry()], "MARKETABLE-YIELD")).toHaveLength(1);
  });
});

describe("toFormField", () => {
  it("fills in the type, unit and bounds so nobody has to decide again", () => {
    const field = toFormField(entry(), 3, true);
    expect(field).toMatchObject({
      fieldName: "marketableYield",
      label: "Marketable yield",
      type: "number",
      unit: "kg",
      min: 0,
      required: true,
      displayOrder: 3,
    });
  });

  it("writes a blank unit as null, the way a form field expects", () => {
    expect(toFormField(entry({ unit: "" }), 0).unit).toBeNull();
  });

  it("carries a select's options across", () => {
    const field = toFormField(entry({ type: "select", options: ["a", "b"] }), 0);
    expect(field.options).toEqual(["a", "b"]);
  });
});

describe("fromFormField", () => {
  const typed: FormField = {
    fieldName: "somethingNew",
    label: "Stem count",
    type: "number",
    required: false,
    options: null,
    min: 0,
    max: null,
    unit: "count",
    displayOrder: 0,
  };

  it("offers a hand-typed measurement to the library", () => {
    const candidate = fromFormField(typed, []);
    expect(candidate).toMatchObject({ code: "stemCount", label: "Stem count", source: "added" });
  });

  it("does not add a second copy of something the library already has", () => {
    // Using an existing measurement must never quietly fork it — that is how
    // a library fills with near-duplicates and stops being worth having.
    expect(fromFormField({ ...typed, label: "marketable yield" }, [entry()])).toBeNull();
  });

  it("ignores a field with no label", () => {
    expect(fromFormField({ ...typed, label: "   " }, [])).toBeNull();
  });

  it("gives it a code that does not collide", () => {
    const candidate = fromFormField(typed, [entry({ code: "stemCount" })]);
    expect(candidate?.code).toBe("stemCount2");
  });
});

describe("libraryEntries", () => {
  it("shows the shipped list even with nothing stored", () => {
    // Built-ins are not rows. If they were, a pull would delete them the first
    // time a device synced — the same way the demo forms vanished before their
    // rows were added to seed.sql.
    expect(libraryEntries([])).toHaveLength(BUILT_IN_MEASUREMENTS.length);
  });

  it("keeps built-ins and added ones apart", () => {
    const merged = libraryEntries([entry({ entryId: "x", code: "stemCount", label: "Stem count", source: "added" })]);
    const added = merged.find((e) => e.label === "Stem count");
    expect(isBuiltIn(added as never)).toBe(false);
    expect(isBuiltIn(merged[0])).toBe(true);
  });

  it("lets somebody's own version win over a shipped one of the same name", () => {
    // Theirs carries their wording and their usage; two entries meaning the
    // same thing is the failure this library exists to prevent.
    const merged = libraryEntries([
      entry({ entryId: "mine", code: "myYield", label: "Marketable yield", source: "added", usageCount: 9 }),
    ]);
    const matches = merged.filter((e) => normaliseName(e.label) === normaliseName("Marketable yield"));
    expect(matches).toHaveLength(1);
    expect(matches[0].entryId).toBe("mine");
  });

  it("keeps the curated order rather than the alphabet", () => {
    const ranked = rankEntries(libraryEntries([]));
    // Yield leads because somebody decided it should, not because of a Y.
    expect(ranked[0].code).toBe("marketableYield");
    expect(ranked[ranked.length - 1].code).toBe("notes");
  });

  it("floats a well-used addition above the shipped list", () => {
    const ranked = rankEntries(
      libraryEntries([entry({ entryId: "x", code: "stemCount", label: "Stem count", source: "added", usageCount: 7 })]),
    );
    expect(ranked[0].label).toBe("Stem count");
  });
});
