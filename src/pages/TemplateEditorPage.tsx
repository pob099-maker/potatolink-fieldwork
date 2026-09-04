import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { saveTemplate } from "../services/store";
import {
  blankField,
  FIELD_TYPE_HELP,
  hasOptions,
  moveField,
  normaliseField,
} from "../services/templates";
import { useTemplates, useTrials } from "../hooks/useCollections";
import { computeValue, formulaProblems, parseFormula } from "../services/formula";
import { UnitPicker } from "../components/UnitPicker";
import { Card, EmptyState, ErrorState, PageTitle, Skeleton } from "../components/ui";
import type { FieldType, FormField, FormTemplate } from "../types";

const inputClass =
  "w-full min-h-11 rounded-lg border border-line-strong bg-surface px-3 py-2 " +
  "focus:border-primary";

export function TemplateEditorPage() {
  const { trialId } = useParams<{ trialId: string }>();
  const [searchParams] = useSearchParams();
  const trials = useTrials();
  const templates = useTemplates();

  const trial = trials.data?.find((candidate) => candidate.trialId === trialId);
  const trialTemplates = (templates.data ?? []).filter(
    (candidate) => candidate.trialId === trialId,
  );
  // Which form to edit: named by the link, else the grower form.
  const stored =
    trialTemplates.find((candidate) => candidate.templateId === searchParams.get("form")) ??
    trialTemplates.find((candidate) => candidate.audience === "grower") ??
    trialTemplates[0];

  const [draft, setDraft] = useState<FormTemplate | null>(null);
  const [status, setStatus] = useState<{ kind: "saved" | "error"; message: string } | null>(
    null,
  );

  useEffect(() => {
    if (stored && !draft) setDraft(structuredClone(stored));
  }, [stored, draft]);

  if (trials.isPending || templates.isPending) {
    return (
      <Card>
        <Skeleton lines={8} />
      </Card>
    );
  }

  if (!trial || !stored) {
    return (
      <EmptyState
        message="This trial has no entry form to edit yet."
        action={{ label: "Back to trials", to: "/trials" }}
      />
    );
  }

  if (!draft) return null;

  const takenNames = draft.fields.map((field) => field.fieldName);

  function updateField(index: number, changes: Partial<FormField>): void {
    setDraft((current) => {
      if (!current) return current;
      const fields = current.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...changes } : field,
      );
      return { ...current, fields };
    });
    setStatus(null);
  }

  function changeType(index: number, type: FieldType): void {
    setDraft((current) => {
      if (!current) return current;
      const fields = current.fields.map((field, fieldIndex) =>
        fieldIndex === index ? normaliseField(field, type) : field,
      );
      return { ...current, fields };
    });
    setStatus(null);
  }

  async function onSave(): Promise<void> {
    if (!draft) return;
    // A ticked box with the word rubbed out is not a grouping, whatever the
    // checkbox looks like. Saving "" would leave a form that groups on nothing.
    const result = await saveTemplate({
      ...draft,
      groupsBy: draft.groupsBy?.trim() ? draft.groupsBy.trim() : undefined,
    });
    setStatus(
      result.success
        ? { kind: "saved", message: "Form saved. Anyone recording sees the change immediately." }
        : { kind: "error", message: result.error },
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <PageTitle>Edit form</PageTitle>
        <p className="mt-1 text-ink-soft">
          {trial.name} · {draft.name}
          {stored.frequency ? ` · ${stored.frequency}` : ""}
        </p>
        <p className="mt-1 text-sm text-ink-faint">
          Filled in {stored.audience === "staff" ? "by staff" : "on site"}.
        </p>
      </div>

      <Card>
        <label htmlFor="template-name" className="mb-1.5 block font-medium">
          Form name
        </label>
        <input
          id="template-name"
          className={inputClass}
          value={draft.name}
          onChange={(changeEvent) => {
            setDraft({ ...draft, name: changeEvent.target.value });
            setStatus(null);
          }}
        />

        {/* Honest about its own reach. Reads are open — the entry form has to
            load its trial before anybody has signed in — so this cannot
            restrict who sees a row, and implying otherwise would be worse than
            not offering it: somebody would type a contract price believing the
            app was protecting it. */}
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.commerciallySensitive ?? false}
            onChange={(changeEvent) => {
              setDraft({ ...draft, commerciallySensitive: changeEvent.target.checked });
              setStatus(null);
            }}
            className="mt-0.5 size-4"
          />
          <span>
            <span className="font-medium">Commercially sensitive</span>
            <span className="mt-1 block text-ink-soft">
              Costs, prices, contract terms. Marks the form on screen and adds a column
              to the export, so a file going to a third party can be recognised. It is a
              label, not a lock — it does not restrict who can open the form.
            </span>
          </span>
        </label>

        {/* Asked as a question about the work, not as a setting. Whether a
            form takes subsamples is something the person setting up the trial
            knows without being taught a word for it — and if they are not
            asked, three samples off one run arrive as three observations and
            the standard error comes out too small by roughly √3. That is the
            worst kind of wrong: a confident number nobody has reason to
            doubt. */}
        <div className="mt-4 border-t border-line pt-4">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.groupsBy !== undefined}
              onChange={(changeEvent) => {
                setDraft({
                  ...draft,
                  groupsBy: changeEvent.target.checked ? "run" : undefined,
                });
                setStatus(null);
              }}
              className="mt-0.5 size-4"
            />
            <span>
              <span className="font-medium">
                Several samples can come from the same one thing
              </span>
              <span className="mt-1 block text-ink-soft">
                Tick this if more than one sample is taken from a single run, batch, load
                or visit. Three samples off one grading run are one measurement of that
                run, not three &mdash; and counted as three they make the result look more
                certain than it is.
              </span>
            </span>
          </label>

          {draft.groupsBy !== undefined ? (
            <div className="mt-3 pl-6">
              <label htmlFor="groups-by" className="mb-1 block text-sm font-medium">
                What do you call that one thing?
              </label>
              <input
                id="groups-by"
                className={inputClass}
                value={draft.groupsBy}
                placeholder="run"
                onChange={(changeEvent) => {
                  setDraft({ ...draft, groupsBy: changeEvent.target.value });
                  setStatus(null);
                }}
              />
              <p className="mt-1 text-sm text-ink-soft">
                One word, lower case &mdash; run, batch, load, visit. Whoever records is
                asked &ldquo;Which {draft.groupsBy.trim() || "run"}?&rdquo; before the
                questions, and everything they enter under the same number is averaged
                together.
              </p>
            </div>
          ) : null}
        </div>
      </Card>

      {draft.fields.map((field, index) => (
        <Card key={field.fieldName} className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ink-faint">
              Question {index + 1} of {draft.fields.length}
            </span>
            <span className="flex gap-1">
              <button
                type="button"
                aria-label={`Move question ${index + 1} up`}
                disabled={index === 0}
                onClick={() => setDraft({ ...draft, fields: moveField(draft.fields, index, -1) })}
                className="min-h-11 min-w-11 rounded-lg border border-line disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move question ${index + 1} down`}
                disabled={index === draft.fields.length - 1}
                onClick={() => setDraft({ ...draft, fields: moveField(draft.fields, index, 1) })}
                className="min-h-11 min-w-11 rounded-lg border border-line disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Remove question ${index + 1}`}
                onClick={() =>
                  setDraft({
                    ...draft,
                    fields: draft.fields
                      .filter((_, fieldIndex) => fieldIndex !== index)
                      .map((remaining, order) => ({ ...remaining, displayOrder: order })),
                  })
                }
                className="min-h-11 min-w-11 rounded-lg border border-danger/40 text-danger"
              >
                ✕
              </button>
            </span>
          </div>

          <div>
            <label htmlFor={`label-${index}`} className="mb-1 block text-sm font-medium">
              Question shown to the person filling it in
            </label>
            <input
              id={`label-${index}`}
              className={inputClass}
              value={field.label}
              onChange={(changeEvent) => updateField(index, { label: changeEvent.target.value })}
            />
          </div>

          <div>
            <label htmlFor={`guidance-${index}`} className="mb-1 block text-sm font-medium">
              Note for whoever records it (optional)
            </label>
            <input
              id={`guidance-${index}`}
              className={inputClass}
              placeholder="e.g. weigh before grading"
              value={field.guidance ?? ""}
              onChange={(changeEvent) =>
                updateField(index, { guidance: changeEvent.target.value })
              }
            />
            <p className="mt-1 text-sm text-ink-soft">
              Shown under the question in the field, always — not hidden behind a tap.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`type-${index}`} className="mb-1 block text-sm font-medium">
                Answer type
              </label>
              <select
                id={`type-${index}`}
                className={inputClass}
                value={field.type}
                onChange={(changeEvent) => changeType(index, changeEvent.target.value as FieldType)}
              >
                {FIELD_TYPE_HELP.map((help) => (
                  <option key={help.type} value={help.type}>
                    {help.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-meta text-ink-faint">
                {FIELD_TYPE_HELP.find((help) => help.type === field.type)?.hint}
              </p>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex min-h-11 items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={field.required && !field.formula?.trim()}
                  disabled={Boolean(field.formula?.trim())}
                  onChange={(changeEvent) =>
                    updateField(index, { required: changeEvent.target.checked })
                  }
                  className="size-5 accent-primary disabled:opacity-40"
                />
                {field.formula?.trim() ? "Worked out, not typed" : "Answer required"}
              </label>
            </div>
          </div>

          {field.type === "number" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <UnitPicker
                  id={`unit-${index}`}
                  label="Unit (optional)"
                  value={field.unit ?? ""}
                  onChange={(unit) => updateField(index, { unit: unit || null })}
                />
                <MinMaxInput field={field} index={index} updateField={updateField} />
              </div>
              <FormulaEditor
                field={field}
                index={index}
                others={draft.fields.filter(
                  (candidate) =>
                    candidate.fieldName !== field.fieldName && candidate.type === "number",
                )}
                updateField={updateField}
              />
            </>
          ) : null}

          {field.type === "slider" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <MinMaxInput field={field} index={index} updateField={updateField} />
            </div>
          ) : null}

          {hasOptions(field.type) ? (
            <div>
              <label htmlFor={`options-${index}`} className="mb-1 block text-sm font-medium">
                Choices (one per line)
              </label>
              <textarea
                id={`options-${index}`}
                rows={4}
                className={inputClass}
                value={(field.options ?? []).join("\n")}
                onChange={(changeEvent) =>
                  updateField(index, {
                    options: changeEvent.target.value
                      .split("\n")
                      .map((option) => option.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          ) : null}
        </Card>
      ))}

      <button
        type="button"
        onClick={() =>
          setDraft({
            ...draft,
            fields: [
              ...draft.fields,
              blankField("New item", takenNames, draft.fields.length),
            ],
          })
        }
        className="min-h-11 w-full rounded-lg border border-dashed border-line-strong font-medium text-ink-soft"
      >
        + Add a question
      </button>

      {status?.kind === "error" ? <ErrorState message={status.message} /> : null}
      {status?.kind === "saved" ? (
        <p role="status" className="rounded-lg bg-success/10 p-3 font-medium text-success">
          {status.message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Link
          to={`/trials/${trial.trialId}`}
          className="min-h-11 flex-1 rounded-lg border border-line-strong px-4 py-2.5 text-center font-medium"
        >
          Back to trial
        </Link>
        <button
          type="button"
          onClick={() => void onSave()}
          className="min-h-11 flex-1 rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
        >
          Save form
        </button>
      </div>
    </div>
  );
}

/**
 * Setting up a number the app works out rather than somebody typing it.
 *
 * Offered as a plain alternative to typing, because that is what it is from
 * where the designer sits: either a person measures this or the app works it
 * out from things they did measure. Percentages, efficiencies and rates per
 * hour are all the second kind, and every one of them was previously being
 * done by hand on a docket after the fact — or, more often, not at all.
 *
 * The question names go in by tapping, not by typing. Nobody should have to
 * know that "Clods in" is stored as `clodsIn`, and a name typed from memory is
 * a formula that silently reads a blank.
 */
function FormulaEditor({
  field,
  index,
  others,
  updateField,
}: {
  field: FormField;
  index: number;
  others: FormField[];
  updateField: (index: number, changes: Partial<FormField>) => void;
}) {
  const source = field.formula ?? "";
  const on = source.trim().length > 0 || field.formula !== undefined;
  const problems = on && source.trim() ? formulaProblems(source, others, field.fieldName) : [];
  const preview = on && problems.length === 0 ? exampleValue(source, others) : null;

  return (
    <div className="rounded-lg border border-line bg-sunk/60 p-3">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={on}
          onChange={(changeEvent) =>
            updateField(index, {
              formula: changeEvent.target.checked ? "" : undefined,
              required: changeEvent.target.checked ? false : field.required,
            })
          }
          className="mt-0.5 size-4"
        />
        <span>
          <span className="font-medium">Work this out from other answers</span>
          <span className="mt-1 block text-ink-soft">
            For a number nobody measures directly &mdash; a percentage, an efficiency, a
            rate per hour. It fills itself in as the form is answered, and saves and
            exports like any other number.
          </span>
        </span>
      </label>

      {on ? (
        <div className="mt-3">
          {others.length === 0 ? (
            <p className="text-sm text-ink-soft">
              There are no other number questions on this form yet. Add the ones this is
              worked out from first.
            </p>
          ) : (
            <>
              <label htmlFor={`formula-${index}`} className="mb-1 block text-sm font-medium">
                The sum
              </label>
              <input
                id={`formula-${index}`}
                className={`${inputClass} font-mono text-sm`}
                placeholder="clodsIn - clodsOut"
                value={source}
                onChange={(changeEvent) =>
                  updateField(index, { formula: changeEvent.target.value })
                }
              />

              <p className="mt-2 text-sm text-ink-soft">Tap a question to add it:</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {others.map((other) => (
                  <button
                    key={other.fieldName}
                    type="button"
                    onClick={() =>
                      updateField(index, {
                        formula: `${source}${source && !source.endsWith(" ") ? " " : ""}${other.fieldName}`,
                      })
                    }
                    className="min-h-11 rounded-lg border border-line-strong px-3 py-1.5 text-sm"
                  >
                    {other.label}
                  </button>
                ))}
                {["+", "-", "*", "/", "(", ")", "100"].map((symbol) => (
                  <button
                    key={symbol}
                    type="button"
                    onClick={() =>
                      updateField(index, {
                        formula: `${source}${source && !source.endsWith(" ") ? " " : ""}${symbol}`,
                      })
                    }
                    className="min-h-11 min-w-11 rounded-lg border border-line px-3 py-1.5 font-mono text-sm"
                  >
                    {symbol}
                  </button>
                ))}
              </div>

              {problems.length > 0 ? (
                <p role="alert" className="mt-2 text-sm text-danger">
                  {problems[0]}
                </p>
              ) : preview ? (
                <p className="mt-2 text-sm text-ink-soft">
                  Checks out. {preview}
                </p>
              ) : source.trim() ? (
                <p className="mt-2 text-sm text-ink-soft">Checks out.</p>
              ) : (
                <p className="mt-2 text-sm text-ink-soft">
                  Arithmetic over the questions above &mdash; for example{" "}
                  <span className="font-mono">
                    ({others[0]?.fieldName ?? "a"} - {others[1]?.fieldName ?? "b"}) /{" "}
                    {others[0]?.fieldName ?? "a"} * 100
                  </span>
                  .
                </p>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A worked example, so the sum can be checked before anybody drives anywhere.
 *
 * A formula that parses can still be the wrong formula, and the cheapest way
 * to notice is to see what it does to made-up numbers. Ones and twos rather
 * than round tens, because 10 and 100 hide a swapped multiply and divide.
 */
function exampleValue(source: string, others: FormField[]): string | null {
  const values: Record<string, number> = {};
  others.forEach((other, position) => {
    values[other.fieldName] = position + 2;
  });
  const parsed = parseFormula(source);
  if (!parsed.ok) return null;
  const answer = computeValue(source, values);
  if (answer === null) return null;
  // Only the questions the sum actually reads. Listing the first three on the
  // form would name inputs it never touches and leave out ones it does, which
  // is worse than no example — it would check out against the wrong numbers.
  const inputs = parsed.formula.names
    .map((name) => `${others.find((o) => o.fieldName === name)?.label ?? name} ${values[name]}`)
    .join(", ");
  return `With ${inputs}, this shows ${Number(answer.toFixed(2))}.`;
}

function MinMaxInput({
  field,
  index,
  updateField,
}: {
  field: FormField;
  index: number;
  updateField: (index: number, changes: Partial<FormField>) => void;
}) {
  return (
    <>
      <div>
        <label htmlFor={`min-${index}`} className="mb-1 block text-sm font-medium">
          Lowest allowed
        </label>
        <input
          id={`min-${index}`}
          type="number"
          className={inputClass}
          value={field.min ?? ""}
          onChange={(changeEvent) =>
            updateField(index, {
              min: changeEvent.target.value === "" ? null : Number(changeEvent.target.value),
            })
          }
        />
      </div>
      <div>
        <label htmlFor={`max-${index}`} className="mb-1 block text-sm font-medium">
          Highest allowed
        </label>
        <input
          id={`max-${index}`}
          type="number"
          className={inputClass}
          value={field.max ?? ""}
          onChange={(changeEvent) =>
            updateField(index, {
              max: changeEvent.target.value === "" ? null : Number(changeEvent.target.value),
            })
          }
        />
      </div>
    </>
  );
}
