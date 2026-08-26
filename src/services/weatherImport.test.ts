import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBomObservations, parseBomTimestamp, summariseWindow } from "./weatherImport";
import type { WeatherObservation } from "../types";

// The fixture is a real slice of a live BOM product (Melbourne Olympic Park,
// IDV60901.95936), not a hand-written approximation. A parser tested against
// an idealised version of a feed is testing the author's memory of it.
const real = readFileSync(
  new URL("./__fixtures__/bom-observations.json", import.meta.url),
  "utf-8",
);

describe("parseBomTimestamp", () => {
  it("reads BOM's UTC stamp as a real instant", () => {
    expect(parseBomTimestamp("20260826110000")).toBe("2026-08-26T11:00:00.000Z");
  });

  it("rejects anything that is not fourteen digits", () => {
    expect(parseBomTimestamp("2026-08-26T11:00")).toBeNull();
    expect(parseBomTimestamp("")).toBeNull();
    expect(parseBomTimestamp("2026082611000")).toBeNull();
  });

  it("rejects a date that does not exist", () => {
    // Date.UTC would roll 31 February into March without complaint.
    expect(parseBomTimestamp("20260231110000")).toBeNull();
  });
});

describe("parseBomObservations", () => {
  it("reads a real feed", () => {
    const result = parseBomObservations(real);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.stationId).toBe("95936");
    expect(result.data.stationName).toMatch(/Melbourne/);
    expect(result.data.observations).toHaveLength(8);
  });

  it("keeps the station's position and the source system", () => {
    const result = parseBomObservations(real);
    if (!result.success) return;
    const first = result.data.observations[0];
    expect(first.sourceSystem).toBe("bom");
    expect(first.lat).toBeCloseTo(-37.8, 1);
    expect(first.observationTime).toBe("2026-08-26T11:00:00.000Z");
    expect(first.airTempC).toBe(12.1);
  });

  it("keeps the source row verbatim", () => {
    const result = parseBomObservations(real);
    if (!result.success) return;
    // Auditability: the number in the column has to be traceable to what
    // arrived, including the fields this app does not model.
    expect(result.data.observations[0].rawPayload).toMatchObject({ wmo: 95936 });
  });

  it("accepts an already-parsed object as well as text", () => {
    const asObject = parseBomObservations(JSON.parse(real));
    expect(asObject.success).toBe(true);
  });

  it("treats BOM's absent markers as absent, not zero", () => {
    // "-" and "" are how BOM says "no reading". Number("") is 0, which would
    // record a still, dry, 0 °C hour that never happened.
    const feed = {
      observations: {
        data: [
          {
            wmo: 1, name: "Nowhere", lat: -34, lon: 142,
            aifstime_utc: "20260826110000",
            air_temp: "-", rain_trace: "", rel_hum: null,
            wind_spd_kmh: "-", wind_dir: "-", dewpt: "-", press_msl: "-",
          },
        ],
      },
    };
    const result = parseBomObservations(feed);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const row = result.data.observations[0];
    expect(row.airTempC).toBeNull();
    expect(row.rainfallSince9amMm).toBeNull();
    expect(row.relativeHumidityPct).toBeNull();
    expect(row.windDir).toBeNull();
  });

  it("keeps a genuine zero", () => {
    const feed = {
      observations: {
        data: [{ wmo: 1, name: "X", aifstime_utc: "20260826110000", air_temp: 0, rain_trace: "0.0" }],
      },
    };
    const result = parseBomObservations(feed);
    if (!result.success) return;
    expect(result.data.observations[0].airTempC).toBe(0);
    expect(result.data.observations[0].rainfallSince9amMm).toBe(0);
  });

  it("drops a row with no usable timestamp and says so", () => {
    const feed = {
      observations: {
        data: [
          { wmo: 1, name: "X", aifstime_utc: "rubbish", air_temp: 10 },
          { wmo: 1, name: "X", aifstime_utc: "20260826110000", air_temp: 11 },
        ],
      },
    };
    const result = parseBomObservations(feed);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.observations).toHaveLength(1);
    expect(result.data.skipped).toHaveLength(1);
  });

  it("collapses an observation repeated across refreshes", () => {
    const one = { wmo: 1, name: "X", aifstime_utc: "20260826110000", air_temp: 10 };
    const result = parseBomObservations({ observations: { data: [one, { ...one }] } });
    if (!result.success) return;
    expect(result.data.observations).toHaveLength(1);
  });

  it("explains itself when handed the wrong thing", () => {
    expect(parseBomObservations("").success).toBe(false);
    expect(parseBomObservations("<html>").success).toBe(false);
    expect(parseBomObservations({ nope: true }).success).toBe(false);
    expect(parseBomObservations({ observations: { data: [] } }).success).toBe(false);
  });

  it("refuses a feed with no station number", () => {
    const result = parseBomObservations({
      observations: { data: [{ name: "X", aifstime_utc: "20260826110000" }] },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/station number/i);
  });
});

