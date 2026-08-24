import { describe, expect, it } from "vitest";
import { dataSourceSchema, trialSchema } from "../schemas";

const base = {
  trialId: "5f0a6c1e-0002-4000-8000-000000000001",
  projectId: "5f0a6c1e-0001-4000-8000-000000000001",
  name: "T",
  objective: "",
  status: "draft" as const,
  design: "observational" as const,
  replicates: 0,
  blocking: "none" as const,
  layoutSeed: null,
  vocabulary: null,
  plotLengthM: null,
  plotWidthM: null,
  responseMetric: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("a recorded data source", () => {
  it("keeps what is needed to find the thing again", () => {
    const parsed = dataSourceSchema.safeParse({
      label: "Soil moisture probe, north end",
      kind: "sensorthings",
      reference: "https://example.org/v1.1/Datastreams(3)",
      siteId: null,
      note: "Reports every 15 minutes",
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses one with nothing to find", () => {
    // A label with no reference is a note, not a source.
    expect(dataSourceSchema.safeParse({ label: "Probe", kind: "sensorthings", reference: "" }).success)
      .toBe(false);
    expect(dataSourceSchema.safeParse({ label: "", kind: "sensorthings", reference: "https://x" }).success)
      .toBe(false);
  });

  it("only accepts kinds the app knows how to describe", () => {
    expect(dataSourceSchema.safeParse({ label: "x", kind: "telepathy", reference: "y" }).success)
      .toBe(false);
    for (const kind of ["sensorthings", "isoxml", "weather", "document", "other"]) {
      expect(dataSourceSchema.safeParse({ label: "x", kind, reference: "y" }).success).toBe(true);
    }
  });

  it("belongs to the trial when no site is named", () => {
    const parsed = dataSourceSchema.parse({ label: "Protocol", kind: "document", reference: "S:/x" });
    expect(parsed.siteId).toBeNull();
    expect(parsed.note).toBe("");
  });
});

describe("a trial that predates the column", () => {
  it("reads back with no sources rather than failing", () => {
    // Every trial in the cloud was written before this existed, and a pull
    // that rejected them would empty the app on the next refresh.
    const parsed = trialSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.dataSources).toEqual([]);
  });

  it("survives an explicit null from Postgres", () => {
    const parsed = trialSchema.safeParse({ ...base, dataSources: null });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.dataSources).toEqual([]);
  });
});
