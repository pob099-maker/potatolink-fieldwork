// The plot layout for a designed trial: how the treatments are arranged in the
// field, and the fieldbook that comes off it.
//
// This is the piece that turns "we recorded some observations" into "we ran a
// designed experiment". Before it, a replicate was a number somebody picked
// off a list, with nothing saying which treatment belonged where — so nothing
// stopped a slope or a drainage line lining up with a treatment and being read
// as its effect.

import { useMemo, useState } from "react";
import { saveTrial } from "../services/store";
import {
  buildFieldbookCsv,
  generateLayout,
  isBalanced,
  layoutProblem,
  newSeed,
  type LayoutDesign,
} from "../services/layout";
import { downloadCsv } from "../services/export";
import { words } from "../services/vocabulary";
import { Card, ErrorState } from "./ui";
import type { Words } from "../services/vocabulary";
import type { PracticeArm, Site, Trial } from "../types";

// Enough hues to tell treatments apart, in the brand's register. The hue is
// carried by a keyline and a wash, never by the text — the darker tokens
// (success, danger) are close to unreadable on the dark ground, so plot labels
// stay in plain ink and the colour does its work behind them.
const TREATMENT_TINTS = [
  "border-primary bg-primary/10 dark:border-primary-soft dark:bg-primary-soft/20",
  "border-success bg-success/15 dark:bg-success/35",
  "border-accent bg-accent/25",
  "border-warning bg-warning/20 dark:bg-warning/30",
  "border-danger bg-danger/15 dark:bg-danger/30",
  "border-ink/40 bg-ink/10 dark:border-ink-dark/40 dark:bg-ink-dark/15",
];

export function PlotLayout({
  trial,
  arms,
  sites,
  recorded,
}: {
  trial: Trial;
  arms: PracticeArm[];
  sites: Site[];
  /**
   * How many records are already keyed to a plot here. Re-randomising after
   * that point silently re-labels every one of them — plot 7 was Split N on
   * Tuesday and High N on Wednesday — and nothing in the data would show it
   * happened. So the arrangement freezes at the first record.
   */
  recorded: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const word = words(trial);

  // Only a replicated trial has plots to arrange.
  if (trial.design !== "replicated") return null;

  const design: LayoutDesign = trial.blocking === "blocks" ? "rcb" : "crd";
  const request = { design, arms, replicates: trial.replicates, seed: trial.layoutSeed ?? "" };
  const problem = layoutProblem(request);

  async function setBlocking(next: "none" | "blocks"): Promise<void> {
    setBusy(true);
    setError(null);
    // The arrangement changes, so any existing layout no longer describes the
    // field. Clearing the seed says so rather than showing a stale map.
    const result = await saveTrial({ ...trial, blocking: next, layoutSeed: null });
    setBusy(false);
    if (!result.success) setError(result.error);
  }

  async function generate(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await saveTrial({ ...trial, layoutSeed: newSeed() });
    setBusy(false);
    if (!result.success) setError(result.error);
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Plot layout</h2>
      <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
        Which {word.one} sits in which plot, decided by chance rather than by whoever holds
        the clipboard — and written down before anyone walks the paddock.
      </p>

      <fieldset className="mt-3">
        <legend className="text-sm font-medium">Arrangement</legend>
        <div className="mt-2 space-y-2">
          <DesignChoice
            checked={trial.blocking === "blocks"}
            disabled={busy || recorded > 0}
            onChoose={() => void setBlocking("blocks")}
            title="Randomised complete block"
            detail={`Each block holds one plot of every ${word.one}, ordered at random within the block. Blocks absorb a known gradient — a slope, a drainage line, a change in soil — so it cannot masquerade as an effect of the ${word.one}. The usual choice for a paddock.`}
          />
          <DesignChoice
            checked={trial.blocking === "none"}
            disabled={busy || recorded > 0}
            onChoose={() => void setBlocking("none")}
            title="Completely randomised"
            detail={`Every plot drawn from one pool, so a ${word.one} can land anywhere. Suits uniform ground, and a glasshouse more than a field.`}
          />
        </div>
      </fieldset>

      {error ? <ErrorState message={error} /> : null}

      {problem ? (
        <p className="mt-3 rounded-lg bg-warning/15 p-3 text-sm text-warning">
          {problem.message}
        </p>
      ) : trial.layoutSeed ? (
        <LayoutMap trial={trial} arms={arms} sites={sites} design={design} busy={busy}
          recorded={recorded} word={word} onRegenerate={() => void generate()} />
      ) : (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy}
            className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white disabled:opacity-60"
          >
            {busy ? "Working…" : "Generate the layout"}
          </button>
        </div>
      )}
    </Card>
  );
}

