import { describe, expect, it } from "vitest";
import { isSeedTrial, seedPresence, SEED_IDS } from "./seed";

// The warning that the figures are invented has to disappear on its own once
// real trials arrive. A standing warning that is wrong about the user's own
// data is worse than none: it teaches them to ignore warnings.
describe("recognising the demonstration data", () => {
  it("knows the trials that ship with the app", () => {
    expect(isSeedTrial(SEED_IDS.trial)).toBe(true);
    expect(isSeedTrial(SEED_IDS.heTrial)).toBe(true);
  });

  it("does not claim a real trial is an example", () => {
    // Real trials get crypto.randomUUID, which cannot collide with the seed's
    // fixed prefix.
    expect(isSeedTrial(crypto.randomUUID())).toBe(false);
  });
});

describe("how the demonstration data sits among real trials", () => {
  const real = crypto.randomUUID();

  it("says nothing when there are no trials at all", () => {
    expect(seedPresence([])).toBe("none");
  });

  it("says nothing once the examples have been removed", () => {
    expect(seedPresence([real])).toBe("none");
  });

  it("reports all when only the examples are present", () => {
    expect(seedPresence([SEED_IDS.trial, SEED_IDS.heTrial])).toBe("all");
  });

  it("reports some when a real trial sits alongside them", () => {
    // This is the case a blanket "the trials below are examples" gets wrong,
    // and the reason the notice names the marked ones instead.
    expect(seedPresence([SEED_IDS.trial, real])).toBe("some");
  });
});
