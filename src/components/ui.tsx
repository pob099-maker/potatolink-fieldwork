import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { SyncTally } from "../services/events";
import { Link } from "react-router-dom";
import { applyUpdate, onUpdateReady } from "../services/appUpdate";
import type { SyncStatus } from "../types";

/**
 * How much of the page's attention a card is asking for.
 *
 * There used to be one card, so a trial page was fourteen identical boxes and
 * nothing on it could say "start here" or "this one is dangerous". Weight is
 * information: a reader should be able to tell what matters without reading
 * every heading in order, and "Remove this trial" should not look like
 * "Response summary".
 */
export type CardTone = "default" | "feature" | "quiet" | "danger";

const TONE_STYLES: Record<CardTone, string> = {
  // The ordinary case: a raised panel on the page ground.
  default: "border-line bg-surface shadow-sm",
  // The one thing to act on. A gold rail rather than a gold fill, so it draws
  // the eye without turning the brand accent into a background nobody can read
  // text on.
  feature: "border-line border-l-4 border-l-accent bg-surface shadow-sm",
  // Reference material — settings, provenance, design that is already decided.
  // Recessed instead of raised: present, clearly not the point.
  quiet: "border-line bg-sunk",
  danger: "border-danger/40 bg-surface",
};

export function Card({
  children,
  tone = "default",
  className = "",
}: {
  children: ReactNode;
  tone?: CardTone;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border p-4 sm:p-5 ${TONE_STYLES[tone]} ${className}`}>
      {children}
    </section>
  );
}

/* Heading level, tracked rather than hard-coded.
 *
 * A card's title is an h2 on a page that is a flat list of cards, and an h3
 * once those cards are grouped under section headings. Getting that wrong is
 * invisible on screen and obvious to anybody navigating by headings, so the
 * grouping component says which it is and the cards inside follow. */
const SectionDepth = createContext(false);

export function CardTitle({ children }: { children: ReactNode }) {
  const nested = useContext(SectionDepth);
  const className = "font-display text-title";
  return nested ? <h3 className={className}>{children}</h3> : <h2 className={className}>{children}</h2>;
}

/** A small tracked label. Uppercase lives here and in the page title, nowhere else. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-display text-eyebrow uppercase text-ink-faint">{children}</p>;
}

/**
 * A named group of cards.
 *
 * The point is ordering by job rather than by data model: what is happening,
 * how to collect, how to read it, how to change it. A reader looking for the
 * entry links should be able to skip three quarters of the page.
 */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <SectionDepth.Provider value={true}>
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5 border-b-2 border-accent/50 pb-1.5">
          <h2 className="font-display text-title text-primary dark:text-primary-soft">{title}</h2>
          {description ? <p className="text-sm text-ink-soft">{description}</p> : null}
        </div>
        {children}
      </section>
    </SectionDepth.Provider>
  );
}

/**
 * A section somebody opens only if they need it.
 *
 * Built on <details> rather than React state on purpose: it is keyboard
 * operable, announced correctly by a screen reader, findable by the browser's
 * own in-page search, and works before any JavaScript has run. Reimplementing
 * that with a button and a boolean is a lot of code to arrive back where the
 * platform already was.
 *
 * The summary carries a one-line answer, so a folded section still says what
 * is inside it — "No station set" is information; a chevron is not.
 */
export function Foldaway({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-line bg-sunk [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 p-4 sm:p-5">
        <span
          aria-hidden
          className="font-display text-ink-faint transition-transform group-open:rotate-90"
        >
          ▸
        </span>
        <span className="flex-1">
          <span className="block font-display text-title">{title}</span>
          {summary ? <span className="block text-sm text-ink-soft">{summary}</span> : null}
        </span>
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
    </details>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-display text-ink">{children}</h1>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-hidden className="animate-pulse space-y-2">
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className="h-4 rounded bg-ink/10" />
      ))}
    </div>
  );
}

export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: { label: string; to: string };
}) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong p-6 text-center text-ink-soft">
      <p>{message}</p>
      {action ? (
        <Link
          to={action.to}
          className="mt-3 inline-block min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-danger">
      <p>{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 min-h-11 rounded-lg border border-danger px-4 py-2 font-medium"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

/**
 * Reported, not requested.
 *
 * The new version has already taken over by the time this appears — see
 * sw/service-worker.js for why it no longer waits to be asked. What has not
 * changed is that nothing reloads on its own: the page keeps running the code
 * it loaded, so a half-finished entry form survives until somebody chooses to
 * reload. The banner says what happened and leaves the timing to them.
 */
export function UpdateBanner() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onUpdateReady(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <div
      role="status"
      className="border-b border-line bg-accent/20 px-4 py-2.5 text-sm text-ink"
    >
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
        <span>Fieldwork has updated. Reload when it suits — nothing on this screen will be lost.</span>
        <button
          type="button"
          onClick={applyUpdate}
          className="min-h-11 rounded-lg bg-primary px-4 font-medium text-white"
        >
          Reload
        </button>
      </div>
    </div>
  );
}

const SYNC_LABELS: Record<SyncStatus, string> = {
  pending: "Waiting to sync",
  synced: "Synced",
  error: "Sync error",
};

const SYNC_STYLES: Record<SyncStatus, string> = {
  pending: "bg-warning/15 text-warning",
  synced: "bg-success/15 text-success",
  error: "bg-danger/15 text-danger",
};

export function SyncBadge({ status }: { status: SyncStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-meta font-medium ${SYNC_STYLES[status]}`}
    >
      {SYNC_LABELS[status]}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span className="inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-meta font-medium capitalize text-primary dark:bg-primary-soft/20 dark:text-primary-soft">
      {status}
    </span>
  );
}

/**
 * One trial's entry count and how much of it has reached the cloud. Says
 * "all synced" rather than repeating the total, because the interesting case
 * is the one where something is outstanding.
 */
export function SyncTallyLine({ tally }: { tally: SyncTally }) {
  if (tally.total === 0) {
    return <span className="text-ink-soft">No entries yet</span>;
  }
  return (
    <span className="tabular inline-flex flex-wrap items-center gap-2">
      <span className="text-ink-soft">
        {tally.total} {tally.total === 1 ? "entry" : "entries"}
      </span>
      {tally.pending > 0 ? (
        <span className="inline-flex items-center gap-1">
          <SyncBadge status="pending" /> {tally.pending}
        </span>
      ) : null}
      {tally.error > 0 ? (
        <span className="inline-flex items-center gap-1">
          <SyncBadge status="error" /> {tally.error}
        </span>
      ) : null}
      {tally.pending === 0 && tally.error === 0 ? (
        <span className="text-success">all synced</span>
      ) : null}
    </span>
  );
}

/**
 * Marks one trial as built-in demonstration data. Per trial rather than a
 * blanket notice, because the moment somebody adds a real trial alongside the
 * examples a blanket notice is wrong about half the list.
 */
export function ExamplePill() {
  return (
    <span className="rounded-full bg-accent/30 px-2 py-0.5 text-meta font-medium text-ink">
      Example
    </span>
  );
}
