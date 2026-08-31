// The gate on everything that changes a trial rather than records in one.
//
// Until now every staff page — the dashboard, trial setup, the form editor,
// the importer, the results — was reachable by anyone who had the URL. That
// was fine while the only people with the link were in the room; it is not
// fine once the app goes past the team.

import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { staffGate } from "../services/staffAccess";
import { Card, ErrorState, PageTitle, Skeleton } from "./ui";
import { AccessRequestForm } from "./AccessRequest";

export function RequireStaff({ children }: { children: React.ReactNode }) {
  const { session, ready, required } = useAuth();

  switch (staffGate({ required, signedIn: session !== null, ready })) {
    case "open":
      return <>{children}</>;
    case "waiting":
      return (
        <Card className="mx-auto max-w-md">
          <Skeleton lines={4} />
        </Card>
      );
    case "sign-in":
      return <StaffSignIn />;
  }
}

export function StaffSignIn() {
  const { signIn } = useAuth();
  const [asking, setAsking] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(): Promise<void> {
    setSending(true);
    setError(null);
    const result = await signIn(email, password);
    setSending(false);
    // Nothing to do on success: the session lands, and the gate above this
    // re-renders into the page somebody was trying to reach.
    if (!result.success) setError(result.error);
  }

  // Somebody with the link and no account is refused by the sign-in above and
  // has nowhere to go. This is where they go.
  if (asking) return <AccessRequestForm onCancel={() => setAsking(false)} />;

  return (
    <Card className="mx-auto max-w-md">
      <PageTitle>Staff sign-in</PageTitle>
      <p className="mt-2 text-ink-soft">
        Setting up trials, editing forms and reading the results are for the people
        running the project.
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          void onSubmit();
        }}
      >
        <div>
          <label htmlFor="staff-email" className="mb-1 block text-sm font-medium">
            Your work email
          </label>
          <input
            id="staff-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(changeEvent) => setEmail(changeEvent.target.value)}
            placeholder="you@example.org"
            className="min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3"
          />
        </div>
        <div>
          <label htmlFor="staff-password" className="mb-1 block text-sm font-medium">
            Your password
          </label>
          <input
            id="staff-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(changeEvent) => setPassword(changeEvent.target.value)}
            className="min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3"
          />
        </div>
        {error ? <ErrorState message={error} /> : null}
        <button
          type="submit"
          disabled={sending}
          className="min-h-11 w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-white disabled:opacity-60"
        >
          {sending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 border-t border-line pt-3 text-sm text-ink-soft">
        Recording in the field does not need an account — whoever is on site uses the
        link and code they were given, and is unaffected by this.
      </p>

      {/* Said here rather than left to be discovered. There is no self-service
          reset: a password is set when the account is made, and resetting one
          means asking. For a handful of staff that is less friction than the
          emailed link it replaced, but only if nobody sits waiting for a
          "forgot password" that is never coming. */}
      <p className="mt-3 text-sm text-ink-soft">
        Forgotten it? Ask whoever set your account up — they can set a new one.
      </p>

      <p className="mt-3 text-sm text-ink-soft">
        No account yet?{" "}
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="min-h-11 font-medium text-primary underline dark:text-primary-soft"
        >
          Ask for access
        </button>
      </p>
    </Card>
  );
}
