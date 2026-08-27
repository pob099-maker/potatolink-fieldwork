// Turning a handful of plain answers into a working trial.
//
// Two people have to get through this and they are nothing alike. A researcher
// arrives with the brief already written and wants the questions out of the
// way; a grower comparing two ways of doing something has never met the word
// "replicate". A wizard tuned for one insults the other.
//
// What makes both work is that the steps and the review are the same data seen
// two ways. A grower walks four screens. Somebody who already knows jumps to
// the review, which is every answer on one editable page — so "skip" means
// skip, rather than landing somewhere read-only with a list of complaints and
// no way to act on them.
//
// It still stops early on purpose. This produces something you can record
// against, then hands over to the trial page, where the cards that already
// exist are the right tool for detail.
//
// It builds a ParsedTrial, the same shape the CSV importer produces, so both
// paths meet at one validator and one publish step. Going through CSV text
// would mean serialising structured answers into positional rows and parsing
// them back, and every parser bug would become a wizard bug.

import type { FieldType } from "../types";
import type { ParsedField, ParsedForm, ParsedTrial } from "./templateImport";

/** What the trial is for, which decides most of what follows. */
export type TrialKind = "comparison" | "experiment";

/**
 * What the wizard offers. The rest — a date, a GPS fix, a file, a list to pick
 * from — are rarer and live in the form editor.
 *
 * Video is here because the app treats photo and video as first-class inputs
 * rather than afterthoughts, and offering one without the other quietly made
 * that untrue: somebody building a trial in the wizard could not ask for a
 * video at all, even though the app captures and uploads them.
 */
export const RECORD_TYPES: Array<{ value: FieldType; label: string; wantsUnit: boolean }> = [
  { value: "number", label: "A number", wantsUnit: true },
  { value: "slider", label: "A rating out of five", wantsUnit: false },
  { value: "select", label: "A choice from a list", wantsUnit: false },
  { value: "photo", label: "A photo", wantsUnit: false },
  { value: "video", label: "A video", wantsUnit: false },
  { value: "file", label: "A file — CSV, PDF, spreadsheet", wantsUnit: false },
  { value: "link", label: "A web link", wantsUnit: false },
  { value: "boolean", label: "Yes or no", wantsUnit: false },
  { value: "text", label: "Written notes", wantsUnit: false },
];

export interface Question {
  label: string;
  type: FieldType;
  /** Only meaningful for numbers; kg and t unlock the yield conversion. */
  unit: string;
  required: boolean;
  /**
   * The choices, for a list to pick from.
   *
   * The grower-facing guidance has always said to prefer a list over free
   * text, because every typed field costs completion and a typed answer
   * cannot be counted. The wizard could not make one, so the advice pointed
   * at a door that was not there.
   */
  options?: string[];
  /**
   * What the person recording is told, under the label.
   *
   * The designer knows things the person in the paddock cannot infer from a
   * label — before grading or after, which rows to count, whether a blank
   * means zero. A label cannot carry that without becoming a sentence, and a
   * sentence makes a poor label.
   */
  guidance?: string;
}

export interface WizardAnswers {
  kind: TrialKind;
  name: string;
  objective: string;
  /** What is being done now — the control. */
  control: string;
  /** What is being tried against it. At least one. */
  alternatives: string[];
  siteName: string;
  siteRegion: string;
  /** Blocks for an experiment; ignored for a comparison. */
  replicates: number;
  questions: Question[];
  /**
   * Which question is the number the trial exists to compare, by index.
   * Asked rather than assumed: a nitrogen trial's response might be tuber
   * count or specific gravity, and quietly picking the first weight would set
   * the whole statistical summary to the wrong column.
   */
  responseIndex: number | null;
  /**
   * The growth stage this trial's form is expected at, or null for a trial
   * recorded whenever something happens.
   *
   * One question for the whole form rather than one per item, because a
   * schedule is a *visit*: somebody drives to the paddock and fills the form
   * in. Timing each measurement separately would imply a trip each, and a
   * form is already one visit with its own event type (rule 21). Two
   * measurements that genuinely need different timing are two forms, which
   * the trial page can add.
   *
   * Null is a real answer and stays null. A form with no timing is skipped by
   * the due list on purpose, and inventing a schedule for a trial nobody
   * scheduled would produce a banner nagging about a visit that was never
   * planned.
   */
  recordAtStage: string | null;
}

/** Questions worth starting from. Every one can be renamed, retyped or removed. */
export function starterQuestions(): Question[] {
  return [
    { label: "Harvested weight", type: "number", unit: "kg", required: true },
    { label: "Photo", type: "photo", unit: "", required: false },
    { label: "Anything worth noting?", type: "text", unit: "", required: false },
  ];
}

