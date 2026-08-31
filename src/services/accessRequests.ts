// Asking to be let in, and seeing who has asked.
//
// Deliberately not local-first, and the only part of this app that is not.
// Everything else is written to IndexedDB first because a paddock has no
// signal — but a request queued on a phone that nobody signs into again is a
// request nobody ever sees, which is worse than being told plainly that it did
// not send. So this one goes straight to the backend and reports honestly when
// it cannot.
//
// It creates nothing and grants nothing. Approving a request is still a
// deliberate act performed by hand in the Supabase dashboard; what this
// removes is the dead end, where somebody with the link is refused and nobody
// ever learns they tried.

import { supabase, isBackendConfigured } from "../lib/supabase";
import { newId } from "../lib/id";
import type { Result } from "../types";

export type AccessRequestStatus = "pending" | "approved" | "declined";

export interface AccessRequest {
  requestId: string;
  name: string;
  email: string;
  reason: string;
  status: AccessRequestStatus;
  handledNote: string;
  requestedAt: string;
  handledAt: string | null;
}

/** Enough of an address to be worth sending to. Not a promise it exists. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export interface RequestInput {
  name: string;
  email: string;
  reason: string;
}

/** What is wrong with a request, in the order somebody would fix it. */
export function requestProblems(input: RequestInput): string[] {
  const problems: string[] = [];
  if (!input.name.trim()) problems.push("Give your name, so whoever reads this knows who asked.");
  if (!looksLikeEmail(input.email)) problems.push("Enter the email address you would sign in with.");
  return problems;
}

export async function submitAccessRequest(input: RequestInput): Promise<Result<string>> {
  const problems = requestProblems(input);
  if (problems.length > 0) return { success: false, error: problems[0] };

  if (!isBackendConfigured() || !supabase) {
    return {
      success: false,
      error: "This copy of the app has no cloud configured, so a request cannot be sent.",
    };
  }

  const { error } = await supabase.from("access_requests").insert({
    request_id: newId(),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    reason: input.reason.trim(),
  });

  if (error) {
    // A repeat is not a failure worth alarming somebody about — they already
    // asked, and telling them so is the honest answer rather than an error.
    if (error.code === "23505") {
      return { success: true, data: "You have already asked. Somebody will be in touch." };
    }
    return { success: false, error: `That could not be sent. ${error.message}` };
  }

  return {
    success: true,
    data: "Your request has been sent. Somebody will be in touch by email.",
  };
}

/** The queue, newest first. Requires a signed-in session; anon cannot read it. */
export async function listAccessRequests(): Promise<AccessRequest[]> {
  if (!isBackendConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("access_requests")
    .select("*")
    .order("requested_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({
    requestId: row.request_id as string,
    name: row.name as string,
    email: row.email as string,
    reason: (row.reason as string) ?? "",
    status: (row.status as AccessRequestStatus) ?? "pending",
    handledNote: (row.handled_note as string) ?? "",
    requestedAt: row.requested_at as string,
    handledAt: (row.handled_at as string | null) ?? null,
  }));
}

/**
 * Mark one dealt with.
 *
 * Note that this does not create an account and cannot. Approving here records
 * a decision; the account is made by hand in the Supabase dashboard, which is
 * the only place that can make one. Saying "approved" in the app before doing
 * that would be the interface claiming something it has not done.
 */
export async function markAccessRequest(
  requestId: string,
  status: Exclude<AccessRequestStatus, "pending">,
  note = "",
): Promise<Result<string>> {
  if (!isBackendConfigured() || !supabase) {
    return { success: false, error: "No cloud is configured." };
  }
  const { error } = await supabase
    .from("access_requests")
    .update({ status, handled_note: note, handled_at: new Date().toISOString() })
    .eq("request_id", requestId);
  if (error) return { success: false, error: error.message };
  return { success: true, data: status === "approved" ? "Marked approved." : "Marked declined." };
}

export const pendingCount = (requests: AccessRequest[]): number =>
  requests.filter((request) => request.status === "pending").length;

/** How long somebody has been waiting, in words. */
export function waitingFor(request: AccessRequest, now: number): string {
  const hours = Math.floor((now - new Date(request.requestedAt).getTime()) / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
