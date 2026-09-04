// Working a number out from other answers on the same form.
//
// The trials that prompted this all want the same shape of thing: a rate, a
// percentage, an efficiency. False accept rate is what was let through over
// what should have been caught; separation efficiency is clods taken out over
// clods that went in; tonnes per hour is a weight over a duration. Every one
// of them is arithmetic somebody was doing on the back of a docket, at the end
// of a long day, with a calculator that had been living in a ute.
//
// Two rules shape what follows.
//
// **No eval, and nothing that becomes eval.** `new Function` is eval wearing a
// hat. A formula is written by whoever sets a trial up, but it is *run* on the
// phone of whoever is recording — and the two are not always the same person,
// nor always the same organisation. A parser that only knows about numbers and
// four operators cannot be talked into anything else.
//
// **A missing input produces nothing, never zero.** This is rule 13 wearing
// different clothes: the empty box that became a real observation of zero. A
// percentage over a denominator nobody has filled in yet is not 0%, and a
// blank is the honest answer until every input is there.

/** What a formula can be made of. Deliberately short. */
type Token =
  | { kind: "number"; value: number }
  | { kind: "name"; value: string }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "paren"; value: "(" | ")" };

const OPERATORS = new Set(["+", "-", "*", "/"]);

function tokenise(source: string): Token[] | string {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (OPERATORS.has(char)) {
      tokens.push({ kind: "op", value: char as "+" });
      index += 1;
      continue;
    }
    if (char === "(" || char === ")") {
      tokens.push({ kind: "paren", value: char });
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      const match = /^[0-9]*\.?[0-9]+/.exec(source.slice(index));
      if (!match) return `“${source.slice(index, index + 8)}” is not a number.`;
      tokens.push({ kind: "number", value: Number(match[0]) });
      index += match[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(index)) as RegExpExecArray;
      tokens.push({ kind: "name", value: match[0] });
      index += match[0].length;
      continue;
    }
    return `“${char}” cannot be used in a sum. Only + - * / and brackets.`;
  }
  return tokens;
}

/** An expression tree. Small enough to walk without ceremony. */
type Node =
  | { kind: "number"; value: number }
  | { kind: "name"; value: string }
  | { kind: "binary"; op: "+" | "-" | "*" | "/"; left: Node; right: Node }
  | { kind: "negate"; of: Node };

class Parser {
  private at = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.at];
  }

  /** expression := term (('+' | '-') term)* */
  expression(): Node {
    let left = this.term();
    for (;;) {
      const token = this.peek();
      if (token?.kind !== "op" || (token.value !== "+" && token.value !== "-")) return left;
      this.at += 1;
      left = { kind: "binary", op: token.value, left, right: this.term() };
    }
  }

  /** term := unary (('*' | '/') unary)* */
  private term(): Node {
    let left = this.unary();
    for (;;) {
      const token = this.peek();
      if (token?.kind !== "op" || (token.value !== "*" && token.value !== "/")) return left;
      this.at += 1;
      left = { kind: "binary", op: token.value, left, right: this.unary() };
    }
  }

  /** unary := '-' unary | primary */
  private unary(): Node {
    const token = this.peek();
    if (token?.kind === "op" && token.value === "-") {
      this.at += 1;
      return { kind: "negate", of: this.unary() };
    }
    return this.primary();
  }

  private primary(): Node {
    const token = this.peek();
    if (!token) throw new Error("The sum stops before it finishes.");
    this.at += 1;
    if (token.kind === "number") return { kind: "number", value: token.value };
    if (token.kind === "name") return { kind: "name", value: token.value };
    if (token.kind === "paren" && token.value === "(") {
      const inner = this.expression();
      const closing = this.peek();
      if (closing?.kind !== "paren" || closing.value !== ")") {
        throw new Error("A bracket is opened and never closed.");
      }
      this.at += 1;
      return inner;
    }
    if (token.kind === "paren") throw new Error("A bracket is closed that was never opened.");
    throw new Error(`“${token.value}” is where a number should be.`);
  }

  done(): boolean {
    return this.at === this.tokens.length;
  }
}

