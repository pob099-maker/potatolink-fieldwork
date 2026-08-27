import { describe, expect, it } from "vitest";
import {
  anonymousViewer,
  growerForSite,
  involvementFor,
  isInvolved,
  scopeTrials,
  trialsFor,
} from "./involvement";
import type { Site, Trial, TrialMember } from "../types";

// The question the app could never answer about a person, only about a record.

const ALICE = "c0000000-0000-4000-8000-00000000a11c";
const BOB = "c0000000-0000-4000-8000-00000000b0b0";
const CARY = "c0000000-0000-4000-8000-00000000ca24";

const T1 = "70000000-0000-4000-8000-000000000001";
const T2 = "70000000-0000-4000-8000-000000000002";
const T3 = "70000000-0000-4000-8000-000000000003";

const site = (siteId: string, trialId: string, contactId: string): Site =>
  ({ siteId, trialId, contactId, location: "Paddock", region: "SA" }) as Site;

const member = (
  trialId: string,
  contactId: string,
  role: TrialMember["role"] = "collaborator",
): TrialMember => ({
  memberId: `${trialId}-${contactId}`,
  trialId,
  contactId,
  role,
  createdAt: "2026-01-01T00:00:00.000Z",
});

const trial = (trialId: string): Trial => ({ trialId, name: `Trial ${trialId}` }) as Trial;

const TRIALS = [trial(T1), trial(T2), trial(T3)];

// Alice farms T1. Bob farms T2. Cary is an agronomist on T1 with no paddock.
const SITES = [site("s1", T1, ALICE), site("s2", T2, BOB), site("s3", T1, ALICE)];
const MEMBERS = [member(T1, CARY, "viewer")];

describe("who counts as involved", () => {
  it("counts the farmer whose paddock holds a site, with no membership row", () => {
    // The whole reason this is cheap: sites have named their grower since the
    // first migration and nothing ever read it.
    const involved = involvementFor(T1, SITES, []);
    expect(involved.map((entry) => entry.contactId)).toEqual([ALICE]);
    expect(involved[0].reasons).toEqual(["site"]);
  });

  it("counts somebody with no paddock at all", () => {
    const involved = involvementFor(T1, SITES, MEMBERS);
    expect(involved.map((entry) => entry.contactId).sort()).toEqual([ALICE, CARY].sort());
  });

  it("lists a person once when they are involved twice over", () => {
    // Two rows for one person is a list nobody can read and a count nobody can
    // trust.
    const involved = involvementFor(T1, SITES, [member(T1, ALICE, "owner")]);
    expect(involved).toHaveLength(1);
    expect(involved[0].reasons.sort()).toEqual(["member", "site"]);
  });

  it("takes the explicit role over none, whichever way round they arrive", () => {
    // Site ownership names no role, so it must not overwrite one that was set.
    const involved = involvementFor(T1, SITES, [member(T1, ALICE, "owner")]);
    expect(involved[0].role).toBe("owner");
  });

  it("does not leak a person in from another trial", () => {
    expect(involvementFor(T2, SITES, MEMBERS).map((e) => e.contactId)).toEqual([BOB]);
  });

  it("says nobody is involved in a trial with no sites and no members", () => {
    expect(involvementFor(T3, SITES, MEMBERS)).toEqual([]);
  });
});

describe("what one person is involved in", () => {
  it("finds every trial they farm", () => {
    expect(trialsFor({ contactId: ALICE }, TRIALS, SITES, MEMBERS).map((t) => t.trialId)).toEqual([
      T1,
    ]);
  });

  it("includes a trial they only read", () => {
    expect(trialsFor({ contactId: CARY }, TRIALS, SITES, MEMBERS).map((t) => t.trialId)).toEqual([
      T1,
    ]);
  });

  it("gives somebody involved in nothing an empty list, not everything", () => {
    expect(trialsFor({ contactId: "nobody" }, TRIALS, SITES, MEMBERS)).toEqual([]);
  });

  it("answers the direct question too", () => {
    expect(isInvolved({ contactId: BOB }, T2, SITES, MEMBERS)).toBe(true);
    expect(isInvolved({ contactId: BOB }, T1, SITES, MEMBERS)).toBe(false);
  });
});

describe("scoping a list of trials", () => {
  it("says how many it hid, so a short list is not mistaken for the whole list", () => {
    // A filtered list that looks like an unfiltered one is how somebody
    // concludes their trial has been deleted.
    const scoped = scopeTrials({ contactId: ALICE }, TRIALS, SITES, MEMBERS);
    expect(scoped.trials.map((t) => t.trialId)).toEqual([T1]);
    expect(scoped.scoped).toBe(true);
    expect(scoped.hidden).toBe(2);
  });

  it("shows an unidentified viewer everything, and admits it did not filter", () => {
    // Honest behaviour while reads are open: pretending to filter for somebody
    // the app cannot identify hides trials from staff without protecting
    // anything from anybody.
    const scoped = scopeTrials(anonymousViewer(), TRIALS, SITES, MEMBERS);
    expect(scoped.trials).toHaveLength(3);
    expect(scoped.scoped).toBe(false);
    expect(scoped.hidden).toBe(0);
  });

  it("hides nothing when somebody is on everything", () => {
    const everywhere = [member(T1, CARY), member(T2, CARY), member(T3, CARY)];
    const scoped = scopeTrials({ contactId: CARY }, TRIALS, SITES, everywhere);
    expect(scoped.hidden).toBe(0);
    expect(scoped.scoped).toBe(true);
  });
});

describe("which grower a record belongs to", () => {
  it("takes the grower from the site, not from the top of the contact list", () => {
    // The bug this replaces: every entry in the app was attributed to
    // contacts.find(c => c.role === "grower") — the first grower in the list,
    // whatever trial or paddock the entry came from.
    expect(growerForSite("s2", SITES)).toBe(BOB);
    expect(growerForSite("s1", SITES)).toBe(ALICE);
  });

  it("has no answer rather than a wrong one when there is no site", () => {
    expect(growerForSite(null, SITES)).toBeNull();
    expect(growerForSite("nonexistent", SITES)).toBeNull();
  });
});
