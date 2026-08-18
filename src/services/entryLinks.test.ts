import { describe, expect, it } from "vitest";
import { buildEntryPath, buildEntryUrl, summariseArm } from "./entryLinks";
import type { MeasurementEvent, Metric } from "../types";

const WALKERS = "site-walkers";
const TASSIE = "site-tassie";
const ARM = "arm-owned";

function event(eventId: string, siteId: string, armId: string): MeasurementEvent {
  return {
    eventId,
    trialId: "trial-1",
    siteId,
    armId,
    replicate: null,
    eventDate: "2026-08-18T00:00:00.000Z",
    eventType: "field_record",
    enteredBy: "grower",
    syncStatus: "synced",
    createdAt: "2026-08-18T00:00:00.000Z",
  };
}

function metric(eventId: string, metricName: string, value: number): Metric {
  return {
    metricId: `${eventId}-${metricName}`,
    eventId,
    metricName,
    value,
    unit: "",
    photoUrl: null,
    createdAt: "2026-08-18T00:00:00.000Z",
  };
}

describe("entry links", () => {
  it("always names both the site and the arm", () => {
    const path = buildEntryPath("trial-1", WALKERS, ARM);
    expect(path).toBe(`/trials/trial-1/entry?site=${WALKERS}&arm=${ARM}`);
  });

  it("puts the route after the hash so a shared link never 404s", () => {
    expect(buildEntryUrl("https://example.org", "/", "t", "s", "a")).toBe(
      "https://example.org/#/trials/t/entry?site=s&arm=a",
    );
    expect(
      buildEntryUrl("https://pob099-maker.github.io", "/potatolink-fieldwork/", "t", "s", "a"),
    ).toBe("https://pob099-maker.github.io/potatolink-fieldwork/#/trials/t/entry?site=s&arm=a");
  });

  it("keeps a single slash before the hash when the base lacks one", () => {
    expect(buildEntryUrl("https://example.org", "/app", "t", "s", "a")).toBe(
      "https://example.org/app/#/trials/t/entry?site=s&arm=a",
    );
  });
});

describe("summariseArm", () => {
  const events = [
    event("e1", WALKERS, ARM),
    event("e2", WALKERS, ARM),
    event("e3", TASSIE, ARM),
    event("e4", TASSIE, "arm-other"),
  ];
  const metrics = [
    metric("e1", "tonnesHandled", 40),
    metric("e1", "runDuration", 4),
    metric("e2", "tonnesHandled", 20),
    metric("e2", "runDuration", 1),
    metric("e3", "tonnesHandled", 30),
    metric("e3", "runDuration", 2),
    metric("e4", "tonnesHandled", 999),
  ];

  it("keeps each site's figures separate", () => {
    const walkers = summariseArm(events, metrics, ARM, WALKERS);
    expect(walkers.entryCount).toBe(2);
    expect(walkers.totalTonnes).toBe(60);
    expect(walkers.throughput).toBe(12); // 60 t over 5 hours

    const tassie = summariseArm(events, metrics, ARM, TASSIE);
    expect(tassie.entryCount).toBe(1);
    expect(tassie.totalTonnes).toBe(30);
    expect(tassie.throughput).toBe(15); // 30 t over 2 hours
  });

  it("combines sites when none is given, ignoring other arms", () => {
    const all = summariseArm(events, metrics, ARM);
    expect(all.entryCount).toBe(3);
    expect(all.totalTonnes).toBe(90);
    expect(all.throughput).toBeCloseTo(90 / 7, 5);
  });

  it("reports null throughput when hours are missing", () => {
    const partial = summariseArm([event("e5", WALKERS, ARM)], [metric("e5", "tonnesHandled", 10)], ARM);
    expect(partial.totalTonnes).toBe(10);
    expect(partial.throughput).toBeNull();
  });

  it("returns zeroes for a site with no entries", () => {
    const empty = summariseArm(events, metrics, ARM, "site-none");
    expect(empty.entryCount).toBe(0);
    expect(empty.throughput).toBeNull();
  });
});