export const emptyAnswers = (): WizardAnswers => ({
  kind: "comparison",
  name: "",
  objective: "",
  control: "",
  alternatives: [""],
  siteName: "",
  siteRegion: "",
  replicates: 3,
  questions: starterQuestions(),
  responseIndex: 0,
  // Null rather than a stage: a schedule nobody asked for produces a banner
  // nagging about a visit that was never planned.
  recordAtStage: null,
});

/** A machine name from a label, since nobody should be asked for one. */
export function fieldNameFrom(label: string, fallback: string): string {
  const words = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return fallback;
  return words
    .map((word, index) => (index === 0 ? word : word[0].toUpperCase() + word.slice(1)))
    .join("");
}

/** Everything still missing before this could be created, in plain words. */
export function wizardProblems(answers: WizardAnswers): string[] {
  const problems: string[] = [];
  if (!answers.name.trim()) problems.push("The trial needs a name.");
  if (!answers.control.trim()) problems.push("Name what is being done now.");
  if (answers.alternatives.filter((entry) => entry.trim()).length === 0) {
    problems.push("Name at least one thing to compare it against.");
  }
  if (!answers.siteName.trim()) problems.push("The trial needs somewhere to run.");
  if (answers.kind === "experiment" && answers.replicates < 2) {
    problems.push("A replicated trial needs at least two blocks.");
  }
  if (answers.questions.filter((question) => question.label.trim()).length === 0) {
    problems.push("Record at least one thing in the field.");
  }
  for (const question of answers.questions) {
    if (question.type !== "select" || !question.label.trim()) continue;
    if ((question.options ?? []).filter((choice) => choice.trim()).length < 2) {
      problems.push(`Give “${question.label.trim()}” at least two choices to pick from.`);
    }
  }
  if (answers.kind === "experiment" && responseQuestion(answers) === null) {
    problems.push("Choose which number the trial is comparing.");
  }
  return problems;
}

/**
 * The question marked as the response, when it is one the app can compare.
 * Only a number qualifies — a photo or a note has no mean.
 */
export function responseQuestion(answers: WizardAnswers): Question | null {
  if (answers.responseIndex === null) return null;
  const question = answers.questions[answers.responseIndex];
  if (!question || question.type !== "number" || !question.label.trim()) return null;
  return question;
}

/** Whether a question could serve as the response, for offering the choice. */
export const canBeResponse = (question: Question): boolean =>
  question.type === "number" && question.label.trim().length > 0;

/**
 * The answers as a ParsedTrial — the same thing the CSV importer hands to the
 * publisher, so both routes are validated and created identically.
 */
export function toParsedTrial(answers: WizardAnswers): ParsedTrial {
  const kept = answers.questions.filter((question) => question.label.trim());
  const response = responseQuestion(answers);

  const fields: ParsedField[] = kept.map((question, index) => ({
    fieldName: fieldNameFrom(question.label, `answer${index + 1}`),
    label: question.label.trim(),
    type: question.type,
    required: question.required,
    unit: question.type === "number" && question.unit.trim() ? question.unit.trim() : null,
    min: question.type === "slider" ? 1 : null,
    max: question.type === "slider" ? 5 : null,
    // Blank choices are dropped rather than becoming empty options nobody can
    // pick, and a list with none left is not a list.
    options:
      question.type === "select"
        ? (question.options ?? []).map((choice) => choice.trim()).filter(Boolean)
        : null,
    guidance: (question.guidance ?? "").trim(),
    isResponse: response !== null && question === response,
    row: index + 1,
  }));

  const form: ParsedForm = {
    name: `${answers.name.trim()} record`,
    eventType: "field_record",
    audience: "grower",
    frequency: answers.kind === "experiment" ? "Once per plot" : "Each time",
    // The stage carries its own typical window, so the day counts stay null
    // and the estimate comes from the stage list rather than being frozen
    // here — a stage whose timing is revised later revises this with it.
    timing: answers.recordAtStage
      ? { stage: answers.recordAtStage, dapFrom: null, dapTo: null }
      : null,
    requiresSite: true,
    requiresArm: true,
    fields,
  };

  return {
    name: answers.name.trim(),
    objective: answers.objective.trim(),
    design: answers.kind === "experiment" ? "replicated" : "observational",
    replicates: answers.kind === "experiment" ? answers.replicates : 0,
    // The wizard asks "how many blocks?", so it had better produce blocks.
    blocking: answers.kind === "experiment" ? "blocks" : "none",
    sites: [
      {
        location: answers.siteName.trim(),
        region: answers.siteRegion.trim(),
        soilType: "",
      },
    ],
    practices: [
      { name: answers.control.trim(), type: "control", description: "" },
      ...answers.alternatives
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((name) => ({ name, type: "alternative" as const, description: "" })),
    ],
    forms: [form],
  };
}
