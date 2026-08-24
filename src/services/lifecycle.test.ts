import { describe, expect, it } from "vitest";
import {
  TRIAL_STATES,
  canRecord,
  closedReason,
  hiddenCount,
  isHidden,
  visibleTrials,
} from "./lifecycle";
import type { TrialStatus } from "../types";

const at = (status: TrialStatus) => ({ status });

describe("whether a trial can still take entries", () => {
  it("accepts them while it is being set up or running", () => {
    // A draft has to be recordable, or a test run is impossible.
    expect(canRecord(at("draft"))).toBe(true);
    expect(canRecord(at("active"))).toBe(true);
  });

  it("stops them once collection has finished", () => {
    expect(canRecord(at("completed"))).toBe(false);
    expect(canRecord(at("archived"))).toBe(false);
  });

  it("says why, rather than failing quietly", () => {
    // Somebody arriving on an old link deserves a reason, not a dead form.
    expect(closedReason(at("completed"))).toContain("Collection has finished");
    expect(closedReason(at("archived"))).toContain("archived");
    expect(closedReason(at("draft"))).toBeNull();
    expect(closedReason(at("active"))).toBeNull();
  });

  it("promises the data is still there in both closed states", () => {
    for (const status of ["completed", "archived"] as const) {
      expect(closedReason(at(status))).toContain("still here");
    }
  });
});

describe("what a list hides", () => {
  const trials = [at("draft"), at("active"), at("completed"), at("archived"), at("archived")];

  it("hides only archived trials", () => {
    // Completed stays: a trial being written up is exactly the one somebody
    // is looking for, and hiding it would be a surprise dressed as tidiness.
    expect(isHidden(at("completed"))).toBe(false);
    expect(isHidden(at("archived"))).toBe(true);
  });

  it("shows everything else by default", () => {
    expect(visibleTrials(trials, false)).toHaveLength(3);
  });

  it("gives them all back when asked", () => {
    expect(visibleTrials(trials, true)).toHaveLength(5);
  });

  it("counts what is being kept out of the way, so it can be offered back", () => {
    expect(hiddenCount(trials)).toBe(2);
    expect(hiddenCount([at("active")])).toBe(0);
  });
});

describe("the states offered", () => {
  it("covers every status a trial can hold", () => {
    // A status with no way to choose it is how this got broken in the first
    // place: four states existed and nothing could set any of them.
    const offered = TRIAL_STATES.map((state) => state.value).sort();
    expect(offered).toEqual(["active", "archived", "completed", "draft"]);
  });

  it("explains each one in terms of what it does here", () => {
    for (const state of TRIAL_STATES) {
      expect(state.detail.length).toBeGreaterThan(20);
    }
  });
});
