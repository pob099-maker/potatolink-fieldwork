// Defining a factorial: the factors, their levels, and what that costs.
//
// The sequence matters and the card follows it. Factors and levels first, the
// combinations built from them, and only then the field design — because a
// factorial arrangement describes how treatments are *combined*, and says
// nothing about how they are laid out. Somebody who thinks choosing
// "factorial" has replaced blocking has been misled by an interface, so the
// layout card stays where it is and this one never mentions randomisation.
//
// The running total is the point of the card as much as the inputs are. Levels
// multiply, so a design goes from sensible to unrunnable in one tap, and it is
// far cheaper to say so while somebody is still typing than after they have
// walked away believing the trial is set up.

import { useMemo, useState } from "react";
import { newId } from "../lib/id";
import { saveFactorial } from "../services/store";
import {
  buildCombinations,
  canBuild,
  describeDesign,
  designLoad,
} from "../services/factorial";
import { Card, CardTitle, ErrorState } from "./ui";
import type { Factor, FactorLevel, Trial } from "../types";

const inputClass =
  "min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 py-2";

const VERDICT_TONE: Record<string, string> = {
  note: "bg-sunk text-ink-soft",
  warn: "bg-warning/15 text-warning",
  blocked: "bg-danger/15 text-danger",
};

export function FactorialDesign({
  trial,
  factors,
  levels,
  layoutLocked,
}: {
  trial: Trial;
  factors: Factor[];
  levels: FactorLevel[];
  layoutLocked: boolean;
}) {
  const [draftFactors, setDraftFactors] = useState<Factor[]>(factors);
  const [draftLevels, setDraftLevels] = useState<FactorLevel[]>(levels);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const combinations = useMemo(
    () => buildCombinations(draftFactors, draftLevels),
    [draftFactors, draftLevels],
  );

  const levelsPer = draftFactors.map(
    (factor) => draftLevels.filter((level) => level.factorId === factor.factorId).length,
  );

  const load = designLoad({
    combinations: combinations.length,
    replicates: trial.replicates,
    blocking: trial.blocking,
  });

  const dirty =
    JSON.stringify(draftFactors) !== JSON.stringify(factors) ||
    JSON.stringify(draftLevels) !== JSON.stringify(levels);

  function addFactor(): void {
    setDraftFactors([
      ...draftFactors,
      {
        factorId: newId(),
        trialId: trial.trialId,
        name: "",
        code: "",
        sortOrder: draftFactors.length,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  function addLevel(factorId: string): void {
    const mine = draftLevels.filter((level) => level.factorId === factorId);
    setDraftLevels([
      ...draftLevels,
      {
        levelId: newId(),
        factorId,
        label: "",
        numericValue: null,
        sortOrder: mine.length,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    setSaved(null);
    const result = await saveFactorial({
      trialId: trial.trialId,
      factors: draftFactors.filter((factor) => factor.name.trim()),
      levels: draftLevels.filter((level) => level.label.trim()),
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSaved(`${result.data} treatment combinations built.`);
  }

  return (
    <Card tone="quiet">
      <CardTitle>Factors</CardTitle>
      <p className="mt-1 text-sm text-ink-soft">
        A factorial trial compares every combination of every level. Set the factors here;
        the field layout is a separate choice, made below.
      </p>

      {layoutLocked ? (
        <p className="mt-3 rounded-lg bg-sunk p-3 text-sm text-ink-soft">
          Something has been recorded against this trial, so the combinations are frozen.
          Changing them now would re-label every record already taken.
        </p>
      ) : null}

      <div className="mt-3 flex flex-col gap-3">
        {draftFactors.map((factor, index) => {
          const mine = draftLevels
            .filter((level) => level.factorId === factor.factorId)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          return (
            <fieldset key={factor.factorId} className="rounded-lg border border-line p-3">
              <legend className="text-sm font-medium">Factor {index + 1}</legend>
              <div className="flex flex-wrap gap-2">
                <label className="flex-1 text-sm font-medium">
                  What is being varied?
                  <input
                    value={factor.name}
                    disabled={layoutLocked}
                    placeholder="e.g. Nitrogen rate"
                    onChange={(event) =>
                      setDraftFactors(
                        draftFactors.map((entry) =>
                          entry.factorId === factor.factorId
                            ? { ...entry, name: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    className={inputClass}
                  />
                </label>
                <label className="w-24 text-sm font-medium">
                  Short
                  <input
                    value={factor.code}
                    disabled={layoutLocked}
                    placeholder="N"
                    aria-label={`Short name for factor ${index + 1}`}
                    onChange={(event) =>
                      setDraftFactors(
                        draftFactors.map((entry) =>
                          entry.factorId === factor.factorId
                            ? { ...entry, code: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    className={inputClass}
                  />
                </label>
              </div>

              <p className="mt-3 text-sm font-medium">Its levels</p>
              <ul className="mt-1 flex flex-col gap-2">
                {mine.map((level, levelIndex) => (
                  <li key={level.levelId} className="flex items-end gap-2">
                    <label className="flex-1 text-sm">
                      <span className="sr-only">
                        Level {levelIndex + 1} of factor {index + 1}
                      </span>
                      <input
                        value={level.label}
                        disabled={layoutLocked}
                        placeholder="e.g. Standard"
                        onChange={(event) =>
                          setDraftLevels(
                            draftLevels.map((entry) =>
                              entry.levelId === level.levelId
                                ? { ...entry, label: event.target.value }
                                : entry,
                            ),
                          )
                        }
                        className={inputClass}
                      />
                    </label>
                    <label className="w-28 text-sm">
                      <span className="sr-only">
                        Numeric value for level {levelIndex + 1} of factor {index + 1}
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={level.numericValue ?? ""}
                        disabled={layoutLocked}
                        placeholder="rate"
                        title="The level as a number, where it is one — 80, 160. Leave blank for a variety."
                        onChange={(event) =>
                          setDraftLevels(
                            draftLevels.map((entry) =>
                              entry.levelId === level.levelId
                                ? {
                                    ...entry,
                                    numericValue:
                                      event.target.value === "" ? null : Number(event.target.value),
                                  }
                                : entry,
                            ),
                          )
                        }
                        className={inputClass}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={layoutLocked}
                      aria-label={`Remove level ${levelIndex + 1} of factor ${index + 1}`}
                      onClick={() =>
                        setDraftLevels(draftLevels.filter((entry) => entry.levelId !== level.levelId))
                      }
                      className="min-h-11 min-w-11 rounded-lg border border-line-strong"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={layoutLocked}
                  onClick={() => addLevel(factor.factorId)}
                  className="min-h-11 rounded-lg border border-line-strong px-3 font-medium"
                >
                  + Add a level
                </button>
                <button
                  type="button"
                  disabled={layoutLocked}
                  onClick={() => {
                    setDraftFactors(draftFactors.filter((entry) => entry.factorId !== factor.factorId));
                    setDraftLevels(draftLevels.filter((entry) => entry.factorId !== factor.factorId));
                  }}
                  className="min-h-11 rounded-lg border border-danger/40 px-3 font-medium text-danger"
                >
                  Remove this factor
                </button>
              </div>
            </fieldset>
          );
        })}
      </div>

      <button
        type="button"
        disabled={layoutLocked}
        onClick={addFactor}
        className="mt-3 min-h-11 w-full rounded-lg border border-dashed border-line-strong px-4 py-2.5 font-medium text-ink-soft"
      >
        + Add a factor
      </button>

      {combinations.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm">
            <strong>
              {describeDesign(levelsPer)} — {combinations.length} treatment combinations
            </strong>
            {trial.replicates > 0 ? `, ${load.totalPlots} plots at ${trial.replicates} replicates` : ""}
            .
          </p>
          {/* The running total is the point: levels multiply, so a design goes
              from sensible to unrunnable in a single tap. */}
          {load.message ? (
            <p className={`mt-2 rounded-lg p-3 text-sm ${VERDICT_TONE[load.verdict] ?? ""}`}>
              {load.message}
            </p>
          ) : null}

          <details className="group mt-2 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium">
              <span aria-hidden className="text-ink-faint transition-transform group-open:rotate-90">
                ▸
              </span>
              What the combinations are
            </summary>
            <ul className="mt-1 flex flex-col gap-1 text-sm text-ink-soft">
              {combinations.map((combination) => (
                <li key={combination.combinationId}>{combination.label}</li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}

      {error ? <ErrorState message={error} /> : null}
      {saved ? <p className="mt-3 rounded-lg bg-success/15 p-3 text-sm text-success">{saved}</p> : null}

      {dirty && !layoutLocked ? (
        <button
          type="button"
          disabled={saving || !canBuild(load) || combinations.length === 0}
          onClick={() => void save()}
          className="mt-3 min-h-11 w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-white disabled:opacity-60"
        >
          {saving ? "Building…" : `Build ${combinations.length} combinations`}
        </button>
      ) : null}
    </Card>
  );
}
