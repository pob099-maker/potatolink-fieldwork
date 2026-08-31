// Asking to be let in.
//
// Once sign-ups are closed, somebody with the link who types their email at
// the sign-in screen is refused, and that is the whole of it: no route
// forward, and nobody ever learns they tried. The only way in becomes knowing
// somebody already.
//
// This is the way forward. It is honest about what it is — a message, not an
// account — because an interface that says "request sent" and implies access
// is coming has made a promise on somebody else's behalf.

import { useState } from "react";
import {
  requestProblems,
  submitAccessRequest,
  type RequestInput,
} from "../services/accessRequests";
import { Card, ErrorState, PageTitle } from "./ui";

const inputClass =
  "min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 py-2";

export function AccessRequestForm({ onCancel }: { onCancel: () => void }) {
  const [input, setInput] = useState<RequestInput>({ name: "", email: "", reason: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof RequestInput>(key: K, value: RequestInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));

  async function onSubmit(): Promise<void> {
    setSending(true);
    setError(null);
    const result = await submitAccessRequest(input);
    setSending(false);
    if (result.success) setSent(result.data);
    else setError(result.error);
  }

  if (sent) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <p className="text-4xl" aria-hidden>
          📨
        </p>
        <PageTitle>Request sent</PageTitle>
        <p className="mt-2 text-ink-soft">{sent}</p>
        {/* Said plainly. Nothing has been granted, and letting somebody sit
            refreshing the sign-in screen expecting it to open would be unkind
            as well as untrue. */}
        <p className="mt-2 text-sm text-ink-soft">
          Nothing has changed yet — an account has to be created by whoever runs the
          project. You will hear by email when it has.
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
        >
          Back to sign-in
        </button>
      </Card>
    );
  }

  const problems = requestProblems(input);

  return (
    <Card className="mx-auto max-w-md">
      <PageTitle>Ask for access</PageTitle>
      <p className="mt-2 text-ink-soft">
        Accounts are made by hand, so this sends a message rather than signing you up.
        Somebody running the project will read it.
      </p>

      <form
        className="mt-4 space-y-3"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          void onSubmit();
        }}
      >
        <label className="block text-sm font-medium">
          Your name
          <input
            value={input.name}
            onChange={(event) => set("name", event.target.value)}
            autoComplete="name"
            className={inputClass}
          />
        </label>

        <label className="block text-sm font-medium">
          The email you would sign in with
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={input.email}
            onChange={(event) => set("email", event.target.value)}
            placeholder="you@example.org"
            className={inputClass}
          />
        </label>

        <label className="block text-sm font-medium">
          Why you need it
          <textarea
            rows={3}
            value={input.reason}
            onChange={(event) => set("reason", event.target.value)}
            placeholder="Optional — e.g. I am the agronomist at Walkers Flat"
            className={inputClass}
          />
          <span className="mt-1 block text-sm font-normal text-ink-soft">
            Optional, and the most useful thing you can write. An address on its own
            cannot say who you are.
          </span>
        </label>

        {error ? <ErrorState message={error} /> : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={sending || problems.length > 0}
            className="min-h-11 flex-1 rounded-lg bg-primary px-4 py-2.5 font-medium text-white disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send the request"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
          >
            Cancel
          </button>
        </div>

        {problems.length > 0 ? (
          <p className="text-sm text-ink-soft">{problems[0]}</p>
        ) : null}
      </form>

      {/* The other audience, and the one most likely to be here by mistake:
          somebody sent a recording link who followed it to the wrong place. */}
      <p className="mt-4 border-t border-line pt-3 text-sm text-ink-soft">
        Recording an observation needs no account at all — if you were sent a link for
        that, open it and you are already through.
      </p>
    </Card>
  );
}
