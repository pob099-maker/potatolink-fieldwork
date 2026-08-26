// Factorial treatment structure.
//
// A factorial arrangement is not a kind of trial, and building it as one is
// the mistake this file exists to avoid. It describes how treatments are
// *combined* — every level of every factor crossed with every other — and it
// says nothing about how those treatments are laid out in a paddock. The field
// design is a separate choice: RCB, completely randomised, split-plot. A user
// who thinks "factorial" replaces blocking has been misled by the interface.
//
// So this produces combinations, and the existing layout engine randomises
// them exactly as it randomises any other set of treatments. Nothing here
// touches randomisation.
//
// The other job is telling somebody when their design has grown past what a
// season can actually carry, and doing it before they walk away believing the
// trial is set up.

export interface Factor {
  factorId: string;
  trialId: string;
  name: string;
  /** Short form for plot labels and column headings — "N", "Irr". */
  code: string;
  sortOrder: number;
}

export interface FactorLevel {
  levelId: string;
  factorId: string;
  label: string;
  /**
   * The level as a number where it is one — 0, 80, 160 kg N/ha.
   *
   * Kept apart from the label because a rate is a quantity and "High" is a
   * name, and only one of them can be plotted against a response or used to
   * fit a trend. Null for a genuinely categorical level such as a variety.
   */
  numericValue: number | null;
  sortOrder: number;
}

/** One cell of the factorial: a level chosen from every factor. */
export interface Combination {
  /** Stable within a trial: the level ids in factor order, joined. */
  combinationId: string;
  /** levelId per factorId. */
  members: Record<string, string>;
  /**
   * What somebody standing in the plot reads —
   * "Variety=Moonlight · N=High · Irrigation=Deficit".
   *
   * Denormalised on purpose. A field device should never have to join four
   * tables to tell a contractor what is planted in front of them.
   */
  label: string;
  /** The same thing in short form, for a plot peg or a column heading. */
  shortLabel: string;
  sortOrder: number;
}

const byOrder = <T extends { sortOrder: number }>(a: T, b: T): number => a.sortOrder - b.sortOrder;

/** How many combinations a set of factors produces: the product of the level counts. */
export function combinationCount(levelsPerFactor: number[]): number {
  if (levelsPerFactor.length === 0) return 0;
  if (levelsPerFactor.some((count) => count < 1)) return 0;
  return levelsPerFactor.reduce((total, count) => total * count, 1);
}

/**
 * Every combination of every level, in a stable order.
 *
 * The order is odometer order — the last factor varies fastest — which is how
 * a factorial is written out on paper, so a printed fieldbook and this list
 * agree without anybody having to sort one of them.
 */
export function buildCombinations(
  factors: Factor[],
  levels: FactorLevel[],
): Combination[] {
  const ordered = [...factors].sort(byOrder);
  if (ordered.length === 0) return [];

  const levelsFor = (factorId: string) =>
    levels.filter((level) => level.factorId === factorId).sort(byOrder);

  // A factor with no levels contributes nothing to cross, so the whole
  // product is empty rather than silently dropping that factor — which would
  // produce a trial missing a variable the designer thought they had added.
  if (ordered.some((factor) => levelsFor(factor.factorId).length === 0)) return [];

  let rows: Array<Array<{ factor: Factor; level: FactorLevel }>> = [[]];
  for (const factor of ordered) {
    const next: typeof rows = [];
    for (const row of rows) {
      for (const level of levelsFor(factor.factorId)) {
        next.push([...row, { factor, level }]);
      }
    }
    rows = next;
  }

  return rows.map((row, index) => ({
    combinationId: row.map((cell) => cell.level.levelId).join("+"),
    members: Object.fromEntries(row.map((cell) => [cell.factor.factorId, cell.level.levelId])),
    label: row.map((cell) => `${cell.factor.name}=${cell.level.label}`).join(" · "),
    shortLabel: row
      .map((cell) => `${cell.factor.code || cell.factor.name.slice(0, 3)}:${cell.level.label}`)
      .join(" "),
    sortOrder: index,
  }));
}

export type DesignVerdict = "fine" | "note" | "warn" | "blocked";

