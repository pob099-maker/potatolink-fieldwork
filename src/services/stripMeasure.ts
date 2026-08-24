// Measuring a strip by walking it.
//
// The scale decides whether this is worth doing. Four corners of a small
// research plot are hopeless: a plot two metres by ten is twenty square
// metres, a phone fixes a corner to within several metres, and the error
// swamps the thing being measured. That is why the trial's plot size is typed.
//
// A strip is the other case. Take a header twelve metres wide down an eight
// hundred metre run: the width is not measured at all — it is the machine's,
// and known exactly — and the only thing GPS has to supply is the length,
// where five metres of error on eight hundred is well under a percent. So this
// measures one distance and multiplies by a width somebody already knows,
// rather than trying to trace a shape.
//
// The accuracy the device reports is carried through rather than discarded,
// because a fix taken under a tree line or in a shed is worth knowing about
// before the number reaches a spreadsheet.

const EARTH_RADIUS_M = 6_371_008.8;
const SQUARE_METRES_PER_HECTARE = 10_000;

export interface Fix {
  lat: number;
  lng: number;
  /** Metres of uncertainty the device claims for this fix. */
  accuracyM: number;
}

export interface StripMeasurement {
  lengthM: number;
  widthM: number;
  areaM2: number;
  areaHa: number;
  /**
   * Worst-case error in the area, as a percentage, from the two fixes alone.
   * The width contributes nothing — it was not measured.
   */
  errorPercent: number;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in metres. Haversine rather than a flat approximation:
 * the difference is small over a paddock, but the formula is no harder and
 * does not quietly degrade with latitude.
 */
export function distanceMetres(from: Fix, to: Fix): number {
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * A strip's area from its two ends and the working width.
 *
 * Null when the numbers cannot describe a strip — a width of nothing, or two
 * fixes so close together that the reading is noise rather than a run. Ten
 * metres is the cutoff: below it the device's own uncertainty is a large
 * fraction of the length, and an area computed from that is a guess wearing a
 * decimal point.
 */
export function stripArea(start: Fix, end: Fix, widthM: number): StripMeasurement | null {
  if (!Number.isFinite(widthM) || widthM <= 0) return null;
  const lengthM = distanceMetres(start, end);
  if (!Number.isFinite(lengthM) || lengthM < 10) return null;

  const areaM2 = lengthM * widthM;
  // Both fixes can be wrong in the direction that lengthens or shortens the
  // run, so their uncertainties add.
  const lengthError = start.accuracyM + end.accuracyM;
  return {
    lengthM,
    widthM,
    areaM2,
    areaHa: areaM2 / SQUARE_METRES_PER_HECTARE,
    errorPercent: (lengthError / lengthM) * 100,
  };
}

/**
 * Whether a measurement is worth trusting, and what to say if it is not.
 *
 * The thresholds are judgement, not standards: a couple of percent is better
 * than most yield data deserves, ten percent is still useful for a strip
 * comparison, and beyond that the number is doing more harm than an honest
 * blank would.
 */
export function accuracyNote(measurement: StripMeasurement): {
  level: "good" | "fair" | "poor";
  message: string;
} {
  const rounded = measurement.errorPercent.toFixed(1);
  if (measurement.errorPercent <= 2) {
    return { level: "good", message: `±${rounded}% on the length — good enough to use.` };
  }
  if (measurement.errorPercent <= 10) {
    return {
      level: "fair",
      message: `±${rounded}% on the length. Usable, but a longer run or a clearer sky would tighten it.`,
    };
  }
  return {
    level: "poor",
    message: `±${rounded}% on the length — too rough to rely on. Try again away from trees or sheds, or type the area instead.`,
  };
}
