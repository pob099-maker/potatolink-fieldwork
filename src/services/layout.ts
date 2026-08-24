// Generating a randomised plot layout for a designed trial.
//
// Until now a "replicate" was a number somebody picked off a list. That records
// observations; it does not run a designed experiment. What was missing is the
// layout itself: which treatment sits in which plot, decided by chance rather
// than by whoever was holding the clipboard, and written down before anyone
// walks the paddock.
//
// Two designs, which between them cover most field work:
//
//   CRD — completely randomised. Every plot is drawn from one pool, so any
//   treatment can land anywhere. Right where the ground is uniform.
//
//   RCB — randomised complete block. The field is divided into blocks, each
//   holding one plot of every treatment, and the order is randomised inside
//   each block separately. Blocks soak up a known gradient — a slope, a
//   drainage line, a change in soil — so that gradient stops masquerading as
//   a treatment effect. This is the workhorse of field trials.
//
// The randomisation is seeded and the seed is stored with the trial, so the
// same layout can be reproduced exactly. That matters more than it sounds:
// a layout nobody can regenerate is a layout nobody can check.

import type { PracticeArm } from "../types";

/**
 * Whether the field is blocked. Kept separate from whether a trial is
 * replicated at all, because they are separate questions: replication gives
 * you an estimate of variation, blocking decides how the plots are arranged
 * to keep a known gradient out of that estimate.
 */
export type LayoutDesign = "crd" | "rcb";

export interface PlotAssignment {
  /** 1-based, in walking order across the whole trial. */
  plotNumber: number;
  /** Which block this plot belongs to; 1 for every plot under CRD. */
  block: number;
  armId: string;
  /** Position within its block, 1-based. */
  positionInBlock: number;
  /**
   * Which replicate of its treatment this plot is. Under blocking that is the
   * block number — a block holds one plot of everything, so block two is
   * everybody's second replicate. Without blocking it counts the treatment's
   * own plots in walking order. Derived here so nothing downstream has to
   * work it out, and get it wrong.
   */
  replicate: number;
}

export interface LayoutRequest {
  design: LayoutDesign;
  /** Treatments, control included. Order here does not affect the result. */
  arms: PracticeArm[];
  /** Blocks for RCB; replicates for CRD. */
  replicates: number;
  seed: string;
}

export interface LayoutProblem {
  message: string;
}

/**
 * A small deterministic generator. Not cryptographic — it does not need to be.
 * What it needs is to give the same sequence for the same seed on every
 * machine and every browser, which `Math.random` cannot promise.
 */
function makeRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Fisher–Yates, so every ordering is equally likely. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A fresh seed. Short and readable, because it gets written on paper. */
export function newSeed(): string {
  return Math.floor(Math.random() * 0xffffffff)
    .toString(36)
    .toUpperCase()
    .padStart(7, "0");
}

/**
 * Why this trial cannot be laid out yet, or null when it can. Checked before
 * generating so the reason is specific rather than an empty grid.
 */
export function layoutProblem(request: LayoutRequest): LayoutProblem | null {
  if (request.arms.length < 2) {
    return {
      message: "A designed trial needs at least two treatments to compare.",
    };
  }
  if (request.replicates < 2) {
    const unit = request.design === "rcb" ? "blocks" : "replicates";
    return {
      message: `Two ${unit} is the minimum — with one there is nothing to estimate variation from.`,
    };
  }
  return null;
}

/**
 * The layout. Plots are numbered in walking order: through block one, then
 * block two, and so on, which is how somebody actually moves down a paddock.
 */
export function generateLayout(request: LayoutRequest): PlotAssignment[] {
  if (layoutProblem(request)) return [];

  const random = makeRandom(request.seed);
  const armIds = [...request.arms]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((arm) => arm.armId);
  const plots: PlotAssignment[] = [];

  if (request.design === "rcb") {
    // Each block holds one plot of every treatment, shuffled within the block.
    for (let block = 1; block <= request.replicates; block += 1) {
      shuffle(armIds, random).forEach((armId, index) => {
        plots.push({
          plotNumber: plots.length + 1,
          block,
          armId,
          positionInBlock: index + 1,
          replicate: block,
        });
      });
    }
    return plots;
  }

  // CRD: one pool of treatment × replicate units, shuffled as a whole, so a
  // treatment may appear twice in a row or not at all in one part of the field.
  const pool: string[] = [];
  for (let rep = 0; rep < request.replicates; rep += 1) pool.push(...armIds);
  const seen = new Map<string, number>();
  shuffle(pool, random).forEach((armId, index) => {
    const replicate = (seen.get(armId) ?? 0) + 1;
    seen.set(armId, replicate);
    plots.push({
      plotNumber: index + 1,
      block: 1,
      armId,
      positionInBlock: index + 1,
      replicate,
    });
  });
  return plots;
}

/** Every treatment appears the same number of times — the check worth making. */
export function isBalanced(plots: PlotAssignment[]): boolean {
  if (plots.length === 0) return false;
  const counts = new Map<string, number>();
  for (const plot of plots) counts.set(plot.armId, (counts.get(plot.armId) ?? 0) + 1);
  return new Set(counts.values()).size === 1;
}

/**
 * The fieldbook: one row per plot, in walking order, for printing or for
 * loading into R, GenStat or SAS before the trial is analysed.
 */
export function buildFieldbookCsv(
  trialName: string,
  siteName: string,
  plots: PlotAssignment[],
  arms: PracticeArm[],
  seed: string,
): string {
  const armName = (id: string) => arms.find((arm) => arm.armId === id)?.name ?? id;
  const cell = (value: string) =>
    /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  const header = ["trial", "site", "plot", "block", "position_in_block", "treatment", "seed"];
  const rows = plots.map((plot) => [
    trialName,
    siteName,
    String(plot.plotNumber),
    String(plot.block),
    String(plot.positionInBlock),
    armName(plot.armId),
    seed,
  ]);
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}

/**
 * What a plot number means: which treatment is in it, and which replicate of
 * that treatment it is. This is the whole point of recording against a plot —
 * the person in the paddock reads a number off a peg, and the treatment they
 * are standing in is looked up rather than asked for. Asking them invites the
 * wrong answer, and undoes the randomisation the layout exists to provide.
 */
export function plotContext(
  plots: PlotAssignment[],
  plotNumber: number,
): PlotAssignment | null {
  return plots.find((plot) => plot.plotNumber === plotNumber) ?? null;
}