export interface DesignLoad {
  combinations: number;
  replicates: number;
  sites: number;
  /** Plots somebody has to walk, at every assessment, across the whole trial. */
  totalPlots: number;
  /**
   * Plots in one complete block.
   *
   * For a randomised complete block this is the number of combinations, by
   * definition — a complete block holds every treatment once.
   */
  blockSize: number;
  verdict: DesignVerdict;
  /** Why, in words, naming the consequence rather than the number. */
  message: string | null;
}

/*
 * Thresholds, and what they are actually about.
 *
 * Block size is the one that matters first, and it is not a workload limit.
 * Blocking absorbs a gradient by assuming the ground inside one block is
 * uniform. A complete block has to hold every combination, so the block grows
 * with the design — and past a certain size it is stretched across enough
 * ground that the assumption fails. The design then quietly stops doing the
 * thing it was chosen for, which is invisible unless something says so.
 *
 * Total plots is the second, and it is a workload limit. A potato plot is
 * destructive to harvest — dug, weighed, graded — at twenty to forty minutes
 * each, so ninety-six plots is a fortnight of harvest for one assessment.
 *
 * The numbers are judgement, not arithmetic, and are deliberately generous:
 * the aim is to catch a design nobody could run, not to argue with a
 * biometrician about a design they have thought about.
 */
const BLOCK_NOTE = 8;
const BLOCK_WARN = 16;
const BLOCK_BLOCK = 24;
const PLOTS_NOTE = 24;
const PLOTS_WARN = 48;
const PLOTS_BLOCK = 96;

const RANK: Record<DesignVerdict, number> = { fine: 0, note: 1, warn: 2, blocked: 3 };

/**
 * Whether a design can actually be run, and what to say about it.
 *
 * Called as factors and levels are added, so the answer arrives while the
 * design is still being shaped rather than after somebody has walked away
 * believing the trial is set up.
 */
export function designLoad(input: {
  combinations: number;
  replicates: number;
  sites?: number;
  blocking?: "blocks" | "none";
}): DesignLoad {
  const sites = Math.max(1, input.sites ?? 1);
  const replicates = Math.max(0, input.replicates);
  const combinations = Math.max(0, input.combinations);
  const totalPlots = combinations * replicates * sites;
  // Only a complete block is constrained by the treatment count; under
  // complete randomisation there are no blocks to outgrow.
  const blockSize = input.blocking === "none" ? 0 : combinations;

  let verdict: DesignVerdict = "fine";
  let message: string | null = null;

  const raise = (next: DesignVerdict, text: string) => {
    if (RANK[next] > RANK[verdict]) {
      verdict = next;
      message = text;
    }
  };

  if (blockSize > BLOCK_BLOCK) {
    raise(
      "blocked",
      `A complete block would hold ${blockSize} plots. Ground that large is not uniform, which is the whole reason for blocking — so the design would no longer be doing what it was chosen for. Drop a level or a factor, or use a split-plot arrangement.`,
    );
  } else if (blockSize > BLOCK_WARN) {
    raise(
      "warn",
      `Each block holds ${blockSize} plots. That is a lot of ground to call uniform, and blocking only helps while it is — worth considering a split-plot, or one fewer level.`,
    );
  } else if (blockSize > BLOCK_NOTE) {
    raise("note", `Each block holds ${blockSize} plots, which is getting large but is still workable.`);
  }

  if (totalPlots > PLOTS_BLOCK) {
    raise(
      "blocked",
      `That is ${totalPlots} plots. A potato plot is dug, weighed and graded one at a time, so this is more than a season can carry — fewer levels, fewer replicates, or fewer sites.`,
    );
  } else if (totalPlots > PLOTS_WARN) {
    raise(
      "warn",
      `That is ${totalPlots} plots to walk at every assessment. Check somebody has the time before the crop is in.`,
    );
  } else if (totalPlots > PLOTS_NOTE) {
    raise("note", `${totalPlots} plots in total.`);
  }

  return { combinations, replicates, sites, totalPlots, blockSize, verdict, message };
}

/** Whether a design may be created at all. */
export const canBuild = (load: DesignLoad): boolean => load.verdict !== "blocked";

/**
 * "2 × 3 × 3", the way a factorial is named.
 *
 * Written in the order the factors are, so the name matches the fieldbook.
 */
export function describeDesign(levelsPerFactor: number[]): string {
  if (levelsPerFactor.length === 0) return "";
  return levelsPerFactor.join(" × ");
}
