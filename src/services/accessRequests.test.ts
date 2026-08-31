import { describe, expect, it } from "vitest";
import {
  looksLikeEmail,
  pendingCount,
  requestProblems,
  submitAccessRequest,
  supabaseUsersUrl,
  waitingFor,
  type AccessRequest,
} from "./accessRequests";

// The dead end this removes: with sign-ups closed, somebody who has the link
// types their email, is refused, and nothing tells anybody they tried.

const request = (over: Partial<AccessRequest> = {}): AccessRequest => ({
  requestId: "r1",
  name: "Jo Brown",
  email: "jo@example.com",
  reason: "",
  status: "pending",
  handledNote: "",
  requestedAt: "2026-06-01T12:00:00.000Z",
  handledAt: null,
  ...over,
});

describe("what makes a request worth sending", () => {
  it("wants a name, because an address alone does not say who asked", () => {
    expect(requestProblems({ name: "", email: "jo@example.com", reason: "" })).toContain(
      "Give your name, so whoever reads this knows who asked.",
    );
  });

  it("wants an address that could be signed in with", () => {
    expect(requestProblems({ name: "Jo", email: "jo", reason: "" })).toHaveLength(1);
    expect(requestProblems({ name: "Jo", email: "jo@example.com", reason: "" })).toEqual([]);
  });

  it("does not insist on a reason", () => {
    // Useful, but demanding it turns asking into an essay.
    expect(requestProblems({ name: "Jo", email: "jo@example.com", reason: "" })).toEqual([]);
  });
});

describe("recognising an address", () => {
  it("accepts an ordinary one", () => {
    expect(looksLikeEmail("jo.brown@potatolink.com.au")).toBe(true);
    expect(looksLikeEmail("  jo@example.com  ")).toBe(true);
  });

  it("rejects what plainly is not one", () => {
    expect(looksLikeEmail("jo")).toBe(false);
    expect(looksLikeEmail("jo@")).toBe(false);
    expect(looksLikeEmail("jo@example")).toBe(false);
    expect(looksLikeEmail("")).toBe(false);
  });
});

describe("sending one with no cloud configured", () => {
  it("says so rather than appearing to work", () => {
    // The tests run with the credentials blanked, so this is the real path a
    // local build takes — and silently swallowing it would leave somebody
    // believing they had asked.
    return submitAccessRequest({
      name: "Jo",
      email: "jo@example.com",
      reason: "",
    }).then((result) => {
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toMatch(/no cloud/i);
    });
  });

  it("still refuses an invalid one first", () => {
    return submitAccessRequest({ name: "", email: "nope", reason: "" }).then((result) => {
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toMatch(/name/i);
    });
  });
});

describe("the queue", () => {
  it("counts only what is still waiting", () => {
    expect(
      pendingCount([
        request(),
        request({ requestId: "r2", status: "approved" }),
        request({ requestId: "r3", status: "declined" }),
        request({ requestId: "r4" }),
      ]),
    ).toBe(2);
  });

  it("says how long somebody has been waiting", () => {
    const now = Date.parse("2026-06-03T12:00:00.000Z");
    expect(waitingFor(request(), now)).toBe("2 days ago");
    expect(waitingFor(request({ requestedAt: "2026-06-03T09:00:00.000Z" }), now)).toBe(
      "3 hours ago",
    );
    expect(waitingFor(request({ requestedAt: "2026-06-03T11:45:00.000Z" }), now)).toBe(
      "just now",
    );
  });
});

describe("the link to where the account gets made", () => {
  // The one manual step left in letting somebody in should not also be a
  // navigation exercise.
  it("returns nothing when there is no backend to link to", () => {
    // Tests run with the credentials blanked, so this is the real path — and
    // a dashboard link to a project that is not configured would be a dead
    // end dressed as help.
    expect(supabaseUsersUrl()).toBeNull();
  });
});
