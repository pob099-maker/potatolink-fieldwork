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

const NEWLINE = String.fromCharCode(10);

describe("sites and practices from the CSV", () => {
  it("parses site and practice rows", () => {
    const result = parseTemplateCsv(
      [
        HEADER,
        "trial,Demosite Trial",
        "site,Gatton,Queensland,Alluvial loam",
        "site,Tolga,North Queensland,Red ferrosol",
        "practice,Current practice,control,What the grower does now.",
        "practice,New practice,alternative,The change being tested.",
        FIELD_HEADER,
        "Run,run,grower,,yes,yes,Tonnes handled,,number,yes,t,0,,,,",
      ].join(NEWLINE),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.sites).toHaveLength(2);
    expect(result.data.sites[0]).toEqual({
      location: "Gatton",
      region: "Queensland",
      soilType: "Alluvial loam",
    });
    expect(result.data.practices.filter((p) => p.type === "control")).toHaveLength(1);
  });

  it("rejects a practice with an unknown type", () => {
    const result = parseTemplateCsv(
      [HEADER, "trial,T", "practice,Odd,sideways,", FIELD_HEADER,
       "Run,run,grower,,yes,yes,Yield,,number,yes,t,,,,,"].join(NEWLINE),
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/control.*alternative/i);
  });

  it("errors on two controls and warns when only one practice is given", () => {
    const two = parseTemplateCsv(
      [HEADER, "trial,T", "practice,A,control,", "practice,B,control,", FIELD_HEADER,
       "Run,run,grower,,yes,yes,Yield,,number,yes,t,,,,,"].join(NEWLINE),
    );
    if (!two.success) throw new Error(two.error);
    const issues = validateTemplate(two.data);
    expect(issues.some((i) => i.level === "error" && /marked as the control/.test(i.message))).toBe(true);

    const one = parseTemplateCsv(
      [HEADER, "trial,T", "practice,A,control,", FIELD_HEADER,
       "Run,run,grower,,yes,yes,Yield,,number,yes,t,,,,,"].join(NEWLINE),
    );
    if (!one.success) throw new Error(one.error);
    expect(validateTemplate(one.data).some((i) => i.level === "warning" && /Only one practice/.test(i.message))).toBe(true);
  });

  it("warns when the file defines no sites", () => {
    const result = parseTemplateCsv(csv("Run,run,grower,,yes,yes,Yield,,number,yes,t,,,,,"));
    if (!result.success) throw new Error(result.error);
    expect(validateTemplate(result.data).some((i) => /No sites in the file/.test(i.message))).toBe(true);
  });

  it("ships a reference template that already includes sites and practices", () => {
    const result = parseTemplateCsv(REFERENCE_TEMPLATE_CSV);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.sites.length).toBeGreaterThan(0);
    expect(result.data.practices.some((p) => p.type === "control")).toBe(true);
    expect(validateTemplate(result.data).filter((i) => i.level === "error")).toEqual([]);
  });
});

describe("the help column", () => {
  // It has been in the template this app offers for download since v1 and the
  // parser never read it, so anybody who followed the format and filled it in
  // lost their text without being told.
  it("is read into the field rather than discarded", () => {
    const csv = [
      "# fieldwork-template v1",
      "trial,Help Trial",
      "site,Home,SA,loam",
      "practice,Current,control,now",
      "practice,New,alternative,tried",
      "form,event_type,audience,frequency,requires_site,requires_arm,label,field_name,type,required,unit,min,max,options,response,help",
      "Harvest,harvest,grower,Once,yes,yes,Weight,weight,number,yes,kg,,,,yes,Weigh before grading",
    ].join("\n");
    const result = parseTemplateCsv(csv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.forms[0].fields[0].guidance).toBe("Weigh before grading");
    }
  });

  it("leaves it blank when the column is absent altogether", () => {
    const csv = [
      "# fieldwork-template v1",
      "trial,No Help",
      "site,Home,SA,loam",
      "practice,Current,control,now",
      "practice,New,alternative,tried",
      "form,event_type,audience,frequency,requires_site,requires_arm,label,field_name,type,required",
      "Harvest,harvest,grower,Once,yes,yes,Weight,weight,number,yes",
    ].join("\n");
    const result = parseTemplateCsv(csv);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.forms[0].fields[0].guidance).toBe("");
  });
});

describe("groups_by", () => {
  const withGroup = (value: string) =>
    [
      HEADER,
      "trial,Test Trial",
      `${FIELD_HEADER},sensitive,groups_by`,
      `Run,run,grower,Each run,yes,yes,Weight,,number,yes,kg,,,,,,,${value}`,
    ].join("\n");

  it("carries the word off the file", () => {
    const result = parseTemplateCsv(withGroup("run"));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.forms[0].groupsBy).toBe("run");
  });

  it("leaves a form ungrouped when the column is blank", () => {
    const result = parseTemplateCsv(withGroup(""));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.forms[0].groupsBy ?? "").toBe("");
  });

  // Both new columns were appended rather than inserted, so a file written
  // against the older header still parses. Columns are looked up by name.
  it("still parses a file written before the column existed", () => {
    const result = parseTemplateCsv(
      csv("Run,run,grower,Each run,yes,yes,Weight,,number,yes,kg,,,,,"),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.forms[0].groupsBy ?? "").toBe("");
  });
});

describe("a number the app works out", () => {
  const withFormula = (formula: string) =>
    [
      HEADER,
      "trial,Test Trial",
      `${FIELD_HEADER},sensitive,groups_by,formula`,
      "Grade,grade,staff,Each run,yes,yes,Clods in,clodsIn,number,yes,count,,,,,,,,",
      "Grade,grade,staff,Each run,yes,yes,Clods out,clodsOut,number,yes,count,,,,,,,,",
      `Grade,grade,staff,Each run,yes,yes,Separation,separation,number,no,%,,,,,,,,${formula}`,
    ].join(NEWLINE);

  it("carries the sum off the file", () => {
    const result = parseTemplateCsv(withFormula("(clodsIn - clodsOut) / clodsIn * 100"));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.forms[0].fields[2].formula).toBe("(clodsIn - clodsOut) / clodsIn * 100");
    }
  });

  // A sum naming a field that is not there would import cleanly and then show
  // a dash forever, with nothing on screen to say why.
  it("refuses a sum that names a question the form does not have", () => {
    const result = parseTemplateCsv(withFormula("clodsIn / clodsGone"));
    expect(result.success).toBe(true);
    if (!result.success) return;
    const issues = validateTemplate(result.data);
    const errors = issues.filter((issue) => issue.level === "error");
    expect(errors.some((issue) => issue.message.includes("clodsGone"))).toBe(true);
  });

  it("accepts a sum whose names are all on the form", () => {
    const result = parseTemplateCsv(withFormula("(clodsIn - clodsOut) / clodsIn * 100"));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(validateTemplate(result.data).filter((issue) => issue.level === "error")).toEqual([]);
  });

  it("says which row a broken sum is on", () => {
    const result = parseTemplateCsv(withFormula("(clodsIn - clodsOut"));
    expect(result.success).toBe(true);
    if (!result.success) return;
    const broken = validateTemplate(result.data).find((issue) => issue.level === "error");
    expect(broken?.row).toBeGreaterThan(0);
  });
});
