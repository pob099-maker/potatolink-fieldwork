import type { ReactNode } from "react";
import type { SyncTally } from "../services/events";
import { Link } from "react-router-dom";
import type { SyncStatus } from "../types";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-xl border border-ink/10 bg-surface p-4 shadow-sm dark:border-ink-dark/10 dark:bg-surface-dark ${className}`}
    >
      {children}
    </section>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-bold text-ink dark:text-ink-dark">{children}</h1>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-hidden className="animate-pulse space-y-2">
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className="h-4 rounded bg-ink/10 dark:bg-ink-dark/10" />
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
    <div className="rounded-xl border border-dashed border-ink/20 p-6 text-center text-ink/60 dark:border-ink-dark/20 dark:text-ink-dark/60">
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
    <div
      role="alert"
      className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-danger"
    >
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
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${SYNC_STYLES[status]}`}
    >
      {SYNC_LABELS[status]}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span className="inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium capitalize text-primary dark:bg-primary-soft/20 dark:text-primary-soft">
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
    return (
      <span className="text-ink/60 dark:text-ink-dark/60">No entries yet</span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-ink/60 dark:text-ink-dark/60">
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
    <span className="rounded-full bg-accent/30 px-2 py-0.5 text-xs font-medium text-ink dark:text-ink-dark">
      Example
    </span>
  );
}
