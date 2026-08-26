// Controlled vocabulary for soil, and the reason there is one.
//
// A soil result is only comparable with another soil result if three things
// agree: what was measured, in what unit, and by what method. "pH 5.4" is not
// one number — pH in water and pH in calcium chloride differ by roughly half a
// unit on the same sample, and a dataset that mixes them without saying so is
// quietly wrong in a direction nobody can see.
//
// So an attribute carries its code, its canonical unit and the methods it is
// normally produced by, and the importer checks the unit rather than accepting
// whatever a spreadsheet column happened to say.
//
// This list is a starting vocabulary, not a closed one. Anything not in it can
// still be stored — it is recorded as an uncontrolled code and flagged as such,
// because refusing a lab's result outright would just push people back to
// free text, which is the thing this exists to replace.

export interface SoilAttribute {
  code: string;
  name: string;
  /** The unit this attribute is stored in. Values in other units are rejected. */
  unit: string;
  /** Results that are words rather than numbers — a texture grade, a colour. */
  textual?: boolean;
  /** Sane bounds, for catching a decimal in the wrong place. */
  min?: number;
  max?: number;
}

/**
 * The attributes a potato trial actually asks about, with the ones that get
 * confused for each other kept deliberately distinct.
 */
export const SOIL_ATTRIBUTES: SoilAttribute[] = [
  { code: "ph_cacl2", name: "pH (CaCl₂)", unit: "pH", min: 2, max: 11 },
  { code: "ph_water", name: "pH (water)", unit: "pH", min: 2, max: 11 },
  { code: "ec_1_5", name: "Electrical conductivity (1:5)", unit: "dS/m", min: 0, max: 20 },
  { code: "organic_carbon", name: "Organic carbon", unit: "%", min: 0, max: 30 },
  { code: "total_nitrogen", name: "Total nitrogen", unit: "%", min: 0, max: 5 },
  { code: "nitrate_n", name: "Nitrate nitrogen", unit: "mg/kg", min: 0, max: 1000 },
  { code: "colwell_p", name: "Phosphorus (Colwell)", unit: "mg/kg", min: 0, max: 1000 },
  { code: "colwell_k", name: "Potassium (Colwell)", unit: "mg/kg", min: 0, max: 2000 },
  { code: "sulfur_kcl40", name: "Sulfur (KCl-40)", unit: "mg/kg", min: 0, max: 500 },
  { code: "cec", name: "Cation exchange capacity", unit: "cmol(+)/kg", min: 0, max: 100 },
  { code: "clay_pct", name: "Clay", unit: "%", min: 0, max: 100 },
  { code: "silt_pct", name: "Silt", unit: "%", min: 0, max: 100 },
  { code: "sand_pct", name: "Sand", unit: "%", min: 0, max: 100 },
  { code: "bulk_density", name: "Bulk density", unit: "g/cm³", min: 0.5, max: 2.5 },
  { code: "available_water", name: "Available water capacity", unit: "mm/m", min: 0, max: 400 },
  { code: "texture", name: "Texture grade", unit: "", textual: true },
  { code: "colour", name: "Colour", unit: "", textual: true },
];

/** How a number was produced. Stored because it changes what the number means. */
export const SOIL_METHODS: Array<{ code: string; name: string }> = [
  { code: "rayment_4b1", name: "Rayment & Lyons 4B1 — pH in CaCl₂" },
  { code: "rayment_4a1", name: "Rayment & Lyons 4A1 — pH in water" },
  { code: "rayment_3a1", name: "Rayment & Lyons 3A1 — EC 1:5" },
  { code: "rayment_6b2", name: "Rayment & Lyons 6B2 — organic carbon" },
  { code: "rayment_9b2", name: "Rayment & Lyons 9B2 — Colwell P" },
  { code: "rayment_7a1", name: "Rayment & Lyons 7A1 — nitrate N" },
  { code: "field_texture", name: "Field texture, hand assessment" },
  { code: "unspecified", name: "Not stated" },
];

/** Which system a soil label belongs to, so two labels can be told apart. */
export const CLASSIFICATION_SYSTEMS: Array<{ code: string; name: string }> = [
  { code: "asc", name: "Australian Soil Classification" },
  { code: "great_soil_group", name: "Great Soil Group" },
  { code: "local", name: "Local or grower term" },
  { code: "unspecified", name: "Not stated" },
];

export const SOIL_SOURCES: Array<{ code: string; name: string }> = [
  { code: "ansis", name: "ANSIS" },
  { code: "lab", name: "Laboratory report" },
  { code: "field", name: "Field assessment" },
  { code: "grower", name: "Grower supplied" },
];

export const findAttribute = (code: string): SoilAttribute | null =>
  SOIL_ATTRIBUTES.find((attribute) => attribute.code === code.trim().toLowerCase()) ?? null;

/**
 * Whether a value is plausible for its attribute.
 *
 * Deliberately loose. The job is catching a misplaced decimal or a percentage
 * entered as a fraction, not second-guessing a laboratory — so the bounds are
 * wide enough that a real result never trips them.
 */
export function attributeProblem(
  code: string,
  value: number | null,
  unit: string,
): string | null {
  const attribute = findAttribute(code);
  if (!attribute) return null; // Uncontrolled codes are allowed; see the header.

  if (attribute.textual) {
    return value === null ? null : `${attribute.name} is recorded as words, not a number.`;
  }
  if (value === null) return `${attribute.name} needs a number.`;

  const given = unit.trim();
  if (given && given.toLowerCase() !== attribute.unit.toLowerCase()) {
    return `${attribute.name} is stored in ${attribute.unit}, but this says ${given}.`;
  }
  if (attribute.min !== undefined && value < attribute.min) {
    return `${value} is below anything plausible for ${attribute.name}.`;
  }
  if (attribute.max !== undefined && value > attribute.max) {
    return `${value} is above anything plausible for ${attribute.name}.`;
  }
  return null;
}

/** The depth interval in words, for a table somebody reads. */
export const describeDepth = (from: number, to: number): string => `${from}–${to} cm`;

/**
 * Sort key for a profile: shallowest first, which is how a soil profile is
 * read and written everywhere else.
 */
export const byDepth = (
  a: { depthFromCm: number },
  b: { depthFromCm: number },
): number => a.depthFromCm - b.depthFromCm;
