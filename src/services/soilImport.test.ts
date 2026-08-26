import { describe, expect, it } from "vitest";
import { parseSoilCsv, soilTemplateCsv, SOIL_TEMPLATE_HEADERS } from "./soilImport";
import { attributeProblem, findAttribute } from "./soilAttributes";

const HEADER = SOIL_TEMPLATE_HEADERS.join(",");

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

// sample_point_id,sample_date,depth_from,depth_to,lat,lon,source,classification,
// system,attribute_code,attribute_name,value,text_value,unit,method_code,method_ref,note
const ph0to10 = "P1,2026-09-01,0,10,-34.74,142.19,lab,Red Chromosol,asc,ph_cacl2,,5.4,,pH,rayment_4b1,,";
const oc0to10 = "P1,2026-09-01,0,10,-34.74,142.19,lab,Red Chromosol,asc,organic_carbon,,0.9,,%,rayment_6b2,,";
const ph10to30 = "P1,2026-09-01,10,30,-34.74,142.19,lab,Red Chromosol,asc,ph_cacl2,,5.9,,pH,rayment_4b1,,";

describe("parseSoilCsv", () => {
  it("groups results into one sample per point, date and depth", () => {
    const result = parseSoilCsv(csv(ph0to10, oc0to10, ph10to30), "site-1");
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Two depth intervals, three results.
    expect(result.data.samples).toHaveLength(2);
    expect(result.data.results).toHaveLength(3);
    const shallow = result.data.samples.find((s) => s.depthFromCm === 0);
    expect(result.data.results.filter((r) => r.sampleId === shallow?.sampleId)).toHaveLength(2);
  });

  it("keeps the classification on the sample, not among the measurements", () => {
    const result = parseSoilCsv(csv(ph0to10), "site-1");
    if (!result.success) return;
    // An interpreted label and a measured number are different kinds of claim.
    expect(result.data.samples[0].soilClassification).toBe("Red Chromosol");
    expect(result.data.samples[0].classificationSystem).toBe("asc");
    expect(result.data.results.map((r) => r.attributeCode)).not.toContain("soil_classification");
  });

  it("carries the method, because it changes what the number means", () => {
    const result = parseSoilCsv(csv(ph0to10), "site-1");
    if (!result.success) return;
    expect(result.data.results[0].methodCode).toBe("rayment_4b1");
  });

  it("fills in the attribute's canonical unit when the file omits it", () => {
    const noUnit = "P1,2026-09-01,0,10,,,lab,,,ph_cacl2,,5.4,,,,,";
    const result = parseSoilCsv(csv(noUnit), "site-1");
    if (!result.success) return;
    expect(result.data.results[0].unit).toBe("pH");
  });

  it("refuses a result with no depth", () => {
    const noDepth = "P1,2026-09-01,,,,,lab,,,ph_cacl2,,5.4,,pH,,,";
    const result = parseSoilCsv(csv(noDepth), "site-1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/depth/i);
  });

  it("refuses an inverted depth interval", () => {
    const upsideDown = "P1,2026-09-01,30,10,,,lab,,,ph_cacl2,,5.4,,pH,,,";
    const result = parseSoilCsv(csv(upsideDown), "site-1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/must be below/i);
  });

  it("refuses a unit that disagrees with the attribute", () => {
    // pH in mg/kg is not a typo worth guessing at.
    const wrongUnit = "P1,2026-09-01,0,10,,,lab,,,ph_cacl2,,5.4,,mg/kg,,,";
    const result = parseSoilCsv(csv(wrongUnit), "site-1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/stored in pH/i);
  });

  it("catches a decimal in the wrong place", () => {
    const silly = "P1,2026-09-01,0,10,,,lab,,,ph_cacl2,,54,,pH,,,";
    const result = parseSoilCsv(csv(silly), "site-1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/above anything plausible/i);
  });

  it("refuses a date that is not ISO", () => {
    const auDate = "P1,01/09/2026,0,10,,,lab,,,ph_cacl2,,5.4,,pH,,,";
    const result = parseSoilCsv(csv(auDate), "site-1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/2026-09-01/);
  });

  it("refuses coordinates that are not on Earth", () => {
    const offWorld = "P1,2026-09-01,0,10,-340,142,lab,,,ph_cacl2,,5.4,,pH,,,";
    const result = parseSoilCsv(csv(offWorld), "site-1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/not on Earth/i);
  });

  it("refuses an unknown source rather than guessing", () => {
    const odd = "P1,2026-09-01,0,10,,,telepathy,,,ph_cacl2,,5.4,,pH,,,";
    const result = parseSoilCsv(csv(odd), "site-1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/soil_source must be one of/);
  });

  it("stores an attribute it does not know, and says which", () => {
    // Refusing outright would push people back to free text, which is the
    // thing the vocabulary exists to replace.
    const exotic = "P1,2026-09-01,0,10,,,lab,,,boron_hot_cacl2,Boron,0.8,,mg/kg,,,";
    const result = parseSoilCsv(csv(exotic), "site-1");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.uncontrolled).toEqual(["boron_hot_cacl2"]);
    expect(result.data.results[0].attributeName).toBe("Boron");
  });

  it("accepts a worded result", () => {
    const texture = "P1,2026-09-01,0,10,,,field,,,texture,,,sandy loam,,field_texture,,";
    const result = parseSoilCsv(csv(texture), "site-1");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.results[0].textValue).toBe("sandy loam");
    expect(result.data.results[0].value).toBeNull();
  });

  it("refuses a row with neither a value nor words", () => {
    const empty = "P1,2026-09-01,0,10,,,lab,,,ph_cacl2,,,,pH,,,";
    const result = parseSoilCsv(csv(empty), "site-1");
    expect(result.success).toBe(false);
  });

  it("names the missing columns rather than failing vaguely", () => {
    const result = parseSoilCsv("sample_point_id,value\nP1,5.4", "site-1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/sample_date.*depth_from_cm/);
  });

  it("skips blank lines", () => {
    const result = parseSoilCsv(csv(ph0to10, "", oc0to10), "site-1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.results).toHaveLength(2);
  });

  it("attaches every sample to the site it was imported for", () => {
    const result = parseSoilCsv(csv(ph0to10, ph10to30), "site-42");
    if (!result.success) return;
    expect(result.data.samples.every((s) => s.siteId === "site-42")).toBe(true);
  });
});

describe("the blank template", () => {
  it("parses as its own valid input", () => {
    // A template somebody downloads and fills in has to be one the importer
    // accepts unchanged, or the first thing they meet is an error.
    const result = parseSoilCsv(soilTemplateCsv(), "site-1");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.samples).toHaveLength(2);
    expect(result.data.uncontrolled).toHaveLength(0);
  });
});

describe("attributeProblem", () => {
  it("knows pH in water and pH in CaCl₂ are different attributes", () => {
    // They differ by roughly half a unit on the same sample, so a dataset
    // that treats them as one is wrong in a direction nobody can see.
    expect(findAttribute("ph_cacl2")?.code).not.toBe(findAttribute("ph_water")?.code);
  });

  it("passes a plausible value", () => {
    expect(attributeProblem("ph_cacl2", 5.4, "pH")).toBeNull();
  });

  it("has no opinion about an attribute it does not know", () => {
    expect(attributeProblem("boron_hot_cacl2", 999, "mg/kg")).toBeNull();
  });
});
