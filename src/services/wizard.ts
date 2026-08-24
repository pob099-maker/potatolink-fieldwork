// Turning a handful of plain answers into a working trial.
//
// Two people have to get through this and they are nothing alike. A researcher
// arrives with the brief already written and wants the questions out of the
// way; a grower comparing two ways of doing something has never met the word
// "replicate" and should not have to. A wizard tuned for one insults the other.
//
// What makes both work is scope: this does not try to capture a whole trial.
// It asks the fewest questions that produce something you can actually record
// against, then hands over to the trial page — where the cards that already
// exist are the right tool for detail. So the grower is finished, and the
// researcher is somewhere useful rather than somewhere shallow.
//
// It builds a ParsedTrial, the same shape the CSV importer produces, so both
// paths meet at one validator and one publish step. Going through CSV text
// would mean serialising structured answers into positional rows and parsing
// them back, and every parser bug would become a wizard bug.

import type { ParsedField, ParsedForm, ParsedTrial } from "./templateImport";

/** What the trial is for, which decides most of what follows. */
export type TrialKind = "comparison" | "experiment";

/** The things a first form can ask, in the language of the paddock. */
export type Observation = "yield" | "rating" | "photo" | "notes";

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
  observations: Observation[];
}

export const OBSERVATION_CHOICES: Array<{
  value: Observation;
  label: string;
  detail: string;
}> = [
  {
    value: "yield",
    label: "Yield or weight",
    detail: "A number off each plot. Records the weight, and works out tonnes per hectare once a plot size is set.",
  },
  {
    value: "rating",
    label: "How well it went",
    detail: "A one-to-five slider. Quick, and catches the judgement a number misses.",
  },
  {
    value: "photo",
    label: "A photo",
    detail: "Taken on the phone. Often the thing a grower most wants to show a neighbour.",
  },
  {
    value: "notes",
    label: "Anything worth noting",
    detail: "Free text, kept last so it catches whatever the other questions did not.",
  },
];

export const emptyAnswers = (): WizardAnswers => ({
  kind: "comparison",
  name: "",
  objective: "",
  control: "",
  alternatives: [""],
  siteName: "",
  siteRegion: "",
  replicates: 3,
  observations: ["yield", "photo", "notes"],
});

/** A machine name from a label, since nobody should be asked for one. */
function fieldNameFrom(label: string): string {
  const cleaned = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (cleaned.length === 0) return "answer";
  return cleaned
    .map((word, index) => (index === 0 ? word : word[0].toUpperCase() + word.slice(1)))
    .join("");
}

function field(
  label: string,
  type: ParsedField["type"],
  extra: Partial<ParsedField> = {},
): ParsedField {
  return {
    fieldName: fieldNameFrom(label),
    label,
    type,
    required: false,
    unit: null,
    min: null,
    max: null,
    options: null,
    isResponse: false,
    row: 0,
    ...extra,
  };
}

/**
 * The questions chosen, in a sensible order. Notes last whatever order they
 * were ticked in, because it is the catch-all and a catch-all above a specific
 * question gets used instead of it.
 */
function observationFields(answers: WizardAnswers): ParsedField[] {
  const fields: ParsedField[] = [];
  const has = (choice: Observation) => answers.observations.includes(choice);

  if (has("yield")) {
    // Weight rather than a rate: it is what somebody can measure, and the app
    // converts it once the plot size is known.
    fields.push(
      field("Harvested weight", "number", {
        required: true,
        unit: "kg",
        min: 0,
        isResponse: true,
      }),
    );
  }
  if (has("rating")) {
    fields.push(field("How well did it go?", "slider", { min: 1, max: 5 }));
  }
  if (has("photo")) fields.push(field("Photo", "photo"));
  if (has("notes")) fields.push(field("Anything worth noting?", "text"));

  // Never produce a form with nothing on it — a trial you cannot record
  // against is not a trial.
  if (fields.length === 0) fields.push(field("Anything worth noting?", "text", { required: true }));

  return fields.map((entry, index) => ({ ...entry, row: index + 1 }));
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
  return problems;
}

/**
 * The answers as a ParsedTrial — the same thing the CSV importer hands to the
 * publisher, so both routes are validated and created identically.
 */
export function toParsedTrial(answers: WizardAnswers): ParsedTrial {
  const form: ParsedForm = {
    name: `${answers.name.trim()} record`,
    eventType: "field_record",
    audience: "grower",
    frequency: answers.kind === "experiment" ? "Once per plot" : "Each time",
    requiresSite: true,
    requiresArm: true,
    fields: observationFields(answers),
  };

  return {
    name: answers.name.trim(),
    objective: answers.objective.trim(),
    design: answers.kind === "experiment" ? "replicated" : "observational",
    replicates: answers.kind === "experiment" ? answers.replicates : 0,
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
