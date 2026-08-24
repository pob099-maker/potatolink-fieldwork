import { describe, expect, it } from "vitest";
import { trialVocabulary, words } from "./vocabulary";

const observational = { vocabulary: null, design: "observational" as const };
const replicated = { vocabulary: null, design: "replicated" as const };

describe("which word a trial uses", () => {
  it("calls them treatments in a replicated trial", () => {
    // A replicated design is a research trial, and a protocol, a biometrician
    // and an R script all say treatment.
    expect(trialVocabulary(replicated)).toBe("treatment");
  });

  it("calls them practices in an observational one", () => {
    // A grower comparing two ways of doing something is not applying a
    // treatment, and saying so makes the app sound written for someone else.
    expect(trialVocabulary(observational)).toBe("practice");
  });

  it("lets a trial override what its design implies", () => {
    // A replicated on-farm demonstration is a real thing, and so is a
    // research trial somebody prefers to describe in plain terms.
    expect(trialVocabulary({ ...replicated, vocabulary: "practice" })).toBe("practice");
    expect(trialVocabulary({ ...observational, vocabulary: "treatment" })).toBe("treatment");
  });

  it("keeps following the design until somebody chooses", () => {
    // Nothing was backfilled, so every trial that already existed has a null
    // here. Switching one to replicated has to start it saying treatment.
    expect(trialVocabulary({ vocabulary: null, design: "observational" })).toBe("practice");
    expect(trialVocabulary({ vocabulary: null, design: "replicated" })).toBe("treatment");
  });
});

describe("the forms a sentence needs", () => {
  it("gives singular, plural and capitalised of each", () => {
    expect(words(replicated)).toEqual({
      one: "treatment",
      many: "treatments",
      One: "Treatment",
      Many: "Treatments",
    });
    expect(words(observational)).toEqual({
      one: "practice",
      many: "practices",
      One: "Practice",
      Many: "Practices",
    });
  });
});
