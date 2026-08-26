// The plot layout for a designed trial: how the treatments are arranged in the
// field, and the fieldbook that comes off it.
//
// This is the piece that turns "we recorded some observations" into "we ran a
// designed experiment". Before it, a replicate was a number somebody picked
// off a list, with nothing saying which treatment belonged where — so nothing
// stopped a slope or a drainage line lining up with a treatment and being read
// as its effect.
//
// One arrangement per site. A trial at two sites is two separate pieces of
// ground; giving them a single layout meant the same treatment landed in the
// same relative position at both, so anything the two paddocks share was
// confounded identically at each.

import { useMemo, useState } from "react";
import { saveTrial } from "../services/store";
import {
  buildFieldbookCsv,
  generateLayout,
  isBalanced,
  layoutProblem,
  newSeed,
  type LayoutDesign,
  type PlotAssignment,
} from "../services/layout";
import { downloadCsv } from "../services/export";
import { words } from "../services/vocabulary";
import { Card, CardTitle, ErrorState } from "./ui";
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
  "border-ink/40 bg-ink/10",
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

  const design: LayoutDesign = trial.blocking === "blocks" ? "rcb" : "crd";
  const seed = trial.layoutSeed ?? "";
  const problem = layoutProblem({ design, arms, replicates: trial.replicates, seed });

  // One arrangement per site, each independently randomised from the one seed.
  const sections = useMemo(
    () =>
      sites.map((site) => ({
        site,
        plots: generateLayout({
          design,
          arms,
          replicates: trial.replicates,
          seed,
          siteId: site.siteId,
        }),
      })),
    [sites, design, arms, trial.replicates, seed],
  );

  // Only a replicated trial has plots to arrange.
  if (trial.design !== "replicated") return null;

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

  const totalPlots = sections.reduce((sum, section) => sum + section.plots.length, 0);

  return (
    <Card>
      <CardTitle>Plot layout</CardTitle>
      <p className="mt-1 text-sm text-ink-soft">
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

      {sites.length === 0 ? (
        <p className="mt-3 rounded-lg bg-warning/15 p-3 text-sm text-warning">
          Add a site first. Plots belong to a piece of ground, and each site is arranged
          separately.
        </p>
      ) : problem ? (
        <p className="mt-3 rounded-lg bg-warning/15 p-3 text-sm text-warning">
          {problem.message}
        </p>
      ) : trial.layoutSeed ? (
        <div className="mt-3 space-y-4">
          <p className="text-sm text-ink-soft">
            {totalPlots} plots across {sites.length}{" "}
            {sites.length === 1 ? "site" : "sites"} · seed{" "}
            <span className="font-mono font-medium">{seed}</span>
          </p>

          {sections.map((section) => (
            <SiteLayout
              key={section.site.siteId}
              siteName={section.site.location}
              showSiteName={sites.length > 1}
              plots={section.plots}
              arms={arms}
              design={design}
              word={word}
            />
          ))}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  `fieldbook-${seed}.csv`,
                  buildFieldbookCsv(
                    trial.name,
                    sections.map((section) => ({
                      siteName: section.site.location,
                      plots: section.plots,
                    })),
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
                onClick={() => void generate()}
                disabled={busy}
                className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium disabled:opacity-60"
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

          <p className="text-sm text-ink-faint">
            Keep the seed with the trial records. It regenerates every site's arrangement
            exactly, which is how anyone else can check it. Randomising again, or changing
            the {word.many}, produces a different one — so do it before the trial goes in,
            not after.
          </p>
        </div>
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
        checked ? "border-primary bg-primary/5" : "border-line"
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
        <span className="block text-sm text-ink-soft">{detail}</span>
      </span>
    </label>
  );
}

function SiteLayout({
  siteName,
  showSiteName,
  plots,
  arms,
  design,
  word,
}: {
  siteName: string;
  showSiteName: boolean;
  plots: PlotAssignment[];
  arms: PracticeArm[];
  design: LayoutDesign;
  word: Words;
}) {
  const sorted = [...arms].sort((a, b) => a.sortOrder - b.sortOrder);
  const tint = (armId: string) =>
    TREATMENT_TINTS[
      Math.max(0, sorted.findIndex((arm) => arm.armId === armId)) % TREATMENT_TINTS.length
    ];
  const armName = (armId: string) => arms.find((arm) => arm.armId === armId)?.name ?? armId;
  const blocks = [...new Set(plots.map((plot) => plot.block))];

  return (
    <div>
      {showSiteName ? (
        <h3 className="font-semibold">📍 {siteName}</h3>
      ) : null}
      {isBalanced(plots) ? null : (
        <p className="text-sm text-warning">{word.many} are not evenly replicated here.</p>
      )}
      {blocks.map((block) => (
        <div key={block} className="mt-1">
          {design === "rcb" ? (
            <h4 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
              Block {block}
            </h4>
          ) : null}
          <ol className="mt-1 flex flex-wrap gap-2">
            {plots
              .filter((plot) => plot.block === block)
              .map((plot) => (
                <li
                  key={plot.plotNumber}
                  className={`min-w-24 rounded-lg border-l-4 px-3 py-2 text-sm text-ink ${tint(plot.armId)}`}
                >
                  <span className="block text-meta opacity-70">Plot {plot.plotNumber}</span>
                  <span className="block font-medium">{armName(plot.armId)}</span>
                </li>
              ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
