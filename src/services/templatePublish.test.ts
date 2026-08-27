import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { publishParsedTrial } from "./templatePublish";
import { listTemplates } from "./store";
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
