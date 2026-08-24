// What a trial calls the things it compares.
//
// Two audiences, two words for one concept. A research trial has treatments:
// that is what a protocol says, what a biometrician expects, and what the
// column is called when the data reaches R or GenStat. An extension trial has
// practices: the grower is not applying a treatment, they are doing something
// differently from what they did last season, and calling that a treatment
// makes the app sound like it was written for somebody else.
//
// Fieldwork serves both, so the word follows the trial rather than being
// picked once for the whole app. Nothing in the data changes — the type is
// still PracticeArm and the export column is still one fixed name, because a
// column that renamed itself per trial would break the first script that
// pooled two of them.

import type { Trial } from "../types";

export type Vocabulary = "treatment" | "practice";

/**
 * The word this trial uses. Stored on the trial when somebody has chosen, and
 * otherwise inferred: a replicated design is a research trial and a comparison
 * without replication is an extension one. Inferring rather than backfilling
 * means every trial that already exists gets the right word without anybody
 * going through them, and the inference keeps tracking the design until it is
 * overridden — a trial switched to replicated starts saying treatment.
 */
export function trialVocabulary(trial: Pick<Trial, "vocabulary" | "design">): Vocabulary {
  return trial.vocabulary ?? (trial.design === "replicated" ? "treatment" : "practice");
}

export interface Words {
  /** "treatment" */
  one: string;
  /** "treatments" */
  many: string;
  /** "Treatment" — for a heading or the start of a sentence. */
  One: string;
  /** "Treatments" */
  Many: string;
}

const WORDS: Record<Vocabulary, Words> = {
  treatment: { one: "treatment", many: "treatments", One: "Treatment", Many: "Treatments" },
  practice: { one: "practice", many: "practices", One: "Practice", Many: "Practices" },
};

/** The word in the forms a sentence or a heading needs. */
export function words(trial: Pick<Trial, "vocabulary" | "design">): Words {
  return WORDS[trialVocabulary(trial)];
}

/**
 * How the choice is offered, and why it matters. Written out here rather than
 * in the component so the two descriptions sit side by side and stay honest
 * about the difference being audience, not substance.
 */
export const VOCABULARY_CHOICES: Array<{ value: Vocabulary; label: string; detail: string }> = [
  {
    value: "treatment",
    label: "Treatments",
    detail:
      "What a research protocol calls them, and what an analyst expects to see. Usual for a replicated trial.",
  },
  {
    value: "practice",
    label: "Practices",
    detail:
      "What a grower comparing two ways of doing something calls them. Usual for a demonstration or on-farm comparison.",
  },
];
