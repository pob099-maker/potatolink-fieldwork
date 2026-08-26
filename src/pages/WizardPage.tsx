// Setting a trial up by answering questions instead of filling in a form.
//
// The two people who use this are nothing alike. A researcher arrives with the
// brief already written and wants the questions out of the way; a grower
// comparing two ways of doing something has never met the word "replicate".
//
// The steps and the review are the same data seen two ways, which is what lets
// one screen serve both. A grower walks four short screens. Somebody who
// already knows jumps to the review, which is every answer on one editable
// page — so "skip" means skip, rather than landing somewhere read-only with a
// list of complaints and no way to act on them.

import { useState, type ReactNode } from "react";
import { MeasurementPicker } from "../components/MeasurementPicker";
import { useNavigate } from "react-router-dom";
import { publishParsedTrial } from "../services/templatePublish";
import {
  RECORD_TYPES,
  canBeResponse,
  emptyAnswers,
  starterQuestions,
  toParsedTrial,
  wizardProblems,
  type Question,
  type WizardAnswers,
} from "../services/wizard";
import { Card, CardTitle, ErrorState, PageTitle } from "../components/ui";
import type { FieldType } from "../types";

const STEPS = ["What kind of trial", "What you're comparing", "Where", "What to record"] as const;

const inputClass =
  "mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 py-2";

export type Setter = <K extends keyof WizardAnswers>(key: K, value: WizardAnswers[K]) => void;

export function WizardPage() {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<WizardAnswers>(emptyAnswers());
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set: Setter = (key, value) =>
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
        <p className="mt-1 text-ink-soft">
          {onReview
            ? "Everything here can be changed. Nothing is saved until you say so."
            : `Step ${step + 1} of ${STEPS.length} — ${STEPS[step]}. Every answer can be changed afterwards.`}
        </p>
      </div>

      {onReview ? (
        // Not a summary: the same questions, all at once and all editable, so
        // whoever skipped the steps can answer them here instead of walking
        // back through screens they deliberately passed.
        <>
          {problems.length > 0 ? (
            <Card className="border-warning/40">
              <h2 className="font-semibold text-warning">Still needed</h2>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </Card>
          ) : null}
          <KindStep answers={answers} set={set} />
          <ComparingStep answers={answers} set={set} />
          <WhereStep answers={answers} set={set} />
          <RecordStep answers={answers} set={set} />
          <Summary answers={answers} />
        </>
      ) : (
        <>
          {step === 0 ? <KindStep answers={answers} set={set} /> : null}
          {step === 1 ? <ComparingStep answers={answers} set={set} /> : null}
          {step === 2 ? <WhereStep answers={answers} set={set} /> : null}
          {step === 3 ? <RecordStep answers={answers} set={set} /> : null}
        </>
      )}

      {error ? <ErrorState message={error} /> : null}

      <div className="flex flex-wrap gap-2">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
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
        {!onReview ? (
          <button
            type="button"
            onClick={() => setStep(STEPS.length)}
            className="min-h-11 px-3 py-2.5 font-medium text-primary underline dark:text-primary-soft"
          >
            Show everything at once
          </button>
        ) : null}
      </div>
    </div>
  );
}

