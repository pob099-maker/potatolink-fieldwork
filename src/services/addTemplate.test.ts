import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { seedIfNeeded, SEED_IDS } from "./seed";
import { addTemplate, listTemplates } from "./store";

// A trial used to get exactly one form, created with it, and nothing could make
// a second — which is wrong for almost any real protocol. An emergence count, a
// mid-season disease score and a harvest weight are three visits with three
// question sets, and since a schedule hangs off a form, one form also meant one
// scheduled observation for the whole trial.

beforeAll(async () => {
  await seedIfNeeded();
});

const formsFor = async (trialId: string) =>
  (await listTemplates()).filter((template) => template.trialId === trialId);

describe("addTemplate", () => {
  it("adds a form to a trial that already has one", async () => {
    const before = await formsFor(SEED_IDS.trial);
    const result = await addTemplate({ trialId: SEED_IDS.trial, name: "Emergence count" });

    expect(result.success).toBe(true);
    const after = await formsFor(SEED_IDS.trial);
    expect(after).toHaveLength(before.length + 1);
  });

  it("gives the new form an event type distinct from the others", async () => {
    await addTemplate({ trialId: SEED_IDS.trial, name: "Mid-season disease score" });
    const forms = await formsFor(SEED_IDS.trial);
    const types = forms.map((form) => form.eventType);

    // The one that matters: records carry the event type, not the template id,
    // so two forms sharing one would look like the same visit to the due list,
    // to "already recorded here", and to anybody reading the export.
    expect(new Set(types).size).toBe(types.length);
  });

  it("keeps event types distinct even when two names reduce to the same thing", async () => {
    await addTemplate({ trialId: SEED_IDS.heTrial, name: "Vigour score" });
    const second = await addTemplate({ trialId: SEED_IDS.heTrial, name: "Vigour score!" });

    expect(second.success).toBe(true);
    const types = (await formsFor(SEED_IDS.heTrial)).map((form) => form.eventType);
    expect(new Set(types).size).toBe(types.length);
  });

  it("refuses a duplicate name, which nobody could tell apart in a paddock", async () => {
    await addTemplate({ trialId: SEED_IDS.heTrial, name: "Harvest weights" });
    const again = await addTemplate({ trialId: SEED_IDS.heTrial, name: "  harvest weights  " });

    expect(again.success).toBe(false);
    if (!again.success) expect(again.error).toMatch(/already has a form/i);
  });

  it("refuses an empty name", async () => {
    const result = await addTemplate({ trialId: SEED_IDS.trial, name: "   " });
    expect(result.success).toBe(false);
  });

  it("starts unscheduled, with one editable question", async () => {
    const result = await addTemplate({ trialId: SEED_IDS.heTrial, name: "Canopy cover" });
    expect(result.success).toBe(true);
    if (!result.success) return;

    // A form with no fields cannot be saved or filled in, so it gets one
    // placeholder — and no timing, because nobody has said when it is wanted.
    expect(result.data.fields).toHaveLength(1);
    expect(result.data.timing).toBeNull();
    expect(result.data.audience).toBe("grower");
  });

  it("can be a staff form", async () => {
    const result = await addTemplate({
      trialId: SEED_IDS.heTrial,
      name: "Irrigation log",
      audience: "staff",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.audience).toBe("staff");
  });

  it("does not touch another trial's forms", async () => {
    const otherBefore = await formsFor(SEED_IDS.trial);
    await addTemplate({ trialId: SEED_IDS.heTrial, name: "Something else entirely" });
    expect(await formsFor(SEED_IDS.trial)).toHaveLength(otherBefore.length);
  });
});
