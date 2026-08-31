// Who has asked to be let in.
//
// The other half of the request form, and the half that makes it worth having.
// A request nobody sees is the same dead end wearing a different hat — the
// person asked, the app accepted it, and it sat in a table until somebody
// happened to open the Supabase dashboard.
//
// So it is on the dashboard, above the trials, and only when there is
// something waiting. A permanent empty panel is a thing to learn to ignore,
// and the one time it matters it will have been ignored.
//
// Approving here records a decision and creates nothing. The account is made
// by hand in the dashboard, which is the only place that can make one; saying
// "approved" in the app and stopping there would be the interface claiming
// something it has not done, so it says so.

import { useEffect, useState } from "react";
import {
  listAccessRequests,
  markAccessRequest,
  pendingCount,
  waitingFor,
  type AccessRequest,
} from "../services/accessRequests";
import { Card, CardTitle } from "./ui";

export function AccessQueue() {
  const [requests, setRequests] = useState<AccessRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setRequests(await listAccessRequests());
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (!requests) return null;
  const waiting = requests.filter((request) => request.status === "pending");
  if (waiting.length === 0) return null;

  async function handle(
    request: AccessRequest,
    status: "approved" | "declined",
  ): Promise<void> {
    setBusy(request.requestId);
    await markAccessRequest(request.requestId, status);
    setBusy(null);
    await refresh();
  }

  return (
    <Card tone="feature">
      <CardTitle>
        {pendingCount(requests)} {pendingCount(requests) === 1 ? "person has" : "people have"}{" "}
        asked for access
      </CardTitle>
      <p className="mt-1 text-sm text-ink-soft">
        Marking one approved records the decision. It does not create the account — that
        is done by hand in Supabase, under Authentication → Users.
      </p>

      <ul className="mt-3 divide-y divide-line">
        {waiting.map((request) => (
          <li key={request.requestId} className="py-3">
            <p className="font-medium">{request.name}</p>
            <p className="text-sm text-ink-soft">
              <a href={`mailto:${request.email}`} className="underline">
                {request.email}
              </a>{" "}
              · asked {waitingFor(request, Date.now())}
            </p>
            {request.reason ? (
              <p className="mt-1 text-sm text-ink-soft">“{request.reason}”</p>
            ) : (
              <p className="mt-1 text-sm text-ink-faint">No reason given.</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy === request.requestId}
                onClick={() => void handle(request, "approved")}
                className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium disabled:opacity-60"
              >
                Mark approved
              </button>
              <button
                type="button"
                disabled={busy === request.requestId}
                onClick={() => void handle(request, "declined")}
                className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium text-danger disabled:opacity-60"
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
