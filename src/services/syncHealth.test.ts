import { describe, expect, it } from "vitest";
import {
  deviceSyncSentence,
  emptySyncState,
  needsAttention,
  summariseSync,
  syncSentence,
  totalOutstanding,
  type SyncState,
} from "./syncHealth";
import type { SyncStatus } from "../types";

const events = (...statuses: SyncStatus[]) => statuses.map((syncStatus) => ({ syncStatus }));

const state = (over: Partial<SyncState> = {}): SyncState => ({ ...emptySyncState(), ...over });

describe("counting what has not gone up", () => {
  it("keeps a refusal apart from a wait", () => {
    // The bug this file exists for: `!== "synced"` swept both into one number
    // and one sentence.
    const summary = summariseSync(events("pending", "error", "synced", "error"), 0, 0);
    expect(summary.pending).toBe(1);
    expect(summary.failed).toBe(2);
  });

  it("counts a synced entry as neither", () => {
    expect(totalOutstanding(summariseSync(events("synced", "synced"), 0, 0))).toBe(0);
  });

  it("adds queued setup edits and deletions to the total", () => {
    expect(totalOutstanding(summariseSync(events("pending"), 3, 2))).toBe(6);
  });

  it("only asks for a person when something was refused", () => {
    expect(needsAttention(state({ pending: 9, queued: 4 }))).toBe(false);
    expect(needsAttention(state({ failed: 1 }))).toBe(true);
  });
});

describe("what the form says above it", () => {
  const online = { online: true, backend: true };

  it("does not call a refusal a wait", () => {
    const sentence = syncSentence(state({ failed: 3 }), online);
    expect(sentence.text).not.toMatch(/waiting|still to go up/i);
    expect(sentence.alert).toMatch(/could not be sent/i);
  });

  it("keeps the refusal out of the connection line entirely", () => {
    // Both are true at once, and "connected" must not be allowed to soften
    // "your last entry did not go".
    const sentence = syncSentence(state({ failed: 2 }), online);
    expect(sentence.text).toBe("Connected — entries send as you save.");
    expect(sentence.tone).toBe("danger");
  });

  it("still reassures when the only problem is signal", () => {
    const sentence = syncSentence(state({ pending: 4 }), { online: false, backend: true });
    expect(sentence.tone).toBe("offline");
    expect(sentence.text).toMatch(/send themselves when you are back in range/);
    expect(sentence.text).toMatch(/4 entries still to go up/);
    expect(sentence.alert).toBeNull();
  });

  it("says nothing about waiting when nothing is", () => {
    expect(syncSentence(emptySyncState(), online).text).toBe(
      "Connected — entries send as you save.",
    );
  });

  it("reports both at once without letting either hide the other", () => {
    const sentence = syncSentence(state({ pending: 1, failed: 1 }), online);
    expect(sentence.text).toMatch(/1 entry still to go up/);
    expect(sentence.alert).toMatch(/1 entry could not be sent/);
  });

  it("counts one entry in the singular, because most of them are", () => {
    const one = syncSentence(state({ failed: 1 }), online);
    expect(one.alert).toMatch(/1 entry could not be sent and is still on this device/);
    expect(one.alert).toMatch(/It will not go up/);
    const many = syncSentence(state({ failed: 2 }), online);
    expect(many.alert).toMatch(/2 entries could not be sent and are/);
    expect(many.alert).toMatch(/They will not go up/);
  });

  it("says where entries go when there is no cloud at all", () => {
    const sentence = syncSentence(state({ pending: 2 }), { online: true, backend: false });
    expect(sentence.tone).toBe("local");
    expect(sentence.text).toMatch(/^Saving to this device only/);
  });

  it("still raises a refusal while offline", () => {
    // The refusal happened earlier, when there was signal. Losing signal does
    // not make it go away, and the offline branch used to swallow it.
    const sentence = syncSentence(state({ failed: 1 }), { online: false, backend: true });
    expect(sentence.alert).toMatch(/could not be sent/);
  });
});

describe("what the dashboard says", () => {
  it("does not describe a refused record as waiting to leave", () => {
    const sentence = deviceSyncSentence(state({ failed: 16 }));
    expect(sentence.text).not.toMatch(/waiting to leave/);
    expect(sentence.alert).toMatch(/16 entries were refused/);
  });

  it("counts only the records that really are on their way", () => {
    const sentence = deviceSyncSentence(state({ pending: 2, queued: 1, deletions: 1, failed: 5 }));
    expect(sentence.text).toMatch(/^4 records are waiting to leave this device\./);
  });

  it("does not claim everything arrived while something was refused", () => {
    // The old line was an either/or: any non-synced record produced "waiting",
    // and none produced "everything has reached the cloud". A failure had to
    // land in one of those two, and both were wrong.
    const sentence = deviceSyncSentence(state({ failed: 1 }));
    expect(sentence.text).not.toMatch(/reached the cloud/);
  });

  it("says so plainly when there is genuinely nothing outstanding", () => {
    const sentence = deviceSyncSentence(emptySyncState());
    expect(sentence.text).toBe("Everything on this device has reached the cloud.");
    expect(sentence.alert).toBeNull();
  });
});
