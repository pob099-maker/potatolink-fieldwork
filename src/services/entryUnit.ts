// Which single thing a record belongs to, and what to call it on screen.
//
// Pulled out of EntryPage because the version that lived there was one
// expression long and wrong: it read `trial.design === "replicated" ? replicate
// : null`, so an observational form that asked "which run?" had the answer
// nulled one line before it was saved. The question was asked, answered, and
// thrown away, and every test passed because the whole mistake was inside a
// component.
//
// Both answers below are the same fact seen twice: `replicate` is what
// `experimentalUnit` collapses on, and the label is that same number said out
// loud beside the site and the practice.

import type { FormTemplate, Trial } from "../types";

/**
 * Whether a record on this form carries a unit number at all.
 *
 * True for a replicated trial, where it is the block. True for any form that
 * groups, where it is the run or batch or load. False otherwise, and false is
 * right: an observational comparison with no grouping really does produce one
 * independent observation per record.
 */
export function carriesUnitNumber(trial: Trial, template: FormTemplate): boolean {
  return trial.design === "replicated" || Boolean(template.groupsBy?.trim());
}

/** The unit number to save, or null when this form does not have one. */
export function unitNumber(
  trial: Trial,
  template: FormTemplate,
  chosen: number | null,
): number | null {
  return carriesUnitNumber(trial, template) ? chosen : null;
}

/**
 * What the pill beside the site and the practice says, or null for no pill.
 *
 * The plot wins where there is one: it is what is painted on the peg, and the
 * replicate behind it is bookkeeping. A grouped form uses the designer's own
 * word, so somebody who was asked "which run?" sees "Run 7" and not "Rep 7".
 */
export function unitLabel(
  trial: Trial,
  template: FormTemplate,
  replicate: number | null,
  plot: number | null,
): string | null {
  if (plot) return `Plot ${plot}`;
  if (!replicate) return null;
  if (trial.design === "replicated") return `Rep ${replicate}`;
  const word = template.groupsBy?.trim();
  if (!word) return null;
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} ${replicate}`;
}
