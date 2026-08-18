import { describe, expect, it } from "vitest";
import { parseTemplateCsv, readCsv, REFERENCE_TEMPLATE_CSV } from "./templateImport";
import { validateTemplate } from "./templateValidate";

const HEADER = "# fieldwork-template v1";
const FIELD_HEADER =
  "form,event_type,audience,frequency,requires_site,requires_arm,label,field_name,type,required,unit,min,max,options,response,help";

function csv(...lines: string[]): string {
  return [HEADER, "trial,Test Trial", FIELD_HEADER, ...lines].join("\n");
}

describe("readCsv", () => {
  it("handles quoted cells with commas and escaped quotes", () => {
    const rows = readCsv('a,"b, with comma","say ""hi"""\nc,d,e');
    expect(rows[0]).toEqual(["a", "b, with comma", 'say "hi"']);
    expect(rows[1]).toEqual(["c", "d", "e"]);
  });

  it("strips a BOM and skips blank lines", () => {
    const rows = readCsv("﻿a,b\n\n\nc,d\n");
    expect(rows).toHaveLength(2);
  });
});

describe("parseTemplateCsv", () => {
  it("rejects a file without the version marker", () => {
    const result = parseTemplateCsv("form,label,type\nRun,Yield,number");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("fieldwork-template v1");
  });

  it("parses forms, fields, and trial settings", () => {
    const result = parseTemplateCsv(
      [
        HEADER,
        "trial,N Trial",
        "objective,Test the format",
        "design,replicated",
        "replicates,3",
        FIELD_HEADER,
        "Plot record,plot,grower,Per plot,yes,yes,Plot yield,,number,yes,t/ha,0,,,yes,",
        "Plot record,plot,grower,Per plot,yes,yes,Notes,,text,no,,,,,,",
        "Cost log,cost_log,staff,Once,no,no,Lease cost,,number,yes,$,0,,,,",
      ].join("\n"),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.name).toBe("N Trial");
    expect(result.data.design).toBe("replicated");
    expect(result.data.replicates).toBe(3);
    expect(result.data.forms).toHaveLength(2);
    const plot = result.data.forms[0];
    expect(plot.audience).toBe("grower");
    expect(plot.fields[0].fieldName).toBe("plotYield"); // derived from label
    expect(plot.fields[0].isResponse).toBe(true);
    const cost = result.data.forms[1];
    expect(cost.requiresSite).toBe(false);
    expect(cost.requiresArm).toBe(false);
  });

  it("splits pipe-separated options", () => {
    const result = parseTemplateCsv(
      csv('Run,run,grower,,yes,yes,Main issue,,select,no,,,,"rot | greening | none",,'),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.forms[0].fields[0].options).toEqual(["rot", "greening", "none"]);
  });

  it("rejects an unknown field type with the row number", () => {
    const result = parseTemplateCsv(csv("Run,run,grower,,yes,yes,Yield,,numberz,yes,,,,,,"));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/row 4/i);
  });

  it("parses the shipped reference file shape", () => {
    // exercises defaults: blank field_name derivation, staff scoping
    const result = parseTemplateCsv(
      [
        HEADER,
        "trial,Reference",
        "objective,",
        "design,observational",
        "replicates,0",
        FIELD_HEADER,
        "Run record,run_record,grower,Each run,yes,yes,Tonnes handled,tonnesHandled,number,yes,t,0,,,,x",
        "Daily weather,weather,staff,Daily,yes,no,Temperature,,number,yes,°C,,,,,",
      ].join("\n"),
    );
    expect(result.success).toBe(true);
  });
});

describe("validateTemplate", () => {
  function parsed(text: string) {
    const result = parseTemplateCsv(text);
    if (!result.success) throw new Error(result.error);
    return result.data;
  }

  it("errors on a choice list without options", () => {
    const issues = validateTemplate(
      parsed(csv("Run,run,grower,,yes,yes,Main issue,,select,no,,,,,,")),
    );
    expect(issues.some((issue) => issue.level === "error" && /no options/.test(issue.message))).toBe(true);
  });

  it("errors on min greater than max", () => {
    const issues = validateTemplate(
      parsed(csv("Run,run,grower,,yes,yes,Rating,,slider,no,,5,1,,,")),
    );
    expect(issues.some((issue) => issue.level === "error" && /min 5 greater than max 1/.test(issue.message))).toBe(true);
  });

  it("errors when a replicated trial lacks a response variable", () => {
    const issues = validateTemplate(
      parsed(
        [
          HEADER,
          "trial,R Trial",
          "design,replicated",
          "replicates,3",
          FIELD_HEADER,
          "Run,run,grower,,yes,yes,Yield,,number,yes,t/ha,,,,,",
        ].join("\n"),
      ),
    );
    expect(issues.some((issue) => issue.level === "error" && /response variable/.test(issue.message))).toBe(true);
  });

  it("errors on duplicate event types across forms", () => {
    const issues = validateTemplate(
      parsed(
        csv(
          "Run A,shared,grower,,yes,yes,Yield,,number,yes,t,,,,,",
          "Run B,shared,staff,,yes,no,Cost,,number,yes,$,,,,,",
        ),
      ),
    );
    expect(issues.some((issue) => issue.level === "error" && /share the event type/.test(issue.message))).toBe(true);
  });

  it("warns rather than errors on a numeric field without a unit", () => {
    const issues = validateTemplate(
      parsed(csv("Run,run,grower,,yes,yes,Count,,number,no,,,,,,")),
    );
    const unitIssue = issues.find((issue) => /no unit/.test(issue.message));
    expect(unitIssue?.level).toBe("warning");
  });

  it("passes a clean grower form with no issues beyond expectations", () => {
    const issues = validateTemplate(
      parsed(csv("Run,run,grower,Each run,yes,yes,Tonnes handled,,number,yes,t,0,,,,")),
    );
    expect(issues.filter((issue) => issue.level === "error")).toHaveLength(0);
  });
});

describe("REFERENCE_TEMPLATE_CSV", () => {
  it("is a valid template that parses and passes every blocking check", () => {
    const result = parseTemplateCsv(REFERENCE_TEMPLATE_CSV);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.forms.length).toBeGreaterThan(1);
    const errors = validateTemplate(result.data).filter((issue) => issue.level === "error");
    expect(errors).toEqual([]);
  });

  it("demonstrates grower and staff forms with different scoping", () => {
    const result = parseTemplateCsv(REFERENCE_TEMPLATE_CSV);
    if (!result.success) return;
    const audiences = new Set(result.data.forms.map((form) => form.audience));
    expect(audiences.has("grower")).toBe(true);
    expect(audiences.has("staff")).toBe(true);
    const costLog = result.data.forms.find((form) => form.eventType === "cost_log");
    expect(costLog?.requiresSite).toBe(false);
  });
});
