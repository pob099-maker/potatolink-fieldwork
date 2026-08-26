import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { dbGetAll, dbPut, dbPutMany } from "../lib/localdb";
import { rebuildFactorialArms, saveFactorial } from "./store";
import type { Factor, FactorLevel, MeasurementEvent, PracticeArm } from "../types";

// The one place the factorial model meets the rest of the app: combinations
// become practice arms, so the layout engine, the plot picker, the export and
// every recorded entry carry on keying on armId and know nothing about
// factors at all.

const T0 = "2026-01-01T00:00:00.000Z";
const TRIAL = "11111111-1111-4111-8111-111111111111";

const factor = (id: string, name: string, code: string, sortOrder: number): Factor => ({
  factorId: id,
  trialId: TRIAL,
  name,
  code,
  sortOrder,
  createdAt: T0,
});

const level = (id: string, factorId: string, label: string, sortOrder: number): FactorLevel => ({
  levelId: id,
  factorId,
  label,
  numericValue: null,
  sortOrder,
  createdAt: T0,
});

const variety = factor("22222222-2222-4222-8222-222222222222", "Variety", "Var", 0);
const nitrogen = factor("33333333-3333-4333-8333-333333333333", "Nitrogen", "N", 1);

const levels: FactorLevel[] = [
  level("44444444-4444-4444-8444-444444444401", variety.factorId, "Moonlight", 0),
  level("44444444-4444-4444-8444-444444444402", variety.factorId, "Atlantic", 1),
  level("55555555-5555-4555-8555-555555555501", nitrogen.factorId, "Nil", 0),
  level("55555555-5555-4555-8555-555555555502", nitrogen.factorId, "Standard", 1),
  level("55555555-5555-4555-8555-555555555503", nitrogen.factorId, "High", 2),
];

async function clearTrial() {
  for (const arm of await dbGetAll<PracticeArm>("practiceArms")) {
    if (arm.trialId === TRIAL) await dbPut("practiceArms", { ...arm, trialId: "gone" });
  }
  const events = await dbGetAll<MeasurementEvent>("measurementEvents");
  await dbPutMany(
    events
      .filter((event) => event.trialId === TRIAL)
      .map((event) => ({ collection: "measurementEvents" as const, value: { ...event, trialId: "gone", armId: null } })),
  );
}

beforeEach(async () => {
  await clearTrial();
});