export interface ParsedFormula {
  /** Every answer this sum reads, in the order they first appear. */
  names: string[];
  tree: Node;
}

export type FormulaResult =
  | { ok: true; formula: ParsedFormula }
  | { ok: false; error: string };

/** Read a formula, or say plainly what is wrong with it. */
export function parseFormula(source: string): FormulaResult {
  if (!source.trim()) return { ok: false, error: "There is no sum here yet." };
  const tokens = tokenise(source);
  if (typeof tokens === "string") return { ok: false, error: tokens };
  const parser = new Parser(tokens);
  let tree: Node;
  try {
    tree = parser.expression();
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
  if (!parser.done()) return { ok: false, error: "There is something left over at the end." };
  return { ok: true, formula: { names: namesIn(tree), tree } };
}

function namesIn(node: Node, found: string[] = []): string[] {
  if (node.kind === "name") {
    if (!found.includes(node.value)) found.push(node.value);
  } else if (node.kind === "binary") {
    namesIn(node.left, found);
    namesIn(node.right, found);
  } else if (node.kind === "negate") {
    namesIn(node.of, found);
  }
  return found;
}

/**
 * What the sum comes to, or null.
 *
 * Null covers every way of not having an answer, and they are all the same
 * answer as far as the person recording is concerned: an input has not been
 * filled in, an input is not a number, or the arithmetic does not resolve — a
 * denominator of zero, an overflow. Showing 0, or Infinity, or NaN would each
 * be a claim the data does not support.
 */
export function evaluateFormula(
  formula: ParsedFormula,
  values: Record<string, unknown>,
): number | null {
  const walk = (node: Node): number | null => {
    switch (node.kind) {
      case "number":
        return node.value;
      case "name": {
        const raw = values[node.value];
        // "" must not become 0 — rule 13. An empty box is not an observation.
        if (raw === null || raw === undefined || raw === "") return null;
        const value = typeof raw === "number" ? raw : Number(raw);
        return Number.isFinite(value) ? value : null;
      }
      case "negate": {
        const inner = walk(node.of);
        return inner === null ? null : -inner;
      }
      case "binary": {
        const left = walk(node.left);
        const right = walk(node.right);
        if (left === null || right === null) return null;
        const result =
          node.op === "+"
            ? left + right
            : node.op === "-"
              ? left - right
              : node.op === "*"
                ? left * right
                : left / right;
        return Number.isFinite(result) ? result : null;
      }
    }
  };
  return walk(formula.tree);
}

/** Parse and evaluate in one go, for a formula stored on a field. */
export function computeValue(source: string, values: Record<string, unknown>): number | null {
  const parsed = parseFormula(source);
  return parsed.ok ? evaluateFormula(parsed.formula, values) : null;
}

/**
 * What is wrong with a formula, checked against the form it sits on.
 *
 * Separate from parsing because the two fail for different reasons and want
 * different words. A sum that will not parse is a typing mistake; a sum that
 * names a question which is not on the form is a mistake about the form, and
 * usually means somebody typed a label where a question name goes.
 *
 * A sum that reads another sum is fine and useful — tonnes per hour off a
 * total that was itself worked out — so the only circular case refused here is
 * the immediate one. Anything longer is caught by ordering: a formula can only
 * see answers, and an answer that is not there yet reads as blank.
 */
export function formulaProblems(
  source: string,
  available: Array<{ fieldName: string; label: string }>,
  self: string,
): string[] {
  const parsed = parseFormula(source);
  if (!parsed.ok) return [parsed.error];
  const known = new Set(available.map((entry) => entry.fieldName));
  const problems: string[] = [];
  for (const name of parsed.formula.names) {
    if (name === self) {
      problems.push("A sum cannot use its own answer.");
    } else if (!known.has(name)) {
      problems.push(`There is no question called “${name}” on this form.`);
    }
  }
  return problems;
}
