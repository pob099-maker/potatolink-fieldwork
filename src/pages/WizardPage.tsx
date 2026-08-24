// Setting a trial up by answering questions instead of filling in a form.
//
// The two people who use this are nothing alike. A researcher arrives with the
// brief already written and wants the questions out of the way; a grower
// comparing two ways of doing something has never met the word "replicate".
//
// Three things let one screen serve both. The first question forks the rest,
// so a comparison is never asked about blocking. Every question has a sane
// answer already filled in, so somebody who knows can read and move on rather
// than type. And it stops at a trial you can record against, handing over to
// the trial page for anything more — which leaves the grower finished and the
// researcher somewhere useful.

import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { publishParsedTrial } from "../services/templatePublish";
import {
  OBSERVATION_CHOICES,
  emptyAnswers,
  toParsedTrial,
  wizardProblems,
  type Observation,
  type WizardAnswers,
} from "../services/wizard";
import { Card, ErrorState, PageTitle } from "../components/ui";

const STEPS = ["What kind of trial", "What you're comparing", "Where", "What to record"] as const;

export function WizardPage() {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<WizardAnswers>(emptyAnswers());
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof WizardAnswers>(key: K, value: WizardAnswers[K]) =>
    setAnswers((current) => ({ ...current, [key]: value }));

  const problems = wizardProblems(answers);
  const onReview = step === STEPS.length;

  async function create(): Promise<void> {
    setSaving(true);
    setError(null);
    const result = await publishParsedTrial(toParsedTrial(answers));
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    navigate(`/trials/${result.data.trialId}`);
  }

  return (
    <div className="space-y-4">
      <div>
        <PageTitle>Set up a trial</PageTitle>
        <p className="mt-1 text-ink/70 dark:text-ink-dark/70">
          {onReview
            ? "Everything below will be created. Nothing is saved until you say so."
            : `Step ${step + 1} of ${STEPS.length} — ${STEPS[step]}. Every answer can be changed afterwards.`}
        </p>
      </div>

      {step === 0 ? <KindStep answers={answers} set={set} /> : null}
      {step === 1 ? <ComparingStep answers={answers} set={set} /> : null}
      {step === 2 ? <WhereStep answers={answers} set={set} /> : null}
      {step === 3 ? <RecordStep answers={answers} set={set} /> : null}
      {onReview ? <Review answers={answers} problems={problems} /> : null}

      {error ? <ErrorState message={error} /> : null}

      <div className="flex flex-wrap gap-2">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="min-h-11 rounded-lg border border-ink/20 px-4 py-2.5 font-medium dark:border-ink-dark/20"
          >
            ← Back
          </button>
        ) : null}
        {onReview ? (
          <button
            type="button"
            disabled={saving || problems.length > 0}
            onClick={() => void create()}
            className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create the trial"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
          >
            Next →
          </button>
        )}
        {/* Somebody who already knows every answer should not have to walk
            through four screens to give them. */}
        {!onReview ? (
          <button
            type="button"
            onClick={() => setStep(STEPS.length)}
            className="min-h-11 px-3 py-2.5 font-medium text-primary underline dark:text-primary-soft"
          >
            Skip to review
          </button>
        ) : null}
      </div>
    </div>
  );
}

type Setter = <K extends keyof WizardAnswers>(key: K, value: WizardAnswers[K]) => void;

const inputClass =
  "mt-1 min-h-11 w-full rounded-lg border border-ink/20 bg-surface px-3 py-2 " +
  "dark:border-ink-dark/20 dark:bg-surface-dark";

function KindStep({ answers, set }: { answers: WizardAnswers; set: Setter }) {
  return (
    <Card>
      <h2 className="font-display text-lg font-bold">What kind of trial is this?</h2>
      <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
        This decides what you are asked next, and what the app calls things.
      </p>
      <div className="mt-3 space-y-2">
        <Choice
          checked={answers.kind === "comparison"}
          onChoose={() => set("kind", "comparison")}
          title="Comparing two ways of doing something"
          detail="A demonstration or on-farm comparison. Record what happens under each, and show a neighbour the difference. No replication, no statistics."
        />
        <Choice
          checked={answers.kind === "experiment"}
          onChoose={() => set("kind", "experiment")}
          title="A designed experiment"
          detail="Replicated plots in a randomised layout, so the result can be analysed properly. The app generates the layout and the fieldbook."
        />
      </div>
      {answers.kind === "experiment" ? (
        <label className="mt-3 block text-sm font-medium">
          How many blocks?
          <input
            type="number"
            min={2}
            value={answers.replicates}
            onChange={(event) => set("replicates", Number(event.target.value) || 0)}
            className={inputClass}
          />
          <span className="mt-1 block text-sm font-normal text-ink/60 dark:text-ink-dark/60">
            Each block holds one plot of every treatment. Three or four is usual.
          </span>
        </label>
      ) : null}
    </Card>
  );
}

