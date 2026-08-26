import { describe, expect, it } from "vitest";
import { keepColumnsTheCloudLacks } from "./store";

// The scenario this exists for: observation timing shipped in the app before
// migration 0019 reached the Supabase project. The cloud sends a site row with
// no planting_date column at all, the schema's default turns that into null,
// and without this guard the pull writes the null over a real planting date —
// losing data because the *server* is behind, which is not the user's doing
// and not something they could see happening.

describe("keepColumnsTheCloudLacks", () => {
  it("keeps a local value when the cloud has no such column", () => {
    const merged = keepColumnsTheCloudLacks(
      { siteId: "s1", location: "Mallee", plantingDate: null },
      { siteId: "s1", location: "Mallee" },
      { siteId: "s1", location: "Mallee", plantingDate: "2026-09-01" },
    );
    expect(merged.plantingDate).toBe("2026-09-01");
  });

  it("accepts a null the cloud actually sent", () => {
    // Column exists and holds null: somebody cleared it, and that must stick.
    const merged = keepColumnsTheCloudLacks(
      { siteId: "s1", plantingDate: null },
      { siteId: "s1", plantingDate: null },
      { siteId: "s1", plantingDate: "2026-09-01" },
    );
    expect(merged.plantingDate).toBeNull();
  });

  it("leaves a brand-new record alone", () => {
    const parsed = { siteId: "s2", plantingDate: null };
    expect(keepColumnsTheCloudLacks(parsed, { siteId: "s2" }, undefined)).toBe(parsed);
  });

  it("does not invent a value the device never had", () => {
    const merged = keepColumnsTheCloudLacks(
      { siteId: "s1", plantingDate: null },
      { siteId: "s1" },
      { siteId: "s1" },
    );
    expect(merged.plantingDate).toBeNull();
  });

  it("returns the original object when nothing needs rescuing", () => {
    const parsed = { siteId: "s1", location: "Mallee" };
    const result = keepColumnsTheCloudLacks(
      parsed,
      { siteId: "s1", location: "Mallee" },
      { siteId: "s1", location: "Old name" },
    );
    // Identity, not just equality: the common path must not copy every row.
    expect(result).toBe(parsed);
  });

  it("does not resurrect a value the cloud overwrote", () => {
    const merged = keepColumnsTheCloudLacks(
      { siteId: "s1", location: "Renamed" },
      { siteId: "s1", location: "Renamed" },
      { siteId: "s1", location: "Old name" },
    );
    expect(merged.location).toBe("Renamed");
  });

  it("rescues several missing columns at once", () => {
    const merged = keepColumnsTheCloudLacks(
      { siteId: "s1", plantingDate: null, stageDates: {} },
      { siteId: "s1" },
      { siteId: "s1", plantingDate: "2026-09-01", stageDates: { emergence: "2026-09-25" } },
    );
    expect(merged.plantingDate).toBe("2026-09-01");
    expect(merged.stageDates).toEqual({ emergence: "2026-09-25" });
  });
});
