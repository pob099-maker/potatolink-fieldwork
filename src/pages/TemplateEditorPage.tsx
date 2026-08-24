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
import { Card, EmptyState, ErrorState, PageTitle, Skeleton } from "../components/ui";
import type { FieldType, FormField, FormTemplate } from "../types";

const inputClass =
  "w-full min-h-11 rounded-lg border border-ink/20 bg-surface px-3 py-2 " +
  "focus:border-primary focus:outline-none dark:border-ink-dark/20 dark:bg-surface-dark";

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
    const result = await saveTemplate(draft);
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
        <p className="mt-1 text-ink/60 dark:text-ink-dark/60">
          {trial.name} · {draft.name}
          {stored.frequency ? ` · ${stored.frequency}` : ""}
        </p>
        <p className="mt-1 text-sm text-ink/50 dark:text-ink-dark/50">
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
      </Card>

      {draft.fields.map((field, index) => (
        <Card key={field.fieldName} className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ink/50 dark:text-ink-dark/50">
              Question {index + 1} of {draft.fields.length}
            </span>
            <span className="flex gap-1">
              <button
                type="button"
                aria-label={`Move question ${index + 1} up`}
                disabled={index === 0}
                onClick={() => setDraft({ ...draft, fields: moveField(draft.fields, index, -1) })}
                className="min-h-11 min-w-11 rounded-lg border border-ink/15 disabled:opacity-30 dark:border-ink-dark/15"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move question ${index + 1} down`}
                disabled={index === draft.fields.length - 1}
                onClick={() => setDraft({ ...draft, fields: moveField(draft.fields, index, 1) })}
                className="min-h-11 min-w-11 rounded-lg border border-ink/15 disabled:opacity-30 dark:border-ink-dark/15"
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
              <p className="mt-1 text-xs text-ink/50 dark:text-ink-dark/50">
                {FIELD_TYPE_HELP.find((help) => help.type === field.type)?.hint}
              </p>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex min-h-11 items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(changeEvent) =>
                    updateField(index, { required: changeEvent.target.checked })
                  }
                  className="size-5 accent-primary"
                />
                Answer required
              </label>
            </div>
          </div>

          {field.type === "number" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor={`unit-${index}`} className="mb-1 block text-sm font-medium">
                  Unit (optional)
                </label>
                <input
                  id={`unit-${index}`}
                  className={inputClass}
                  placeholder="t, hours, km/h…"
                  value={field.unit ?? ""}
                  onChange={(changeEvent) =>
                    updateField(index, { unit: changeEvent.target.value || null })
                  }
                />
              </div>
              <MinMaxInput field={field} index={index} updateField={updateField} />
            </div>
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
              blankField("New question", takenNames, draft.fields.length),
            ],
          })
        }
        className="min-h-11 w-full rounded-lg border border-dashed border-ink/30 font-medium text-ink/70 dark:border-ink-dark/30 dark:text-ink-dark/70"
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
          className="min-h-11 flex-1 rounded-lg border border-ink/20 px-4 py-2.5 text-center font-medium dark:border-ink-dark/20"
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