describe("rebuildFactorialArms", () => {
  it("turns a 2 × 3 into six arms", async () => {
    const result = await rebuildFactorialArms({ trialId: TRIAL, factors: [variety, nitrogen], levels });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(6);
  });

  it("gives every arm a label a contractor can read off a peg", async () => {
    await rebuildFactorialArms({ trialId: TRIAL, factors: [variety, nitrogen], levels });
    // Sorted, because dbGetAll returns key order and the keys are random
    // UUIDs. Anything that cares about arm order has to sort by sortOrder —
    // the layout engine does, which is what keeps a seed reproducible.
    const arms = (await dbGetAll<PracticeArm>("practiceArms"))
      .filter((a) => a.trialId === TRIAL)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(arms[0].name).toBe("Var:Moonlight N:Nil");
    expect(arms[0].description).toBe("Variety=Moonlight · Nitrogen=Nil");
    expect(arms[arms.length - 1].name).toBe("Var:Atlantic N:High");
  });

  it("records which level of which factor each arm stands for", async () => {
    await rebuildFactorialArms({ trialId: TRIAL, factors: [variety, nitrogen], levels });
    const arms = (await dbGetAll<PracticeArm>("practiceArms")).filter((a) => a.trialId === TRIAL);
    // This is what makes main effects and interactions computable later.
    expect(arms.every((arm) => Object.keys(arm.factorLevels ?? {}).length === 2)).toBe(true);
  });

  it("keeps an arm's id when the same combination survives an edit", async () => {
    await rebuildFactorialArms({ trialId: TRIAL, factors: [variety, nitrogen], levels });
    const before = (await dbGetAll<PracticeArm>("practiceArms")).filter((a) => a.trialId === TRIAL);

    // Renaming a factor must not throw away arms that mean the same thing.
    await rebuildFactorialArms({
      trialId: TRIAL,
      factors: [{ ...variety, name: "Cultivar" }, nitrogen],
      levels,
    });
    const after = (await dbGetAll<PracticeArm>("practiceArms")).filter((a) => a.trialId === TRIAL);

    expect(new Set(after.map((a) => a.armId))).toEqual(new Set(before.map((a) => a.armId)));
  });

  it("removes arms whose combination no longer exists", async () => {
    await rebuildFactorialArms({ trialId: TRIAL, factors: [variety, nitrogen], levels });
    // Drop a nitrogen level: 2 × 2 instead of 2 × 3.
    await rebuildFactorialArms({
      trialId: TRIAL,
      factors: [variety, nitrogen],
      levels: levels.filter((l) => l.label !== "High"),
    });
    const arms = (await dbGetAll<PracticeArm>("practiceArms")).filter((a) => a.trialId === TRIAL);
    expect(arms).toHaveLength(4);
  });

  it("refuses once anything has been recorded, in the data and not just the interface", async () => {
    // Rule 14: regenerating combinations mints new arm ids, and every record
    // filed against the old ones would be orphaned. A guard that lives only in
    // a disabled button is one button away from not existing.
    await rebuildFactorialArms({ trialId: TRIAL, factors: [variety, nitrogen], levels });
    const arms = (await dbGetAll<PracticeArm>("practiceArms")).filter((a) => a.trialId === TRIAL);

    await dbPut("measurementEvents", {
      eventId: "99999999-9999-4999-8999-999999999999",
      trialId: TRIAL,
      siteId: null,
      armId: arms[0].armId,
      replicate: 1,
      plot: 1,
      eventDate: T0,
      eventType: "field_record",
      enteredBy: "someone",
      syncStatus: "pending",
      createdAt: T0,
    } as MeasurementEvent);

    const result = await rebuildFactorialArms({ trialId: TRIAL, factors: [variety, nitrogen], levels });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/frozen|re-label/i);
  });

  it("refuses a design nobody could run", async () => {
    // 5 × 5 × 5 is a 125-plot block before replication.
    const many: Factor[] = [0, 1, 2].map((i) =>
      factor(`6666666${i}-6666-4666-8666-666666666666`, `F${i}`, `F${i}`, i),
    );
    const manyLevels = many.flatMap((f, fi) =>
      [0, 1, 2, 3, 4].map((li) =>
        level(`7777777${fi}-7777-4777-8777-77777777770${li}`, f.factorId, `L${li}`, li),
      ),
    );
    const result = await rebuildFactorialArms({ trialId: TRIAL, factors: many, levels: manyLevels });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/uniform|split-plot|season/i);
  });

  it("refuses a factor with no levels rather than silently dropping it", async () => {
    const result = await rebuildFactorialArms({
      trialId: TRIAL,
      factors: [variety, nitrogen],
      levels: levels.filter((l) => l.factorId === variety.factorId),
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/at least one level/i);
  });
});

describe("saveFactorial", () => {
  it("stores the factors and their levels", async () => {
    const result = await saveFactorial({ trialId: TRIAL, factors: [variety, nitrogen], levels });
    expect(result.success).toBe(true);

    const stored = (await dbGetAll<Factor>("factors")).filter((f) => f.trialId === TRIAL);
    expect(stored).toHaveLength(2);
    const storedLevels = await dbGetAll<FactorLevel>("factorLevels");
    expect(storedLevels.filter((l) => l.factorId === nitrogen.factorId)).toHaveLength(3);
  });

  it("leaves the trial untouched when the rebuild is refused", async () => {
    // Written after the rebuild on purpose: a refusal must not leave a trial
    // half-changed, with new factors and old arms.
    await saveFactorial({ trialId: TRIAL, factors: [variety, nitrogen], levels });
    const before = (await dbGetAll<Factor>("factors")).filter((f) => f.trialId === TRIAL).length;

    const result = await saveFactorial({
      trialId: TRIAL,
      factors: [variety, nitrogen],
      levels: levels.filter((l) => l.factorId === variety.factorId),
    });
    expect(result.success).toBe(false);
    expect((await dbGetAll<Factor>("factors")).filter((f) => f.trialId === TRIAL)).toHaveLength(before);
  });
});
