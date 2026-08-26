// Telling "not yet" apart from "no".
//
// Both leave a record on the device, and until now both were counted the same
// way and described with the same sentence: "waiting to send". For a dropped
// connection that is true and reassuring — the entry goes up by itself the
// moment there is signal, and saying so is the whole point of an offline-first
// app. For a refusal it is a lie, and the worst kind: it is silent data loss
// wearing the costume of reassurance. Somebody records a plot, reads a green
// banner, drives home, and nothing ever arrives.
//
// The app has always known the difference — `syncStatus` is literally "error"
// — and the badge on a single row said so. The standing banners are what
// erased it, by filtering on `!== "synced"` and calling everything that
// matched "waiting".
//
// Pure on purpose. The counting and the wording are the part worth testing,
// and neither needs a database or a browser to be checked.

import type { MeasurementEvent } from "../types";

export interface SyncState {
  /**
   * Saved, not yet acknowledged, and nothing has refused them. These go up on
   * their own — no signal is a normal condition in a paddock, not a fault.
   */
  pending: number;
  /**
   * The cloud refused these. They will not go up on their own, however long
   * anyone waits, and nobody finds out unless the app says so.
   */
  failed: number;
  /** Setup edits queued behind a connection. */
  queued: number;
  /** Deletions queued behind a connection. */
  deletions: number;
}

export const emptySyncState = (): SyncState => ({
  pending: 0,
  failed: 0,
  queued: 0,
  deletions: 0,
});

export function summariseSync(
  events: Pick<MeasurementEvent, "syncStatus">[],
  queued: number,
  deletions: number,
): SyncState {
  return {
    pending: events.filter((event) => event.syncStatus === "pending").length,
    failed: events.filter((event) => event.syncStatus === "error").length,
    queued,
    deletions,
  };
}

/** Everything not yet on the far end, however it got that way. */
export const totalOutstanding = (state: SyncState): number =>
  state.pending + state.failed + state.queued + state.deletions;

/**
 * Whether somebody has to do something. A pending record needs patience; a
 * failed one needs a person.
 */
export const needsAttention = (state: SyncState): boolean => state.failed > 0;

const entries = (n: number): string => `${n} ${n === 1 ? "entry" : "entries"}`;

export type SyncTone = "ok" | "offline" | "local" | "danger";

export interface SyncSentence {
  tone: SyncTone;
  /** The standing line: where entries go. */
  text: string;
  /**
   * The failure, kept separate so it cannot be read as part of the
   * reassurance. Null when nothing has been refused.
   */
  alert: string | null;
}

/**
 * What to say above a form.
 *
 * A refusal is never folded into the connection sentence. It gets its own
 * line, in its own tone, because "connected" and "your last entry did not go"
 * are both true at once and the first must not be allowed to soften the
 * second.
 */
export function syncSentence(
  state: SyncState,
  { online, backend }: { online: boolean; backend: boolean },
): SyncSentence {
  const waiting =
    state.pending > 0 ? ` ${entries(state.pending)} still to go up.` : "";

  const alert =
    state.failed > 0
      ? `${entries(state.failed)} could not be sent and ${
          state.failed === 1 ? "is" : "are"
        } still on this device only. ${
          state.failed === 1 ? "It will" : "They will"
        } not go up without help.`
      : null;

  if (!backend) {
    return {
      tone: "local",
      text: `Saving to this device only.${waiting}`,
      alert,
    };
  }
  if (!online) {
    return {
      tone: "offline",
      text: `No signal — entries save on this device and send themselves when you are back in range.${waiting}`,
      alert,
    };
  }
  return {
    tone: alert ? "danger" : "ok",
    text: `Connected — entries send as you save.${waiting}`,
    alert,
  };
}

/**
 * The dashboard's version, which counts setup edits and deletions too.
 *
 * Deliberately not "N records are waiting to leave this device" when some of
 * them are not waiting for anything.
 */
export function deviceSyncSentence(state: SyncState): SyncSentence {
  const moving = state.pending + state.queued + state.deletions;
  const parts: string[] = [];
  if (moving > 0) {
    parts.push(
      `${moving} ${moving === 1 ? "record is" : "records are"} waiting to leave this device.`,
    );
  }
  if (state.failed === 0 && moving === 0) {
    parts.push("Everything on this device has reached the cloud.");
  }
  return {
    tone: state.failed > 0 ? "danger" : "ok",
    text: parts.join(" "),
    alert:
      state.failed > 0
        ? `${entries(state.failed)} ${
            state.failed === 1 ? "was" : "were"
          } refused by the cloud and will not go up without help.`
        : null,
  };
}
