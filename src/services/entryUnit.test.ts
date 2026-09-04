import { describe, expect, it } from "vitest";
import { carriesUnitNumber, unitLabel, unitNumber } from "./entryUnit";
import type { FormTemplate, Trial } from "../types";

const T0 = "2026-09-01T00:00:00.000Z";

const trial = (over: Partial<Trial> = {}): Trial => ({
  trialId: "t1",
  projectId: "p1",
  name: "Trial",
  objective: "",
  status: "active",
  design: "observational",
  replicates: 0,
  blocking: "none",
  vocabulary: null,
  plotLengthM: null,
  plotWidthM: null,
  dataSources: [],
  layoutSeed: null,
  responseMetric: null,
  createdAt: T0,
  updatedAt: T0,
  ...over,
});

const template = (over: Partial<FormTemplate> = {}): FormTemplate => ({
  templateId: "f1",
  trialId: "t1",
  armId: null,
  name: "Grading run",
  eventType: "grading_run",
  audience: "grower",
  frequency: "Each run",
  timing: null,
  requiresSite: true,
  requiresArm: true,
  fields: [],
  createdAt: T0,
  ...over,
});

describe("what a record belongs to", () => {
  // The bug this file exists for: the group number was asked for, typed in,
  // and then nulled one line before it was saved, because the only test of
  // "does this record carry a unit number" was `design === "replicated"`.
  it("keeps the run number on an observational form that groups", () => {
    expect(unitNumber(trial(), template({ groupsBy: "run" }), 7)).toBe(7);
  });

  it("keeps the block number on a replicated trial", () => {
    expect(unitNumber(trial({ design: "replicated", replicates: 3 }), template(), 2)).toBe(2);
  });

  it("carries nothing on an observational form that does not group", () => {
    expect(unitNumber(trial(), template(), 7)).toBeNull();
  });

  it("treats a word of spaces as no grouping", () => {
    expect(carriesUnitNumber(trial(), template({ groupsBy: "   " }))).toBe(false);
  });
});

describe("what the pill says", () => {
  it("uses the designer's own word, so it matches the question that was asked", () => {
    expect(unitLabel(trial(), template({ groupsBy: "run" }), 7, null)).toBe("Run 7");
  });

  it("capitalises a word that was typed lower case", () => {
    expect(unitLabel(trial(), template({ groupsBy: "batch" }), 2, null)).toBe("Batch 2");
  });

  it("says Rep on a replicated trial", () => {
    expect(unitLabel(trial({ design: "replicated" }), template(), 2, null)).toBe("Rep 2");
  });

  it("prefers the plot, which is what is painted on the peg", () => {
    expect(unitLabel(trial({ design: "replicated" }), template(), 2, 14)).toBe("Plot 14");
  });

  it("says nothing when there is nothing to say", () => {
    expect(unitLabel(trial(), template(), null, null)).toBeNull();
    expect(unitLabel(trial(), template(), 7, null)).toBeNull();
  });
});
