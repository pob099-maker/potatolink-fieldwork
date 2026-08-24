// What a recorded data source actually measures.
//
// A protocol belongs to the trial. A soil probe belongs to a paddock. A flow
// meter under a variable-rate pivot belongs to one plot, because the whole
// point of the machine is that each zone gets a different rate — and the
// treatment is the rate, so "which plot" and "which treatment" are both
// reasonable things to have measured.
//
// Narrowest wins when describing it, since that is the useful half: knowing a
// reading is plot 7's says more than knowing it is the trial's.

import type { DataSource, PracticeArm, Site } from "../types";

/** The four things a source can be about, narrowest first. */
export type ScopeLevel = "plot" | "treatment" | "site" | "trial";

export function scopeLevel(source: Pick<DataSource, "siteId" | "armId" | "plot">): ScopeLevel {
  if (source.plot !== null && source.siteId !== null) return "plot";
  if (source.armId !== null) return "treatment";
  if (source.siteId !== null) return "site";
  return "trial";
}

/**
 * How the scope reads on screen. Falls back to the raw identifier rather than
 * hiding a source whose site or treatment has since been removed — a dangling
 * reference is worth seeing, not swallowing.
 */
export function describeScope(
  source: Pick<DataSource, "siteId" | "armId" | "plot">,
  sites: Site[],
  arms: PracticeArm[],
  treatmentWord: string,
): string {
  const siteName = sites.find((site) => site.siteId === source.siteId)?.location;
  const armName = arms.find((arm) => arm.armId === source.armId)?.name;

  switch (scopeLevel(source)) {
    case "plot":
      return `Plot ${source.plot} · ${siteName ?? "site no longer in this trial"}`;
    case "treatment":
      return `${treatmentWord}: ${armName ?? "no longer in this trial"}`;
    case "site":
      return siteName ?? "site no longer in this trial";
    case "trial":
      return "whole trial";
  }
}

/**
 * Why this scope cannot be saved, or null when it can. Checked before writing
 * so the reason is specific — a plot number with no site identifies nothing,
 * because plots are numbered from one in every paddock.
 */
export function scopeProblem(source: Pick<DataSource, "siteId" | "plot">): string | null {
  if (source.plot !== null && source.siteId === null) {
    return "Choose the site the plot is in — plot numbers start again at each one.";
  }
  if (source.plot !== null && source.plot < 1) {
    return "Plot numbers start at 1.";
  }
  return null;
}