function ComparingStep({ answers, set }: { answers: WizardAnswers; set: Setter }) {
  const word = answers.kind === "experiment" ? "treatment" : "practice";
  const update = (index: number, value: string) =>
    set(
      "alternatives",
      answers.alternatives.map((entry, position) => (position === index ? value : entry)),
    );

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">What are you comparing?</h2>
      <label className="mt-3 block text-sm font-medium">
        Give the trial a name
        <input
          value={answers.name}
          onChange={(event) => set("name", event.target.value)}
          placeholder="e.g. Wide vs narrow row spacing"
          className={inputClass}
        />
      </label>
      <label className="mt-3 block text-sm font-medium">
        What are you hoping to find out?
        <textarea
          rows={2}
          value={answers.objective}
          onChange={(event) => set("objective", event.target.value)}
          placeholder="Optional, but it is what the trial gets judged against later."
          className={inputClass}
        />
      </label>

      <label className="mt-4 block text-sm font-medium">
        What is being done now?
        <input
          value={answers.control}
          onChange={(event) => set("control", event.target.value)}
          placeholder="e.g. Current spacing"
          className={inputClass}
        />
        <span className="mt-1 block text-sm font-normal text-ink/60 dark:text-ink-dark/60">
          The control — what everything else is measured against.
        </span>
      </label>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">What are you trying instead?</legend>
        {answers.alternatives.map((entry, index) => (
          <input
            key={index}
            value={entry}
            aria-label={`${word} ${index + 1}`}
            onChange={(event) => update(index, event.target.value)}
            placeholder={index === 0 ? "e.g. Wide spacing" : "Another one"}
            className={inputClass}
          />
        ))}
        <button
          type="button"
          onClick={() => set("alternatives", [...answers.alternatives, ""])}
          className="mt-2 min-h-11 rounded-lg border border-ink/20 px-4 py-2.5 font-medium dark:border-ink-dark/20"
        >
          + Add another
        </button>
      </fieldset>
    </Card>
  );
}

function WhereStep({ answers, set }: { answers: WizardAnswers; set: Setter }) {
  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Where does it run?</h2>
      <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
        One site to start with. More can be added on the trial page, and each gets its own
        randomised layout.
      </p>
      <label className="mt-3 block text-sm font-medium">
        Paddock or site name
        <input
          value={answers.siteName}
          onChange={(event) => set("siteName", event.target.value)}
          placeholder="e.g. Home paddock"
          className={inputClass}
        />
      </label>
      <label className="mt-3 block text-sm font-medium">
        District
        <input
          value={answers.siteRegion}
          onChange={(event) => set("siteRegion", event.target.value)}
          placeholder="e.g. Murraylands SA"
          className={inputClass}
        />
      </label>
    </Card>
  );
}

function RecordStep({ answers, set }: { answers: WizardAnswers; set: Setter }) {
  const toggle = (choice: Observation) =>
    set(
      "observations",
      answers.observations.includes(choice)
        ? answers.observations.filter((entry) => entry !== choice)
        : [...answers.observations, choice],
    );

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">What gets recorded in the field?</h2>
      <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
        A starting point, not the final list — questions can be added, reworded or removed
        on the trial page afterwards.
      </p>
      <div className="mt-3 space-y-2">
        {OBSERVATION_CHOICES.map((choice) => (
          <label
            key={choice.value}
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
              answers.observations.includes(choice.value)
                ? "border-primary bg-primary/5"
                : "border-ink/15 dark:border-ink-dark/15"
            }`}
          >
            <input
              type="checkbox"
              checked={answers.observations.includes(choice.value)}
              onChange={() => toggle(choice.value)}
              className="mt-1 size-4 shrink-0"
            />
            <span>
              <span className="block font-medium">{choice.label}</span>
              <span className="block text-sm text-ink/60 dark:text-ink-dark/60">
                {choice.detail}
              </span>
            </span>
          </label>
        ))}
      </div>
    </Card>
  );
}

function Review({ answers, problems }: { answers: WizardAnswers; problems: string[] }) {
  const parsed = toParsedTrial(answers);
  return (
    <Card>
      <h2 className="font-display text-lg font-bold">{parsed.name || "Untitled trial"}</h2>
      {parsed.objective ? (
        <p className="mt-1 text-ink/70 dark:text-ink-dark/70">{parsed.objective}</p>
      ) : null}

      {problems.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-lg bg-warning/15 p-3 text-sm text-warning">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}

      <dl className="mt-3 space-y-3 text-sm">
        <Row label="Design">
          {parsed.design === "replicated"
            ? `Replicated — ${parsed.replicates} blocks, layout generated after this`
            : "Observational comparison"}
        </Row>
        <Row label={parsed.design === "replicated" ? "Treatments" : "Practices"}>
          {parsed.practices.map((practice) => practice.name).join(", ")}
        </Row>
        <Row label="Site">
          {parsed.sites[0]?.location || "—"}
          {parsed.sites[0]?.region ? `, ${parsed.sites[0].region}` : ""}
        </Row>
        <Row label="Asked in the field">
          {parsed.forms[0].fields.map((entry) => entry.label).join(" · ")}
        </Row>
      </dl>

      <p className="mt-3 text-sm text-ink/50 dark:text-ink-dark/50">
        This gets you a trial you can record against. Plot size, extra sites, more
        questions and the economics all live on the trial page.
      </p>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2 border-t border-ink/10 pt-2 dark:border-ink-dark/10">
      <dt className="w-32 shrink-0 font-medium">{label}</dt>
      <dd className="flex-1 text-ink/70 dark:text-ink-dark/70">{children}</dd>
    </div>
  );
}

function Choice({
  checked,
  onChoose,
  title,
  detail,
}: {
  checked: boolean;
  onChoose: () => void;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
        checked ? "border-primary bg-primary/5" : "border-ink/15 dark:border-ink-dark/15"
      }`}
    >
      <input
        type="radio"
        name="kind"
        checked={checked}
        onChange={onChoose}
        className="mt-1 size-4 shrink-0"
      />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-ink/60 dark:text-ink-dark/60">{detail}</span>
      </span>
    </label>
  );
}
