import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  clearDraft,
  describeAge,
  draftId,
  hasContent,
  isStale,
  readDraft,
  writeDraft,
  type DraftKey,
  type EntryDraft,
} from "./entryDraft";

// Nothing was written until Save, which on a sixteen-field form across four
// screens is a trapdoor: fifteen answers in, one required field somebody
// genuinely cannot answer, and the choice is invent a value or lose the lot.

const key = (over: Partial<DraftKey> = {}): DraftKey => ({
  trialId: "t1",
  templateId: "f1",
  siteId: "s1",
  armId: "a1",
  replicate: 1,
  plot: 7,
  ...over,
});

describe("what a draft belongs to", () => {
  // Getting this wrong would restore one plot's numbers onto another, which is
  // worse than losing them — a wrong yield attributed confidently is the
  // failure the whole app is built to avoid.
  it("separates two plots", () => {
    expect(draftId(key({ plot: 7 }))).not.toBe(draftId(key({ plot: 8 })));
  });

  it("separates two sites", () => {
    expect(draftId(key({ siteId: "s1" }))).not.toBe(draftId(key({ siteId: "s2" })));
  });

  it("separates two forms on the same plot", () => {
    expect(draftId(key({ templateId: "f1" }))).not.toBe(draftId(key({ templateId: "f2" })));
  });

  it("separates two practices", () => {
    expect(draftId(key({ armId: "a1" }))).not.toBe(draftId(key({ armId: "a2" })));
  });

  it("separates two replicates", () => {
    expect(draftId(key({ replicate: 1 }))).not.toBe(draftId(key({ replicate: 2 })));
  });

  it("is the same key for the same thing", () => {
    expect(draftId(key())).toBe(draftId(key()));
  });

  it("copes with a whole-trial form that has no site or plot", () => {
    const whole = key({ siteId: null, armId: null, replicate: null, plot: null });
    expect(draftId(whole)).toBe("t1|f1|-|-|-|-");
  });
});

describe("whether there is anything worth keeping", () => {
  it("ignores a form nobody has touched", () => {
    expect(hasContent({ a: "", b: undefined, c: null })).toBe(false);
    expect(hasContent({})).toBe(false);
  });

  it("counts a typed answer", () => {
    expect(hasContent({ a: "", b: "42" })).toBe(true);
  });

  it("counts an unticked checkbox, because false is an answer", () => {
    // "Did the run go as planned? No" is a recorded observation, not a blank.
    expect(hasContent({ wentToPlan: false })).toBe(true);
  });

  it("ignores an empty multi-select but counts a chosen one", () => {
    expect(hasContent({ weeds: [] })).toBe(false);
    expect(hasContent({ weeds: ["Grasses"] })).toBe(true);
  });
});

describe("keeping and restoring", () => {
  it("comes back with the answers and the screen", async () => {
    const k = key({ plot: 11 });
    await writeDraft(k, { weight: "45", notes: "wet" }, 2);
    const back = await readDraft(k);
    expect(back?.values).toEqual({ weight: "45", notes: "wet" });
    expect(back?.screenIndex).toBe(2);
  });

  it("does not hand one plot's answers to another", async () => {
    await writeDraft(key({ plot: 21 }), { weight: "45" }, 0);
    expect(await readDraft(key({ plot: 22 }))).toBeUndefined();
  });

  it("clears itself when everything typed is deleted", async () => {
    // Somebody who empties a form has changed their mind, and coming back to
    // find it refilled would be the app arguing with them.
    const k = key({ plot: 31 });
    await writeDraft(k, { weight: "45" }, 0);
    await writeDraft(k, { weight: "" }, 0);
    expect(await readDraft(k)).toBeUndefined();
  });

  it("is gone once cleared", async () => {
    const k = key({ plot: 41 });
    await writeDraft(k, { weight: "45" }, 0);
    await clearDraft(k);
    expect(await readDraft(k)).toBeUndefined();
  });

  it("keeps a media pointer, which is safe because the blob is already stored", async () => {
    const k = key({ plot: 51 });
    await writeDraft(k, { photo: "media:abc123" }, 1);
    expect((await readDraft(k))?.values.photo).toBe("media:abc123");
  });
});

describe("age", () => {
  // One fixed clock for both sides. Building the draft from Date.now() and
  // then comparing against a later Date.now() made "5 minutes" floor to 4
  // whenever the two calls straddled a millisecond — a test that failed on
  // timing rather than on behaviour.
  const NOW = Date.parse("2026-06-01T12:00:00.000Z");
  const draft = (minutesAgo: number): EntryDraft => ({
    draftId: "x",
    values: {},
    screenIndex: 0,
    updatedAt: new Date(NOW - minutesAgo * 60000).toISOString(),
  });

  it("treats the same visit as fresh", () => {
    expect(isStale(draft(10), NOW)).toBe(false);
    expect(isStale(draft(60 * 24 * 3), NOW)).toBe(false);
  });

  it("treats last month as stale", () => {
    // A different visit to the same plot. Filling in last month's numbers
    // silently would be the app inventing an observation.
    expect(isStale(draft(60 * 24 * 30), NOW)).toBe(true);
  });

  it("says how long ago in words somebody would use", () => {
    const now = NOW;
    expect(describeAge(draft(0), now)).toBe("just now");
    expect(describeAge(draft(5), now)).toBe("5 minutes ago");
    expect(describeAge(draft(1), now)).toBe("1 minute ago");
    expect(describeAge(draft(120), now)).toBe("2 hours ago");
    expect(describeAge(draft(60 * 24 * 2), now)).toBe("2 days ago");
  });
});
