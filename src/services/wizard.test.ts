import { describe, expect, it } from "vitest";
import { emptyAnswers, toParsedTrial, wizardProblems, type WizardAnswers } from "./wizard";
import { validateTemplate } from "./templateValidate";

const filled = (over: Partial<WizardAnswers> = {}): WizardAnswers => ({
  ...emptyAnswers(),
  name: "Wide vs narrow spacing",
  objective: "See whether wider rows pay.",
  control: "Current spacing",
  alternatives: ["Wide spacing"],
  siteName: "Home paddock",
  siteRegion: "Murraylands SA",
  ...over,
});

describe("what is still missing", () => {
  it("says so in the language of the question, not the field", () => {
    const problems = wizardProblems(emptyAnswers());
    expect(problems).toContain("The trial needs a name.");
    expect(problems).toContain("Name what is being done now.");
    expect(problems).toContain("The trial needs somewhere to run.");
  });

  it("is happy once the essentials are answered", () => {
    expect(wizardProblems(filled())).toEqual([]);
  });

  it("only asks a replicated trial about blocks", () => {
    // A grower comparing two practices should never meet the word.
    expect(wizardProblems(filled({ replicates: 0 }))).toEqual([]);
    expect(wizardProblems(filled({ kind: "experiment", replicates: 1 }))).toContain(
      "A replicated trial needs at least two blocks.",
    );
  });

  it("ignores blank alternatives left in the list", () => {
    expect(wizardProblems(filled({ alternatives: ["Wide spacing", "", "  "] }))).toEqual([]);
    expect(wizardProblems(filled({ alternatives: ["", "  "] }))).toContain(
      "Name at least one thing to compare it against.",
    );
  });
});

describe("the trial it builds", () => {
  it("produces a control plus every alternative named", () => {
    const parsed = toParsedTrial(filled({ alternatives: ["Wide", "Extra wide", ""] }));
    expect(parsed.practices.map((p) => `${p.type}:${p.name}`)).toEqual([
      "control:Current spacing",
      "alternative:Wide",
      "alternative:Extra wide",
    ]);
  });

  it("makes a comparison observational and an experiment replicated", () => {
    expect(toParsedTrial(filled()).design).toBe("observational");
    expect(toParsedTrial(filled()).replicates).toBe(0);
    const experiment = toParsedTrial(filled({ kind: "experiment", replicates: 4 }));
    expect(experiment.design).toBe("replicated");
    expect(experiment.replicates).toBe(4);
  });

  it("asks for a weight rather than a rate, and marks it the response", () => {
    // A weight is what somebody can measure; the app does the conversion once
    // a plot size exists. Asking for t/ha puts arithmetic in the paddock.
    const yieldField = toParsedTrial(filled()).forms[0].fields.find(
      (f) => f.label === "Harvested weight",
    );
    expect(yieldField?.unit).toBe("kg");
    expect(yieldField?.isResponse).toBe(true);
  });

  it("keeps the catch-all question last", () => {
    // A free-text box above a specific question gets used instead of it.
    const fields = toParsedTrial(filled({ observations: ["notes", "yield", "photo"] })).forms[0].fields;
    expect(fields[fields.length - 1].label).toBe("Anything worth noting?");
  });

  it("never builds a form with nothing on it", () => {
    // A trial you cannot record against is not a trial.
    const fields = toParsedTrial(filled({ observations: [] })).forms[0].fields;
    expect(fields.length).toBeGreaterThan(0);
    expect(fields[0].required).toBe(true);
  });

  it("invents the machine name so nobody is asked for one", () => {
    const fields = toParsedTrial(filled()).forms[0].fields;
    expect(fields.map((f) => f.fieldName)).toContain("harvestedWeight");
    expect(fields.every((f) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(f.fieldName))).toBe(true);
  });
});

describe("meeting the importer's validator", () => {
  it("passes the same checks a CSV has to pass", () => {
    // The point of building a ParsedTrial rather than CSV text: one validator,
    // one publish path, whichever route somebody came in by.
    for (const answers of [filled(), filled({ kind: "experiment", replicates: 4 })]) {
      const errors = validateTemplate(toParsedTrial(answers)).filter((i) => i.level === "error");
      expect(errors).toEqual([]);
    }
  });
});