function KindStep({ answers, set }: { answers: WizardAnswers; set: Setter }) {
  return (
    <Card>
      <CardTitle>What kind of trial is this?</CardTitle>
      <p className="mt-1 text-sm text-ink-soft">
        This decides what you are asked next, and what the app calls things.
      </p>
      <div className="mt-3 space-y-2">
        <Choice
          checked={answers.kind === "comparison"}
          onChoose={() => set("kind", "comparison")}
          title="Comparing ways of doing something"
          detail="A demonstration or on-farm comparison — two ways of doing something, or several. Record what happens under each, and show a neighbour the difference. No replication, no statistics."
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
          <span className="mt-1 block text-sm font-normal text-ink-soft">
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
      <CardTitle>What are you comparing?</CardTitle>
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
        <span className="mt-1 block text-sm font-normal text-ink-soft">
          The control — what everything else is measured against.
        </span>
      </label>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">What are you trying instead?</legend>
        {answers.alternatives.map((entry, index) => (
          <div key={index} className="flex items-end gap-2">
            <input
              value={entry}
              aria-label={`${word} ${index + 1}`}
              onChange={(event) => update(index, event.target.value)}
              placeholder={index === 0 ? "e.g. Wide spacing" : "Another one"}
              className={inputClass}
            />
            {answers.alternatives.length > 1 ? (
              <button
                type="button"
                aria-label={`Remove ${word} ${index + 1}`}
                onClick={() =>
                  set(
                    "alternatives",
                    answers.alternatives.filter((_, position) => position !== index),
                  )
                }
                className="mt-1 min-h-11 min-w-11 rounded-lg border border-line-strong"
              >
                ✕
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          onClick={() => set("alternatives", [...answers.alternatives, ""])}
          className="mt-2 min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
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
      <CardTitle>Where does it run?</CardTitle>
      <p className="mt-1 text-sm text-ink-soft">
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
  const [picking, setPicking] = useState(false);
  const update = (index: number, changes: Partial<Question>) =>
    set(
      "questions",
      answers.questions.map((question, position) =>
        position === index ? { ...question, ...changes } : question,
      ),
    );

  const remove = (index: number) => {
    set("questions", answers.questions.filter((_, position) => position !== index));
    if (answers.responseIndex === index) set("responseIndex", null);
    else if (answers.responseIndex !== null && answers.responseIndex > index) {
      set("responseIndex", answers.responseIndex - 1);
    }
  };

  return (
    <Card>
      <CardTitle>What gets recorded in the field?</CardTitle>
      <p className="mt-1 text-sm text-ink-soft">
        Rename anything, change what it asks for, or add your own. A trial measuring tuber
        counts or a disease score says so here rather than settling for the nearest
        offered word.
      </p>

      {picking ? (
        <div className="mt-3">
          <MeasurementPicker
            onCancel={() => setPicking(false)}
            onFreeText={() => {
              setPicking(false);
              set("questions", [
                ...answers.questions,
                { label: "", type: "number", unit: "", required: false },
              ]);
            }}
            onPick={(entry) => {
              setPicking(false);
              // Everything the entry knows comes across, so nobody decides
              // again whether yield is kilograms or tonnes per hectare.
              set("questions", [
                ...answers.questions,
                {
                  label: entry.label,
                  type: entry.type,
                  unit: entry.unit,
                  required: false,
                },
              ]);
            }}
          />
        </div>
      ) : null}

      <ul className="mt-3 space-y-3">
        {answers.questions.map((question, index) => {
          const wantsUnit =
            RECORD_TYPES.find((entry) => entry.value === question.type)?.wantsUnit ?? false;
          return (
            <li
              key={index}
              className="rounded-lg border border-line p-3"
            >
              <div className="flex items-end gap-2">
                <label className="flex-1 text-sm font-medium">
                  What are you recording?
                  <input
                    value={question.label}
                    aria-label={`What are you recording, ${index + 1}`}
                    onChange={(event) => update(index, { label: event.target.value })}
                    className={inputClass}
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Remove item ${index + 1}`}
                  onClick={() => remove(index)}
                  className="mt-1 min-h-11 min-w-11 rounded-lg border border-line-strong"
                >
                  ✕
                </button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Recorded as
                  <select
                    value={question.type}
                    aria-label={`Recorded as, item ${index + 1}`}
                    onChange={(event) =>
                      update(index, { type: event.target.value as FieldType })
                    }
                    className={inputClass}
                  >
                    {RECORD_TYPES.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
                {wantsUnit ? (
                  <label className="text-sm font-medium">
                    Unit
                    <input
                      value={question.unit}
                      aria-label={`Unit for item ${index + 1}`}
                      onChange={(event) => update(index, { unit: event.target.value })}
                      placeholder="kg, t, cm, count…"
                      className={inputClass}
                    />
                    <span className="mt-1 block text-sm font-normal text-ink-soft">
                      kg or t lets the app work out tonnes per hectare.
                    </span>
                  </label>
                ) : null}
              </div>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={question.required}
                  onChange={(event) => update(index, { required: event.target.checked })}
                  className="size-4"
                />
                Must be answered
              </label>
              {answers.kind === "experiment" && canBeResponse(question) ? (
                <label className="mt-1 flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="response"
                    checked={answers.responseIndex === index}
                    onChange={() => set("responseIndex", index)}
                    className="size-4"
                  />
                  This is the number the trial is comparing
                </label>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
        >
          + Add something to record
        </button>
        {answers.questions.length === 0 ? (
          <button
            type="button"
            onClick={() => set("questions", starterQuestions())}
            className="min-h-11 px-3 py-2.5 font-medium text-primary underline dark:text-primary-soft"
          >
            Start from the usual three
          </button>
        ) : null}
      </div>
    </Card>
  );
}

/** What will be created, once there is enough to say. */
function Summary({ answers }: { answers: WizardAnswers }) {
  const parsed = toParsedTrial(answers);
  return (
    <Card className="border-accent/50">
      <CardTitle>
        {parsed.name || "Untitled trial"}
      </CardTitle>
      <dl className="mt-3 space-y-3 text-sm">
        <Row label="Design">
          {parsed.design === "replicated"
            ? `Replicated — ${parsed.replicates} blocks, layout generated after this`
            : "Observational comparison"}
        </Row>
        <Row label={parsed.design === "replicated" ? "Treatments" : "Practices"}>
          {parsed.practices.map((practice) => practice.name).join(", ") || "—"}
        </Row>
        <Row label="Site">
          {parsed.sites[0]?.location || "—"}
          {parsed.sites[0]?.region ? `, ${parsed.sites[0].region}` : ""}
        </Row>
        <Row label="Asked in the field">
          {parsed.forms[0].fields.map((entry) => entry.label).join(" · ") || "—"}
        </Row>
        {parsed.design === "replicated" ? (
          <Row label="Comparing">
            {parsed.forms[0].fields.find((entry) => entry.isResponse)?.label ?? "—"}
          </Row>
        ) : null}
      </dl>
      <p className="mt-3 text-sm text-ink-faint">
        This gets you a trial you can record against. Plot size, extra sites, more
        questions and the economics all live on the trial page.
      </p>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2 border-t border-line pt-2">
      <dt className="w-32 shrink-0 font-medium">{label}</dt>
      <dd className="flex-1 text-ink-soft">{children}</dd>
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
        checked ? "border-primary bg-primary/5" : "border-line"
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
        <span className="block text-sm text-ink-soft">{detail}</span>
      </span>
    </label>
  );
}
