import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { dbGet, dbPut } from "../lib/localdb";
import { addTrial, listTemplates, saveTemplate } from "./store";
import type { FormTemplate } from "../types";

// The store is exercised without a Supabase client (env unset in tests), so
// cloud pushes are skipped; what we can verify locally is updatedAt stamping
// and that the outbox queue survives for syncPending to drain later.

function template(templateId: string, trialId: string): FormTemplate {
  return {
    templateId,
    trialId,
    armId: null,
    name: "Form",
    eventType: "field_record",
    audience: "grower",
    frequency: "",
    requiresSite: true,
    requiresArm: true,
    fields: [
      {
        fieldName: "notes",
        label: "Notes",
        type: "text",
        required: true,
        options: null,
        min: null,
        max: null,
        unit: null,
        displayOrder: 0,
      },
    ],
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

describe("sync hardening (S-1/S-2)", () => {
  beforeEach(async () => {
    await dbPut("meta", { key: "outbox", items: [] });
  });

  it("stamps updatedAt on every edit of an editable record", async () => {
    const trial = await addTrial({ projectId: "p1", name: "T", objective: "" });
    expect(trial.success).toBe(true);
    if (!trial.success) return;

    const saved = await saveTemplate(template("tpl-1", trial.data.trialId));
    expect(saved.success).toBe(true);
    if (!saved.success) return;
    expect(saved.data.updatedAt).toBeTruthy();

    const before = saved.data.updatedAt!;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const again = await saveTemplate({ ...saved.data, name: "Renamed" });
    expect(again.success).toBe(true);
    if (!again.success) return;
    expect(again.data.updatedAt! > before).toBe(true);
  });

  it("persists the edit locally even though no cloud is reachable", async () => {
    const trial = await addTrial({ projectId: "p1", name: "T2", objective: "" });
    if (!trial.success) return;
    await saveTemplate(template("tpl-2", trial.data.trialId));
    const stored = (await listTemplates()).find((t) => t.templateId === "tpl-2");
    expect(stored?.name).toBe("Form");
  });

  it("keeps the outbox as a persistent queue structure in meta", async () => {
    await dbPut("meta", {
      key: "outbox",
      items: [{ collection: "formTemplates", id: "tpl-x" }],
    });
    const outbox = await dbGet<{ key: string; items: unknown[] }>("meta", "outbox");
    expect(outbox?.items).toHaveLength(1);
  });
});
