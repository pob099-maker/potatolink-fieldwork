import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { publishParsedTrial } from "./templatePublish";
import { listTemplates, listTrials } from "./store";
import { emptyAnswers, toParsedTrial, type WizardAnswers } from "./wizard";

// The boundary the wizard tests do not reach.
//
// Those assert on toParsedTrial and stop there, which is one step short of the
// database. A field can survive every one of them and still be dropped on the
// way to a FormTemplate — which is exactly what happened to the designer's
// note, and it took building a trial in a browser to notice. This file exists
// so the next thing carried through the wizard has somewhere to fail loudly.

const filled = (over: Partial<WizardAnswers> = {}): WizardAnswers => ({
  ...emptyAnswers(),
  name: `Publish check ${Math.random().toString(36).slice(2, 8)}`,
  objective: "See whether it pays.",
  control: "Current practice",
  alternatives: ["The other way"],
  siteName: "Home paddock",
  siteRegion: "Murraylands SA",
  ...over,
});

async function publish(answers: WizardAnswers) {
  const parsed = toParsedTrial(answers);
  const result = await publishParsedTrial(parsed);
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.error);
  // Returns the Trial, not its id.
  const templates = (await listTemplates()).filter(
    (template) => template.trialId === result.data.trialId,
  );
  return templates[0];
}

describe("what survives being published", () => {
  it("keeps the note written for whoever records it", async () => {
    const template = await publish(
      filled({
        questions: [
          {
            label: "Harvested weight",
            type: "number",
            unit: "kg",
            required: true,
            guidance: "Weigh the whole plot before grading.",
          },
        ],
      }),
    );
    expect(template.fields[0].guidance).toBe("Weigh the whole plot before grading.");
  });

  it("keeps the choices on a list", async () => {
    const template = await publish(
      filled({
        questions: [
          {
            label: "Disease seen",
            type: "select",
            unit: "",
            required: true,
            options: ["None", "Scab"],
          },
        ],
      }),
    );
    expect(template.fields[0].options).toEqual(["None", "Scab"]);
  });

  it("keeps the unit that unlocks the yield conversion", async () => {
    const template = await publish(
      filled({
        questions: [{ label: "Weight", type: "number", unit: "kg", required: true }],
      }),
    );
    expect(template.fields[0].unit).toBe("kg");
  });

  it("keeps the schedule the reminders hang off", async () => {
    const template = await publish(filled({ recordAtStage: "tuberInitiation" }));
    expect(template.timing?.stage).toBe("tuberInitiation");
  });

  it("leaves the note undefined rather than inventing one", async () => {
    const template = await publish(
      filled({
        questions: [{ label: "Count", type: "number", unit: "count", required: false }],
      }),
    );
    expect(template.fields[0].guidance ?? "").toBe("");
  });
});

describe("a comparison that is not a replicated experiment", () => {
  // The Downs CropVision trial is two operating modes on one grading line.
  // There are no randomised plots, so the honest design is observational — and
  // that used to mean the response variable was dropped on import, so the app
  // recorded everything and compared nothing.
  it("keeps the response variable on an observational trial", async () => {
    const template = await publish(
      filled({
        kind: "comparison",
        questions: [
          { label: "Marketable pack-out", type: "number", unit: "%", required: true },
        ],
        responseIndex: 0,
      }),
    );
    const trials = await listTrials();
    const trial = trials.find((t) => t.trialId === template.trialId);
    expect(trial?.design).toBe("observational");
    expect(trial?.responseMetric).toBe(template.fields[0].fieldName);
  });

  it("does not turn it into a replicated trial as a side effect", async () => {
    // Storing the response must not quietly change the design, or a
    // demonstration would start asking for blocks and a plot layout.
    const template = await publish(
      filled({
        kind: "comparison",
        questions: [{ label: "Yield", type: "number", unit: "kg", required: true }],
        responseIndex: 0,
      }),
    );
    const trial = (await listTrials()).find((t) => t.trialId === template.trialId);
    expect(trial?.design).toBe("observational");
  });
});

describe("a form carrying figures given in confidence", () => {
  it("keeps the mark through publishing", async () => {
    const parsed = toParsedTrial(filled());
    parsed.forms[0].commerciallySensitive = true;
    const result = await publishParsedTrial(parsed);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const template = (await listTemplates()).find((t) => t.trialId === result.data.trialId);
    expect(template?.commerciallySensitive).toBe(true);
  });

  it("leaves an ordinary form unmarked rather than false-by-default noise", async () => {
    const template = await publish(filled());
    expect(template.commerciallySensitive ?? false).toBe(false);
  });
});

describe("a form where several samples come from one thing", () => {
  // The gap this closes: three 10 kg samples pulled off one grading run used
  // to publish as three independent observations, and every standard error
  // the trial reported came out too small by roughly √3. The fix is only
  // worth anything if the answer survives to the template — which is the
  // boundary this file exists to hold.
  it("carries the word through to the published form", async () => {
    const template = await publish(filled({ samplesShare: "run" }));
    expect(template.groupsBy).toBe("run");
  });

  it("trims what somebody typed rather than storing the spaces", async () => {
    const template = await publish(filled({ samplesShare: "  batch  " }));
    expect(template.groupsBy).toBe("batch");
  });

  it("leaves an ordinary form ungrouped", async () => {
    const template = await publish(filled());
    expect(template.groupsBy).toBeUndefined();
  });
});
