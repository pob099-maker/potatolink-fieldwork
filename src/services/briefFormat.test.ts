import { describe, expect, it } from "vitest";
import { parseTemplateCsv } from "./templateImport";
import { validateTemplate } from "./templateValidate";

// The format docs/example-trial-brief.md documents, still importing.
//
// That brief is handed to somebody — or something — with no access to this
// codebase, and every column name and rule in it was read out of the parser by
// hand. If the parser moves and the brief does not, the brief becomes a
// confident set of instructions for producing a file this app rejects, and
// whoever followed it finds out only at the import screen.
//
// So the example below is written to the letter of the brief. It is not
// testing the parser; it is testing that a document still describes it.
const csv = [
  "# fieldwork-template v1",
  "trial,Row Spacing & Variety — Mallee",
  "objective,Whether wider rows pay under limited water.",
  "design,replicated",
  "replicates,3",
  "site,Home Block,Murraylands SA,Sandy loam",
  "site,River Block,Murraylands SA,Calcareous",
  "practice,Current spacing,control,What the grower does now.",
  "practice,Wide spacing,alternative,Wider rows.",
  "practice,Narrow spacing,alternative,Narrower rows.",
  "form,event_type,audience,frequency,requires_site,requires_arm,label,field_name,type,required,unit,min,max,options,response,help",
  "Harvest,harvest,grower,Once per plot,yes,yes,Harvested weight,,number,yes,kg,0,,,yes,Weigh before grading",
  "Harvest,harvest,grower,Once per plot,yes,yes,Disease seen,,select,no,,,,none | early blight | scab,,What is showing",
  "Harvest,harvest,grower,Once per plot,yes,yes,Photo of the plot,,photo,no,,,,,,Visual evidence",
  "Harvest,harvest,grower,Once per plot,yes,yes,Lab result,,link,no,,,,,,Paste the whole address",
  "Emergence,emergence,grower,Once per plot,yes,yes,Plants counted,,number,yes,count,0,,,,Middle two rows only",
  "Site notes,site_notes,staff,Once per trial,yes,no,Soil report,,file,no,,,,,,PDF from the lab",
].join("\r\n");

describe("the brief's format", () => {
  it("parses", () => {
    const result = parseTemplateCsv(csv);
    if (!result.success) throw new Error(result.error);
    expect(result.success).toBe(true);
  });

  it("passes validation with no errors", () => {
    const result = parseTemplateCsv(csv);
    if (!result.success) throw new Error(result.error);
    const errors = validateTemplate(result.data).filter((i) => i.level === "error");
    expect(errors).toEqual([]);
  });

  it("keeps the comma and ampersand in the trial name", () => {
    const result = parseTemplateCsv(csv);
    if (!result.success) throw new Error(result.error);
    expect(result.data.name).toBe("Row Spacing & Variety — Mallee");
  });

  it("reads the help column the brief tells the agent to use", () => {
    const result = parseTemplateCsv(csv);
    if (!result.success) throw new Error(result.error);
    const harvest = result.data.forms.find((f) => f.eventType === "harvest");
    expect(harvest?.fields[0].guidance).toBe("Weigh before grading");
  });

  it("accepts link and file, which the brief lists as types", () => {
    const result = parseTemplateCsv(csv);
    if (!result.success) throw new Error(result.error);
    const types = result.data.forms.flatMap((f) => f.fields.map((x) => x.type));
    expect(types).toContain("link");
    expect(types).toContain("file");
  });

  it("builds three forms and three practices", () => {
    const result = parseTemplateCsv(csv);
    if (!result.success) throw new Error(result.error);
    expect(result.data.forms).toHaveLength(3);
    expect(result.data.practices).toHaveLength(3);
  });
});
