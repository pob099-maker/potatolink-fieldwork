import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  addArm,
  addEntry,
  addTrial,
  armHasData,
  listArms,
  removeArm,
} from "./store";

describe("practice-arm management", () => {
  it("creates a new trial with a starter control arm", async () => {
    const trial = await addTrial({ projectId: "p1", name: "VRI trial", objective: "" });
    expect(trial.success).toBe(true);
    if (!trial.success) return;
    const arms = (await listArms()).filter((arm) => arm.trialId === trial.data.trialId);
    expect(arms).toHaveLength(1);
    expect(arms[0].type).toBe("control");
    expect(arms[0].archived).toBe(false);
  });

  it("deletes an arm outright when nothing is recorded against it", async () => {
    const trial = await addTrial({ projectId: "p1", name: "Delete trial", objective: "" });
    if (!trial.success) return;
    const added = await addArm({ trialId: trial.data.trialId, name: "Mistake", type: "alternative" });
    expect(added.success).toBe(true);
    if (!added.success) return;

    const result = await removeArm(added.data);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBe("deleted");
    const stillThere = (await listArms()).some((arm) => arm.armId === added.data.armId);
    expect(stillThere).toBe(false);
  });

  it("archives an arm that already has data, keeping it", async () => {
    const trial = await addTrial({ projectId: "p1", name: "Archive trial", objective: "" });
    if (!trial.success) return;
    const added = await addArm({ trialId: trial.data.trialId, name: "Tested", type: "alternative" });
    if (!added.success) return;

    await addEntry({
      trialId: trial.data.trialId,
      siteId: null,
      armId: added.data.armId,
      replicate: null,
      plot: null,
      eventType: "field_record",
      enteredBy: "grower",
      deviceType: "mobile",
      values: [{ metricName: "tonnesHandled", value: 5, unit: "t", photoUrl: null }],
    });
    expect(await armHasData(added.data.armId)).toBe(true);

    const result = await removeArm(added.data);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBe("archived");
    const stored = (await listArms()).find((arm) => arm.armId === added.data.armId);
    expect(stored?.archived).toBe(true);
  });

  it("adds arms sorted after the existing ones", async () => {
    const trial = await addTrial({ projectId: "p1", name: "Order trial", objective: "" });
    if (!trial.success) return;
    const first = await addArm({ trialId: trial.data.trialId, name: "Alt A", type: "alternative" });
    const second = await addArm({ trialId: trial.data.trialId, name: "Alt B", type: "alternative" });
    if (!first.success || !second.success) return;
    expect(second.data.sortOrder).toBeGreaterThan(first.data.sortOrder);
  });
});