function DesignChoice({
  checked,
  disabled,
  onChoose,
  title,
  detail,
}: {
  checked: boolean;
  disabled: boolean;
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
        name="blocking"
        checked={checked}
        disabled={disabled}
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

function LayoutMap({
  trial,
  arms,
  sites,
  design,
  busy,
  recorded,
  word,
  onRegenerate,
}: {
  trial: Trial;
  arms: PracticeArm[];
  sites: Site[];
  design: LayoutDesign;
  busy: boolean;
  word: Words;
  recorded: number;
  onRegenerate: () => void;
}) {
  const seed = trial.layoutSeed ?? "";
  const plots = useMemo(
    () => generateLayout({ design, arms, replicates: trial.replicates, seed }),
    [design, arms, trial.replicates, seed],
  );

  const tint = (armId: string) => {
    const index = [...arms].sort((a, b) => a.sortOrder - b.sortOrder)
      .findIndex((arm) => arm.armId === armId);
    return TREATMENT_TINTS[index % TREATMENT_TINTS.length];
  };
  const armName = (armId: string) => arms.find((arm) => arm.armId === armId)?.name ?? armId;
  const blocks = [...new Set(plots.map((plot) => plot.block))];

  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-ink/60 dark:text-ink-dark/60">
        {plots.length} plots · {design === "rcb" ? `${blocks.length} blocks` : "one pool"} ·
        seed <span className="font-mono font-medium">{seed}</span>
        {isBalanced(plots) ? null : (
          <span className="text-warning"> · {word.many} are not evenly replicated</span>
        )}
      </p>

      {blocks.map((block) => (
        <div key={block}>
          {design === "rcb" ? (
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50 dark:text-ink-dark/50">
              Block {block}
            </h3>
          ) : null}
          <ol className="mt-1 flex flex-wrap gap-2">
            {plots
              .filter((plot) => plot.block === block)
              .map((plot) => (
                <li
                  key={plot.plotNumber}
                  className={`min-w-24 rounded-lg border-l-4 px-3 py-2 text-sm text-ink dark:text-ink-dark ${tint(plot.armId)}`}
                >
                  <span className="block text-xs opacity-70">Plot {plot.plotNumber}</span>
                  <span className="block font-medium">{armName(plot.armId)}</span>
                </li>
              ))}
          </ol>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            downloadCsv(
              `fieldbook-${seed}.csv`,
              buildFieldbookCsv(
                trial.name,
                sites.length === 1 ? sites[0].location : "",
                plots,
                arms,
                seed,
              ),
            )
          }
          className="min-h-11 rounded-lg border border-primary px-4 py-2.5 font-medium text-primary dark:text-primary-soft"
        >
          Download the fieldbook (CSV)
        </button>
        {recorded === 0 ? (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={busy}
            className="min-h-11 rounded-lg border border-ink/20 px-4 py-2.5 font-medium disabled:opacity-60 dark:border-ink-dark/20"
          >
            Randomise again
          </button>
        ) : null}
      </div>

      {recorded > 0 ? (
        <p className="rounded-lg bg-accent/20 p-3 text-sm">
          This layout is locked. {recorded}{" "}
          {recorded === 1 ? "record has" : "records have"} been taken against it, and
          re-randomising now would quietly re-label every one of them.
        </p>
      ) : null}

      <p className="text-sm text-ink/50 dark:text-ink-dark/50">
        Keep the seed with the trial records. It regenerates this exact layout, which is
        how anyone else can check it. Randomising again, or changing the {word.many},
        produces a different arrangement — so do it before the trial goes in, not after.
      </p>
    </div>
  );
}
