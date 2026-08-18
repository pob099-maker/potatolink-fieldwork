import { describe, expect, it } from "vitest";
import { fromRow, toRow } from "./supabase";

describe("toRow / fromRow", () => {
  it("round-trips camelCase records through snake_case rows", () => {
    const record = {
      eventId: "e1",
      siteId: "s1",
      syncStatus: "synced",
      createdAt: "2026-08-18T00:00:00.000Z",
    };
    expect(fromRow(toRow(record))).toEqual(record);
  });

  it("normalises Postgres timestamps to UTC Z form", () => {
    const record = fromRow({ created_at: "2026-08-18T04:56:54.123456+00:00" });
    expect(record.createdAt).toBe("2026-08-18T04:56:54.123Z");
  });

  it("leaves plain dates, gps strings, and nested json untouched", () => {
    const record = fromRow({
      value: "2026-08-18",
      photo_url: null,
      coordinates: { lat: -17.26, lng: 145.47 },
      fields: [{ fieldName: "tonnesHandled", displayOrder: 0 }],
    });
    expect(record.value).toBe("2026-08-18");
    expect(record.photoUrl).toBeNull();
    expect(record.coordinates).toEqual({ lat: -17.26, lng: 145.47 });
    expect((record.fields as Array<{ fieldName: string }>)[0].fieldName).toBe("tonnesHandled");
  });

  it("converts numbered suffixes correctly", () => {
    expect(fromRow({ sort_order: 2 })).toEqual({ sortOrder: 2 });
    expect(fromRow({ net_benefit: 171000 })).toEqual({ netBenefit: 171000 });
  });
});
