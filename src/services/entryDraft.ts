// A part-filled form, kept so leaving does not lose it.
//
// Nothing was written until Save. On a one-screen form that is fine; on a
// sixteen-field form across four screens, standing in a paddock, it is a
// trapdoor. Fifteen answers in, a required field somebody genuinely cannot
// answer — the tensiometer is flat, the plot is under water — and the choice
// is invent a value or lose the lot. Backgrounding a browser tab is enough to
// lose it, and a phone does that on an incoming call.
//
// So the answers are written as they are typed. The record is still only
// created on Save; this is the difference between being stuck and being
// stuck *and* starting again.
//
// IndexedDB, not localStorage — sandboxed iframes block localStorage, and this
// app is banned from it everywhere else for the same reason.
//
// Media is safe to keep here: a photo field's value is a "media:<id>" pointer
// and the blob behind it was already written to IndexedDB when it was taken.
// The draft carries the pointer, not the picture.

import { dbDelete, dbGet, dbPut } from "../lib/localdb";

export interface EntryDraft {
  /** Identifies the form *and* the thing being recorded against. */
  draftId: string;
  values: Record<string, unknown>;
  /** Which screen they had reached, so they come back to it. */
  screenIndex: number;
  updatedAt: string;
}

/**
 * What makes a draft belong where it belongs.
 *
 * Every part matters. The same form at two sites is two drafts; the same site
 * on two plots is two drafts. Getting this wrong would restore one plot's
 * numbers onto another, which is worse than losing them — a wrong yield
 * attributed confidently is the failure this whole app is built to avoid.
 */
export interface DraftKey {
  trialId: string;
  templateId: string;
  siteId: string | null;
  armId: string | null;
  replicate: number | null;
  plot: number | null;
}

export function draftId(key: DraftKey): string {
  return [
    key.trialId,
    key.templateId,
    key.siteId ?? "-",
    key.armId ?? "-",
    key.replicate ?? "-",
    key.plot ?? "-",
  ].join("|");
}

/**
 * How old a draft can be before it is offered rather than simply applied.
 *
 * A form abandoned ten minutes ago is the same visit and restoring it silently
 * is right. One from last month is a different visit to the same plot, and
 * quietly filling in last month's numbers would be the app inventing an
 * observation. Fourteen days is comfortably longer than a walk round a trial
 * and comfortably shorter than the gap between growth stages.
 */
export const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export function isStale(draft: EntryDraft, now: number): boolean {
  return now - new Date(draft.updatedAt).getTime() > STALE_AFTER_MS;
}

/** Whether anything was actually typed. An empty draft is not worth offering. */
export function hasContent(values: Record<string, unknown>): boolean {
  return Object.values(values).some((value) => {
    if (value === undefined || value === null || value === "") return false;
    if (Array.isArray(value)) return value.length > 0;
    // A false checkbox is a deliberate answer, not an empty one.
    return true;
  });
}

export async function readDraft(key: DraftKey): Promise<EntryDraft | undefined> {
  return dbGet<EntryDraft>("entryDrafts", draftId(key));
}

/**
 * Keep, or clear if there is nothing left to keep.
 *
 * Clearing on empty matters: somebody who deletes what they typed has changed
 * their mind, and coming back to a form that puts it back would be the app
 * arguing with them.
 */
export async function writeDraft(
  key: DraftKey,
  values: Record<string, unknown>,
  screenIndex: number,
): Promise<void> {
  if (!hasContent(values)) {
    await clearDraft(key);
    return;
  }
  await dbPut("entryDrafts", {
    draftId: draftId(key),
    values,
    screenIndex,
    updatedAt: new Date().toISOString(),
  } satisfies EntryDraft);
}

export async function clearDraft(key: DraftKey): Promise<void> {
  await dbDelete("entryDrafts", draftId(key));
}

/** How long ago, in words a person would use. */
export function describeAge(draft: EntryDraft, now: number): string {
  const minutes = Math.floor((now - new Date(draft.updatedAt).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
