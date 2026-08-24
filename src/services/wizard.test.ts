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

  it("keeps every question in the order they were arranged", () => {
    // The order on screen is the order in the paddock, so a catch-all left at
    // the bottom stays at the bottom.
    const fields = toParsedTrial(filled()).forms[0].fields;
    expect(fields.map((f) => f.label)).toEqual([
      "Harvested weight",
      "Photo",
      "Anything worth noting?",
    ]);
  });

  it("drops questions left blank rather than creating nameless fields", () => {
    const answers = filled({
      questions: [
        { label: "Tuber count", type: "number", unit: "count", required: true },
        { label: "   ", type: "text", unit: "", required: false },
      ],
    });
    const fields = toParsedTrial(answers).forms[0].fields;
    expect(fields.map((f) => f.label)).toEqual(["Tuber count"]);
  });

  it("carries a custom unit through, so the yield conversion can find it", () => {
    const answers = filled({
      questions: [{ label: "Plot harvest", type: "number", unit: "t", required: true }],
      responseIndex: 0,
    });
    expect(toParsedTrial(answers).forms[0].fields[0].unit).toBe("t");
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

// The response variable is asked for rather than assumed. A nitrogen trial
// might be comparing tuber count or specific gravity, and quietly picking the
// first weight would point the whole statistical summary at the wrong column.
describe("which number the trial is comparing", () => {
  const experiment = (over: Partial<WizardAnswers> = {}) =>
    filled({ kind: "experiment", replicates: 4, ...over });

  it("marks the chosen question, not the first number", () => {
    const answers = experiment({
      questions: [
        { label: "Harvested weight", type: "number", unit: "kg", required: true },
        { label: "Tuber count", type: "number", unit: "count", required: true },
      ],
      responseIndex: 1,
    });
    const fields = toParsedTrial(answers).forms[0].fields;
    expect(fields.find((f) => f.isResponse)?.label).toBe("Tuber count");
  });

  it("will not accept a photo or a note as the response", () => {
    // There is no mean of a photograph.
    const answers = experiment({
      questions: [{ label: "Photo", type: "photo", unit: "", required: false }],
      responseIndex: 0,
    });
    expect(wizardProblems(answers)).toContain("Choose which number the trial is comparing.");
  });

  it("does not ask a comparison for one at all", () => {
    // A grower comparing two practices has no response variable to nominate.
    const answers = filled({
      questions: [{ label: "Photo", type: "photo", unit: "", required: false }],
      responseIndex: null,
    });
    expect(wizardProblems(answers)).toEqual([]);
  });

  it("notices when the chosen question was removed", () => {
    const answers = experiment({ questions: [], responseIndex: 3 });
    expect(wizardProblems(answers)).toContain("Choose which number the trial is comparing.");
  });
});

// The wizard asks "how many blocks?" and then has to produce blocks. It did
// not: ParsedTrial carried no blocking, so a designed experiment came out
// completely randomised — the wizard's own words promising an arrangement the
// trial did not have, and nothing on screen contradicting it.
describe("the arrangement the wizard promised", () => {
  it("blocks a designed experiment", () => {
    const parsed = toParsedTrial(filled({ kind: "experiment", replicates: 3 }));
    expect(parsed.blocking).toBe("blocks");
  });

  it("leaves a comparison unblocked, since it was never asked", () => {
    expect(toParsedTrial(filled()).blocking).toBe("none");
  });
});
