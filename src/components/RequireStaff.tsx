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
  const { sendLink } = useAuth();
  const [asking, setAsking] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(): Promise<void> {
    setSending(true);
    setError(null);
    const result = await sendLink(email);
    setSending(false);
    if (result.success) setSent(result.data);
    else setError(result.error);
  }

  // Somebody with the link and no account is refused by the sign-in above and
  // has nowhere to go. This is where they go.
  if (asking) return <AccessRequestForm onCancel={() => setAsking(false)} />;

  if (sent) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <p className="text-4xl" aria-hidden>
          📬
        </p>
        <PageTitle>Check your email</PageTitle>
        <p className="mt-2 text-ink-soft">{sent}</p>
        <p className="mt-2 text-sm text-ink-soft">
          Open it on this device and you will land back here, signed in. The link works
          once and expires after an hour.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-md">
      <PageTitle>Staff sign-in</PageTitle>
      <p className="mt-2 text-ink-soft">
        Setting up trials, editing forms and reading the results are for the people
        running the project. We will email you a link — there is no password to set.
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
        {error ? <ErrorState message={error} /> : null}
        <button
          type="submit"
          disabled={sending}
          className="min-h-11 w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-white disabled:opacity-60"
        >
          {sending ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
      <p className="mt-4 border-t border-line pt-3 text-sm text-ink-soft">
        Recording in the field does not need an account — whoever is on site uses the
        link and code they were given, and is unaffected by this.
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
