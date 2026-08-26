// Reading a Bureau of Meteorology observation feed into typed rows.
//
// Parsing, not fetching. BOM's JSON products carry no CORS headers, so a
// browser cannot request one directly — and this app has no server to do it
// on the browser's behalf. What it can do is take the file: paste the JSON,
// or drop the downloaded product in, and the fields become columns.
//
// That distinction is the whole reason this is worth having. Storing the URL
// alone leaves the weather somewhere else, unqueryable, and gone the day the
// 72-hour window rolls past. Storing typed columns means a rainfall total for
// a growth stage is a query rather than an afternoon.
//
// Two things in BOM's format are traps, and both are handled here rather than
// left for whoever writes the first analysis:
//
//   rain_trace is cumulative since 9am local, and it is a string. Summing a
//   column of it multiplies a day's rain by the number of observations in the
//   day. It is stored as rainfallSince9amMm so the name says so.
//
//   Missing values arrive as "-" or null depending on the field, and "-"
//   parsed as a number is NaN, which then sorts, averages and plots as though
//   it meant something.

import { newId } from "../lib/id";
import type { Result, WeatherObservation } from "../types";

/** One row of BOM's `observations.data` array. Only the fields we keep. */
interface BomRow {
  wmo?: number | string;
  name?: string;
  lat?: number;
  lon?: number;
  aifstime_utc?: string;
  air_temp?: number | string | null;
  rain_trace?: string | number | null;
  rel_hum?: number | string | null;
  wind_spd_kmh?: number | string | null;
  wind_dir?: string | null;
  dewpt?: number | string | null;
  press_msl?: number | string | null;
  [key: string]: unknown;
}

/**
 * A number, or null when the source is saying "no reading".
 *
 * BOM writes an absent value as "-", an empty string, or null depending on
 * the field and the station. All three mean the same thing and none of them
 * is zero, which is what Number() would quietly turn "" into.
 */
function reading(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === "" || text === "-") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * BOM's `aifstime_utc` — "20260826110000" — as a real ISO instant.
 *
 * The field is UTC despite sitting beside a local one, so the offset is known
 * and recorded rather than assumed from wherever the browser happens to be.
 */
export function parseBomTimestamp(stamp: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(stamp.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Date.UTC(+year, +month - 1, +day, +hour, +minute, +second),
  );
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCMonth() !== +month - 1 || date.getUTCDate() !== +day) return null;
  return date.toISOString();
}

export interface ParsedWeather {
  stationId: string;
  stationName: string;
  observations: WeatherObservation[];
  /** Rows the feed held that could not be used, and why. */
  skipped: string[];
}

/**
 * Turn a BOM observation product into rows.
 *
 * Accepts the parsed object or the raw text, because the realistic input is a
 * paste and asking somebody to JSON.parse it first is asking them to do the
 * app's job.
 */
export function parseBomObservations(input: string | unknown): Result<ParsedWeather> {
  let payload: unknown = input;
  if (typeof input === "string") {
    const text = input.trim();
    if (!text) return { success: false, error: "Nothing to read — paste the feed first." };
    try {
      payload = JSON.parse(text);
    } catch {
      return {
        success: false,
        error: "That is not JSON. Use the .json observation product, not the web page.",
      };
    }
  }

  const observations = (payload as { observations?: { data?: unknown } })?.observations;
  if (!observations || !Array.isArray(observations.data)) {
    return {
      success: false,
      error: "No observations found. A BOM feed has an \"observations.data\" list.",
    };
  }

  const rows = observations.data as BomRow[];
  if (rows.length === 0) {
    return { success: false, error: "The feed has no observations in it." };
  }

  const first = rows[0];
  const stationId = String(first.wmo ?? "").trim();
  const stationName = String(first.name ?? "").trim();
  if (!stationId) {
    return { success: false, error: "The feed has no station number, so nothing can be linked to it." };
  }

  const skipped: string[] = [];
  const createdAt = new Date().toISOString();
  const seen = new Set<string>();
  const parsed: WeatherObservation[] = [];

  for (const row of rows) {
    const time = parseBomTimestamp(String(row.aifstime_utc ?? ""));
    if (!time) {
      skipped.push(`An observation had no readable UTC time (${String(row.aifstime_utc ?? "blank")}).`);
      continue;
    }
    // A feed can repeat an observation across refreshes; the station and the
    // instant identify it, so a re-import updates rather than duplicates.
    const key = `${stationId}:${time}`;
    if (seen.has(key)) continue;
    seen.add(key);

    parsed.push({
      observationId: newId(),
      sourceSystem: "bom",
      stationId,
      stationName: String(row.name ?? stationName).trim(),
      lat: reading(row.lat),
      lon: reading(row.lon),
      observationTime: time,
      airTempC: reading(row.air_temp),
      rainfallSince9amMm: reading(row.rain_trace),
      relativeHumidityPct: reading(row.rel_hum),
      windSpeedKmh: reading(row.wind_spd_kmh),
      windDir: row.wind_dir && String(row.wind_dir).trim() !== "-" ? String(row.wind_dir).trim() : null,
      dewPointC: reading(row.dewpt),
      pressureMslHpa: reading(row.press_msl),
      rawPayload: row as Record<string, unknown>,
      createdAt,
    });
  }

  if (parsed.length === 0) {
    return { success: false, error: "None of the observations had a usable timestamp." };
  }

  return { success: true, data: { stationId, stationName, observations: parsed, skipped } };
}

export interface WeatherWindow {
  from: string;
  to: string;
  observations: number;
  meanAirTempC: number | null;
  minAirTempC: number | null;
  maxAirTempC: number | null;
  /**
   * Rainfall over the window, in mm.
   *
   * Built by taking the highest since-9am reading within each local rain day
   * and adding those, which is the only sound way to get a total out of a
   * cumulative trace. Adding the readings themselves would count the same rain
   * once per observation.
   */
  rainfallMm: number | null;
}

/** Local rain-day key: BOM's rain trace resets at 9am, so the day does too. */
function rainDay(iso: string): string {
  const at = new Date(iso);
  const shifted = new Date(at.getTime() - 9 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/** Summarise a station's observations between two instants, inclusive. */
export function summariseWindow(
  observations: WeatherObservation[],
  from: string,
  to: string,
): WeatherWindow {
  const inside = observations.filter(
    (entry) => entry.observationTime >= from && entry.observationTime <= to,
  );
  const temps = inside
    .map((entry) => entry.airTempC)
    .filter((value): value is number => value !== null);

  const dayPeaks = new Map<string, number>();
  for (const entry of inside) {
    if (entry.rainfallSince9amMm === null) continue;
    const day = rainDay(entry.observationTime);
    dayPeaks.set(day, Math.max(dayPeaks.get(day) ?? 0, entry.rainfallSince9amMm));
  }
  const rainfall = dayPeaks.size === 0 ? null : [...dayPeaks.values()].reduce((sum, mm) => sum + mm, 0);

  return {
    from,
    to,
    observations: inside.length,
    meanAirTempC: temps.length ? temps.reduce((sum, value) => sum + value, 0) / temps.length : null,
    minAirTempC: temps.length ? Math.min(...temps) : null,
    maxAirTempC: temps.length ? Math.max(...temps) : null,
    rainfallMm: rainfall === null ? null : Math.round(rainfall * 10) / 10,
  };
}
