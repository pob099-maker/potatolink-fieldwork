// Who is involved in a trial, and what that means for what they see.
//
// Involvement comes from two places, and only one of them had to be invented.
//
// Sites already name their grower — `Site.contactId` has been there since the
// first migration and nothing ever read it. A farmer is involved in a trial if
// one of its sites is theirs, and that is true of every trial in the system
// today without a single new row. It is also the answer people expect: the
// paddock is the involvement.
//
// The rest is `TrialMember` — the agronomist who co-operates, the project
// officer, the researcher who reads results and never records anything. That
// table is deliberately the smaller half, because a model that made you
// enrol every farmer by hand would be wrong about the common case and would
// drift out of date the first time somebody added a site.
//
// Pure, and separate from any question of enforcement. What a person is
// entitled to see and what a database will refuse to hand over are different
// questions with different failure modes, and conflating them is how an
// interface ends up quietly promising a privacy it does not have.

import type { Site, Trial, TrialMember } from "../types";

/**
 * Who is looking.
 *
 * `contactId` is null for an anonymous viewer — somebody on a shared entry
 * link, which is most people in a paddock and will stay that way. A null
 * viewer is not "involved in nothing"; it is "we do not know", which is a
 * different thing and is handled where the scoping is applied rather than
 * silently returning an empty list.
 */
export interface Viewer {
  contactId: string | null;
}

export const anonymousViewer = (): Viewer => ({ contactId: null });

/** Why somebody counts as involved, so the interface can say it out loud. */
export type InvolvementReason = "site" | "member";

export interface Involvement {
  trialId: string;
  contactId: string;
  reasons: InvolvementReason[];
  /** The explicit role, when there is one. Site ownership alone carries none. */
  role: TrialMember["role"] | null;
}

/**
 * Everyone involved in one trial, derived and explicit together.
 *
 * A person who owns a site *and* has a member row appears once, with both
 * reasons — two rows for one person is a list nobody can read and a count
 * nobody can trust.
 */
export function involvementFor(
  trialId: string,
  sites: Site[],
  members: TrialMember[],
): Involvement[] {
  const byContact = new Map<string, Involvement>();

  const add = (contactId: string, reason: InvolvementReason, role: TrialMember["role"] | null) => {
    const existing = byContact.get(contactId);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      // An explicit role wins over none; site ownership does not name one.
      if (role) existing.role = role;
      return;
    }
    byContact.set(contactId, { trialId, contactId, reasons: [reason], role });
  };

  for (const site of sites) {
    if (site.trialId === trialId && site.contactId) add(site.contactId, "site", null);
  }
  for (const member of members) {
    if (member.trialId === trialId) add(member.contactId, "member", member.role);
  }
  return [...byContact.values()];
}

/** Whether this person is involved in this trial at all. */
export function isInvolved(
  viewer: Viewer,
  trialId: string,
  sites: Site[],
  members: TrialMember[],
): boolean {
  if (!viewer.contactId) return false;
  return involvementFor(trialId, sites, members).some(
    (entry) => entry.contactId === viewer.contactId,
  );
}

/** Every trial this person is involved in. */
export function trialsFor(
  viewer: Viewer,
  trials: Trial[],
  sites: Site[],
  members: TrialMember[],
): Trial[] {
  if (!viewer.contactId) return [];
  return trials.filter((trial) => isInvolved(viewer, trial.trialId, sites, members));
}

/**
 * What to show a viewer, and whether it was narrowed.
 *
 * The flag matters as much as the list. A screen showing four trials out of
 * forty must be able to say so — a filtered list that looks like the whole
 * list is how somebody concludes their trial has been deleted.
 *
 * An unknown viewer sees everything, which is the honest behaviour while reads
 * are open: pretending to filter for somebody the app cannot identify would
 * hide trials from staff without protecting anything from anyone.
 */
export interface ScopedTrials {
  trials: Trial[];
  scoped: boolean;
  hidden: number;
}

export function scopeTrials(
  viewer: Viewer,
  trials: Trial[],
  sites: Site[],
  members: TrialMember[],
): ScopedTrials {
  if (!viewer.contactId) return { trials, scoped: false, hidden: 0 };
  const mine = trialsFor(viewer, trials, sites, members);
  return { trials: mine, scoped: true, hidden: trials.length - mine.length };
}

/**
 * The grower a given site belongs to.
 *
 * Small, and worth having a name: the entry form used to attribute every
 * record to `contacts.find(c => c.role === "grower")` — the first grower in
 * the list, whatever trial or paddock the entry came from — so one person's
 * name was on everybody's data. The site has known the answer all along.
 */
export function growerForSite(siteId: string | null, sites: Site[]): string | null {
  if (!siteId) return null;
  return sites.find((site) => site.siteId === siteId)?.contactId ?? null;
}