describe("summariseWindow", () => {
  const at = (iso: string, temp: number | null, rain: number | null): WeatherObservation =>
    ({
      observationId: iso,
      sourceSystem: "bom",
      stationId: "1",
      stationName: "X",
      lat: null,
      lon: null,
      observationTime: iso,
      airTempC: temp,
      rainfallSince9amMm: rain,
      relativeHumidityPct: null,
      windSpeedKmh: null,
      windDir: null,
      dewPointC: null,
      pressureMslHpa: null,
      rawPayload: null,
      createdAt: iso,
    }) as WeatherObservation;

  it("averages temperature over the window", () => {
    const window = summariseWindow(
      [at("2026-08-26T01:00:00.000Z", 10, null), at("2026-08-26T02:00:00.000Z", 20, null)],
      "2026-08-26T00:00:00.000Z",
      "2026-08-26T23:00:00.000Z",
    );
    expect(window.meanAirTempC).toBe(15);
    expect(window.minAirTempC).toBe(10);
    expect(window.maxAirTempC).toBe(20);
    expect(window.observations).toBe(2);
  });

  it("totals rainfall by taking each rain day's peak, not by adding readings", () => {
    // The trap this exists for. Three readings in one 9am-to-9am day, rising
    // to 6 mm: the day had 6 mm of rain, not 11.
    const window = summariseWindow(
      [
        at("2026-08-26T01:00:00.000Z", null, 2),
        at("2026-08-26T03:00:00.000Z", null, 3),
        at("2026-08-26T05:00:00.000Z", null, 6),
      ],
      "2026-08-26T00:00:00.000Z",
      "2026-08-26T23:00:00.000Z",
    );
    expect(window.rainfallMm).toBe(6);
  });

  it("adds separate rain days together", () => {
    // BOM's trace resets at 9am local, so the day boundary does too.
    const window = summariseWindow(
      [
        at("2026-08-26T02:00:00.000Z", null, 4),
        at("2026-08-27T02:00:00.000Z", null, 5),
      ],
      "2026-08-26T00:00:00.000Z",
      "2026-08-28T00:00:00.000Z",
    );
    expect(window.rainfallMm).toBe(9);
  });

  it("says nothing rather than zero when no rain was reported at all", () => {
    const window = summariseWindow(
      [at("2026-08-26T02:00:00.000Z", 10, null)],
      "2026-08-26T00:00:00.000Z",
      "2026-08-27T00:00:00.000Z",
    );
    expect(window.rainfallMm).toBeNull();
  });

  it("ignores observations outside the window", () => {
    const window = summariseWindow(
      [at("2026-08-01T02:00:00.000Z", 30, null), at("2026-08-26T02:00:00.000Z", 10, null)],
      "2026-08-26T00:00:00.000Z",
      "2026-08-27T00:00:00.000Z",
    );
    expect(window.observations).toBe(1);
    expect(window.meanAirTempC).toBe(10);
  });
});
