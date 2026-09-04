import { describe, expect, it } from "vitest";
import { computeValue, formulaProblems, parseFormula } from "./formula";

const on = (values: Record<string, unknown>) => values;

describe("reading a sum", () => {
  it("does the multiplication before the addition", () => {
    expect(computeValue("2 + 3 * 4", {})).toBe(14);
  });

  it("lets brackets say otherwise", () => {
    expect(computeValue("(2 + 3) * 4", {})).toBe(20);
  });

  it("divides left to right", () => {
    expect(computeValue("100 / 5 / 2", {})).toBe(10);
  });

  it("takes a leading minus", () => {
    expect(computeValue("-4 + 10", {})).toBe(6);
  });

  it("reads decimals", () => {
    expect(computeValue("0.5 * 8", {})).toBe(4);
  });

  it("puts the answers in for the names", () => {
    expect(computeValue("a + b", on({ a: 2, b: 3 }))).toBe(5);
  });

  it("reads a number that arrived as a string, which is what an input gives", () => {
    expect(computeValue("a * 2", on({ a: "21" }))).toBe(42);
  });
});

describe("the sums these trials actually want", () => {
  // The PT25003 grading-line measurements, which is why any of this exists.
  it("works out a percentage of a total", () => {
    const rate = computeValue("goodInReject / totalReject * 100", {
      goodInReject: 12,
      totalReject: 400,
    });
    expect(rate).toBeCloseTo(3, 6);
  });

  it("works out an efficiency from two parts of a stream", () => {
    const efficiency = computeValue(
      "(clodsIn - clodsOut) / clodsIn * 100",
      on({ clodsIn: 48, clodsOut: 6 }),
    );
    expect(efficiency).toBeCloseTo(87.5, 6);
  });

  it("works out a rate from a weight and a duration", () => {
    expect(computeValue("tonnes / hours", on({ tonnes: 63, hours: 4.5 }))).toBeCloseTo(14, 6);
  });
});

describe("nothing, rather than a number nobody measured", () => {
  // Rule 13, in different clothes. The empty box that became a real
  // observation of zero is the same mistake as a percentage over a
  // denominator that has not been filled in yet.
  it("is blank while an input is still empty", () => {
    expect(computeValue("a / b * 100", on({ a: 5, b: "" }))).toBeNull();
  });

  it("is blank when an input is missing altogether", () => {
    expect(computeValue("a + b", on({ a: 5 }))).toBeNull();
  });

  it("is blank rather than zero when only part of a sum is there", () => {
    expect(computeValue("a * b", on({ a: 0 }))).toBeNull();
  });

  it("is blank on a divide by zero rather than showing infinity", () => {
    expect(computeValue("a / b", on({ a: 5, b: 0 }))).toBeNull();
  });

  it("is blank when an input is text somebody typed by hand", () => {
    expect(computeValue("a + 1", on({ a: "about six" }))).toBeNull();
  });

  it("still answers zero when zero is what was actually measured", () => {
    expect(computeValue("a / b * 100", on({ a: 0, b: 400 }))).toBe(0);
  });
});

describe("saying what is wrong with a sum", () => {
  it("refuses an empty one", () => {
    const result = parseFormula("   ");
    expect(result.ok).toBe(false);
  });

  it("refuses an unclosed bracket", () => {
    const result = parseFormula("(a + b");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("never closed");
  });

  it("refuses a trailing operator", () => {
    expect(parseFormula("a +").ok).toBe(false);
  });

  it("refuses two numbers with nothing between them", () => {
    expect(parseFormula("3 4").ok).toBe(false);
  });

  it("names the character it cannot use", () => {
    const result = parseFormula("a ^ b");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("^");
  });

  it("lists the answers a sum depends on", () => {
    const result = parseFormula("(a + b) / a");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.formula.names).toEqual(["a", "b"]);
  });
});

describe("nothing that becomes eval", () => {
  // A formula is written at a desk and run on somebody else's phone. The
  // parser knows about numbers and four operators; there is no syntax for
  // reaching anything else, and these are the shapes somebody would try.
  const attempts = [
    "fetch('http://x')",
    "window.location",
    "a.constructor",
    "[1,2]",
    "a; b",
    "process.env.KEY",
    "`x`",
  ];
  for (const attempt of attempts) {
    it(`refuses ${attempt}`, () => {
      expect(parseFormula(attempt).ok).toBe(false);
    });
  }

  it("treats a bare name as an answer to look up, not a global", () => {
    // `window` parses — it is a valid name — and evaluates to nothing at all,
    // because the only place a name is ever looked up is the form's answers.
    expect(computeValue("window", {})).toBeNull();
  });
});

describe("checking a sum against the form it sits on", () => {
  const fields = [
    { fieldName: "clodsIn", label: "Clods in" },
    { fieldName: "clodsOut", label: "Clods out" },
  ];

  it("passes a sum that only names questions on the form", () => {
    expect(formulaProblems("clodsIn - clodsOut", fields, "efficiency")).toEqual([]);
  });

  it("says which name is not a question here", () => {
    const problems = formulaProblems("clodsIn - clodsAway", fields, "efficiency");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("clodsAway");
  });

  it("refuses a sum that reads its own answer", () => {
    const problems = formulaProblems("efficiency + 1", [...fields], "efficiency");
    expect(problems[0]).toContain("its own answer");
  });

  it("passes the parse error straight through", () => {
    expect(formulaProblems("(a", fields, "x")[0]).toContain("never closed");
  });
});
