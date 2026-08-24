import { describe, expect, it } from "vitest";
import {
  buildFieldbookCsv,
  generateLayout,
  isBalanced,
  layoutProblem,
  newSeed,
  plotContext,
  type LayoutDesign,
} from "./layout";
import type { PracticeArm } from "../types";

const T0 = "2026-08-01T00:00:00.000Z";

function arms(count: number): PracticeArm[] {
  return Array.from({ length: count }, (_, index) => ({
    armId: `arm-${index + 1}`,
    trialId: "trial-1",
    name: index === 0 ? "Control" : `Treatment ${index}`,
    type: index === 0 ? ("control" as const) : ("alternative" as const),
    description: "",
    sortOrder: index,
    archived: false,
    createdAt: T0,
  }));
}

const layout = (design: LayoutDesign, treatments: number, replicates: number, seed = "SEED1") =>
  generateLayout({ design, arms: arms(treatments), replicates, seed });

describe("randomised complete block", () => {
  it("puts one plot of every treatment in every block", () => {
    const plots = layout("rcb", 4, 3);
    expect(plots).toHaveLength(12);
    for (let block = 1; block <= 3; block += 1) {
      const inBlock = plots.filter((plot) => plot.block === block);
      expect(inBlock).toHaveLength(4);
      // The defining property: no treatment repeats inside a block.
      expect(new Set(inBlock.map((plot) => plot.armId)).size).toBe(4);
    }
  });

  it("numbers plots in walking order, block after block", () => {
    const plots = layout("rcb", 3, 3);
    expect(plots.map((plot) => plot.plotNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(plots.map((plot) => plot.block)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3]);
  });

  it("randomises each block independently", () => {
    // If every block came out in the same order it would not be randomised at
    // all — it would be systematic, and a gradient down the field would line
    // up with a treatment.
    const plots = layout("rcb", 4, 4, "ORDERCHECK");
    const orders = [1, 2, 3, 4].map((block) =>
      plots
        .filter((plot) => plot.block === block)
        .map((plot) => plot.armId)
        .join(","),
    );
    expect(new Set(orders).size).toBeGreaterThan(1);
  });
});

describe("completely randomised", () => {
  it("gives every treatment the same number of plots", () => {
    const plots = layout("crd", 3, 4);
    expect(plots).toHaveLength(12);
    expect(isBalanced(plots)).toBe(true);
  });

  it("does not confine treatments to blocks", () => {
    // The whole point of CRD: plots are drawn from one pool, so the first few
    // may repeat a treatment. Everything sits in a single nominal block.
    const plots = layout("crd", 3, 4);
    expect(new Set(plots.map((plot) => plot.block))).toEqual(new Set([1]));
  });
});

describe("reproducibility", () => {
  it("gives the same layout for the same seed", () => {
    // A layout nobody can regenerate is a layout nobody can check.
    const first = layout("rcb", 4, 3, "REPEAT");
    const second = layout("rcb", 4, 3, "REPEAT");
    expect(second).toEqual(first);
  });

  it("gives a different layout for a different seed", () => {
    const first = layout("rcb", 5, 4, "SEED-A");
    const second = layout("rcb", 5, 4, "SEED-B");
    expect(second).not.toEqual(first);
  });

  it("does not depend on the order treatments were entered in", () => {
    // Sorting by sortOrder first means adding a treatment and reordering the
    // list cannot silently change an existing layout.
    const forwards = generateLayout({
      design: "rcb", arms: arms(4), replicates: 3, seed: "ORDER",
    });
    const backwards = generateLayout({
      design: "rcb", arms: [...arms(4)].reverse(), replicates: 3, seed: "ORDER",
    });
    expect(backwards).toEqual(forwards);
  });

  it("produces seeds that are short enough to write down", () => {
    const seed = newSeed();
    expect(seed.length).toBeLessThanOrEqual(8);
    expect(seed).toMatch(/^[0-9A-Z]+$/);
  });
});

describe("refusing to lay out what cannot be laid out", () => {
  it("needs at least two treatments", () => {
    const problem = layoutProblem({ design: "rcb", arms: arms(1), replicates: 3, seed: "X" });
    expect(problem?.message).toContain("two treatments");
    expect(layout("rcb", 1, 3)).toEqual([]);
  });

  it("needs at least two blocks, and says so in the right words", () => {
    const rcb = layoutProblem({ design: "rcb", arms: arms(3), replicates: 1, seed: "X" });
    expect(rcb?.message).toContain("blocks");
    const crd = layoutProblem({ design: "crd", arms: arms(3), replicates: 1, seed: "X" });
    expect(crd?.message).toContain("replicates");
  });

  it("is happy with a workable design", () => {
    expect(layoutProblem({ design: "rcb", arms: arms(3), replicates: 3, seed: "X" })).toBeNull();
  });
});

describe("the fieldbook", () => {
  it("writes one row per plot with the treatment named, not its id", () => {
    const plots = layout("rcb", 3, 2);
    const csv = buildFieldbookCsv("N Rate Trial", "Walkers Flat", plots, arms(3), "SEED1");
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("trial,site,plot,block,position_in_block,treatment,seed");
    expect(lines).toHaveLength(7);
    expect(csv).toContain("Control");
    expect(csv).not.toContain("arm-1");
  });

  it("carries the seed on every row, so a printed sheet can be traced back", () => {
    const plots = layout("crd", 2, 2);
    const csv = buildFieldbookCsv("T", "S", plots, arms(2), "TRACEME");
    const rows = csv.split("\r\n").slice(1);
    expect(rows.every((row) => row.endsWith("TRACEME"))).toBe(true);
  });

  it("quotes a trial name containing a comma", () => {
    const csv = buildFieldbookCsv("Spacing, wide", "S", layout("crd", 2, 2), arms(2), "S1");
    expect(csv).toContain('"Spacing, wide"');
  });
});

// Recording against a plot only works if the plot number is enough to say what
// is in it. Everything the field form fills in comes from here.
describe("what a plot number means", () => {
  it("calls the block number the replicate, under blocking", () => {
    // A block holds one plot of every treatment, so block two is everybody's
    // second replicate. Anything else double-counts.
    const plots = layout("rcb", 3, 4);
    for (const plot of plots) expect(plot.replicate).toBe(plot.block);
    expect(new Set(plots.map((plot) => plot.replicate))).toEqual(new Set([1, 2, 3, 4]));
  });

  it("counts a treatment's own plots when there is no blocking", () => {
    // Under CRD a treatment can appear twice before another appears once, so
    // the replicate has to be counted per treatment, not per position.
    const plots = layout("crd", 3, 4);
    for (const armId of new Set(plots.map((plot) => plot.armId))) {
      const reps = plots.filter((plot) => plot.armId === armId).map((plot) => plot.replicate);
      expect([...reps].sort()).toEqual([1, 2, 3, 4]);
    }
  });

  it("looks up the treatment and replicate for a plot", () => {
    const plots = layout("rcb", 3, 3);
    const seventh = plotContext(plots, 7);
    expect(seventh?.plotNumber).toBe(7);
    expect(seventh?.block).toBe(3);
    expect(seventh?.armId).toBe(plots[6].armId);
  });

  it("returns nothing for a plot that is not in the layout", () => {
    // A stale link, or a peg from last season. Better nothing than the wrong
    // treatment.
    expect(plotContext(layout("rcb", 3, 3), 99)).toBeNull();
  });
});
