import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadCsv } from "./export";
import { readCsv } from "./templateImport";
import { parseSoilCsv, soilTemplateCsv } from "./soilImport";

// Excel on Windows does not read the charset in a MIME type. Without a byte
// order mark it decodes a .csv in the system code page — Windows-1252 here —
// and every character outside ASCII arrives as mojibake: a variety written in
// katakana, the m² in a plot area, the ± in a standard error.
//
// R and GenStat are unaffected either way. Excel is the one that breaks, and it
// is the first thing a field agronomist opens.

const BOM = "﻿";
const SAMPLE = "trial,value\r\nPer アクア,42\r\n";

describe("CSV downloads", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      createElement: () => ({ href: "", download: "", click: () => {}, remove: () => {} }),
      body: { appendChild: () => {} },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * The bytes, not the decoded string.
   *
   * blob.text() runs the bytes through TextDecoder, which strips a leading BOM
   * by default — so a file that is correctly marked and one that is not both
   * decode to the same string. Reading the bytes is the only way to tell them
   * apart, and the bytes are what Excel is looking at.
   */
  async function bytesOf(run: () => void): Promise<Uint8Array> {
    let seen: Blob | null = null;
    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    URL.createObjectURL = (blob: Blob) => {
      seen = blob;
      return "blob:test";
    };
    URL.revokeObjectURL = () => {};
    run();
    URL.createObjectURL = realCreate;
    URL.revokeObjectURL = realRevoke;
    if (!seen) throw new Error("nothing was downloaded");
    return new Uint8Array(await (seen as Blob).arrayBuffer());
  }

  it("starts the file with the UTF-8 byte order mark", async () => {
    const bytes = await bytesOf(() => downloadCsv("trial.csv", SAMPLE));
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("leaves the content itself untouched", async () => {
    const bytes = await bytesOf(() => downloadCsv("trial.csv", SAMPLE));
    expect(new TextDecoder().decode(bytes)).toBe(SAMPLE);
  });

  it("writes the mark once, at the front", async () => {
    const bytes = await bytesOf(() => downloadCsv("x.csv", "a,b\r\n1,2\r\n"));
    // ignoreBOM keeps it in the decoded string, so it can be counted.
    const raw = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(raw.indexOf(BOM)).toBe(0);
    expect(raw.split(BOM)).toHaveLength(2);
  });
});

describe("reading a file that has one", () => {
  it("does not turn the first column name into a different word", () => {
    // The round trip that would break: download a blank template, fill it in,
    // import it. Without stripping, the first header reads BOM + "trial" and
    // every lookup for "trial" misses.
    expect(readCsv(BOM + "trial,site\nOne,Two\n")[0][0]).toBe("trial");
  });

  it("imports a soil template that carries one", () => {
    const result = parseSoilCsv(BOM + soilTemplateCsv(), "site-1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.samples).toHaveLength(2);
  });

  it("is unbothered by a file without one", () => {
    expect(readCsv("trial,site\nOne,Two\n")[0][0]).toBe("trial");
  });
});
