// Confidence for whoever is filling in a form: is my connection going to be a
// problem, and did my last run actually go in? Both questions get asked in the
// paddock, and until now the app only answered them after a save.

import { format } from "date-fns";
import { Link } from "react-router-dom";
import { useOnline } from "../hooks/useOnline";
import { isBackendConfigured } from "../lib/supabase";
import { recentEntriesAtSite } from "../services/events";
import { SyncBadge } from "./ui";
import type { MeasurementEvent, Metric, PracticeArm } from "../types";

/**
 * A standing line above the form saying where entries go. Offline is stated as
 * a normal, safe condition rather than an error — it is the expected case in a
 * paddock, and the app is built for it.
 */
export function SyncReassurance({ pendingCount }: { pendingCount: number }) {
  const online = useOnline();
  const backend = isBackendConfigured();

  const waiting =
    pendingCount > 0
      ? ` ${pendingCount} ${pendingCount === 1 ? "entry is" : "entries are"} waiting to send.`
      : "";

  if (!backend) {
    return (
      <p className="rounded-lg bg-surface-dark/5 p-2.5 text-sm text-ink/70 dark:bg-surface/5 dark:text-ink-dark/70">
        📁 Saving to this device only.{waiting}
      </p>
    );
  }

  return online ? (
    <p className="rounded-lg bg-success/10 p-2.5 text-sm text-success">
      ● Connected — entries send as you save.{waiting}
    </p>
  ) : (
    <p className="rounded-lg bg-warning/15 p-2.5 text-sm text-warning">
      ◌ No signal — entries save on this device and send themselves when you are back in
      range.{waiting}
    </p>
  );
}

/**
 * The last few entries at this site, so a grower can confirm their run is in
 * without leaving the form. Shows everyone's entries at the site, not just this
 * device's — which also stops the same run being recorded twice.
 *
 * Seeing your entry listed is exactly when you notice the wrong number in it,
 * so each row opens for correction.
 */
export function RecentEntries({
  events,
  metrics,
  arms,
  trialId,
  siteId,
}: {
  events: MeasurementEvent[];
  metrics: Metric[];
  arms: PracticeArm[];
  trialId: string;
  siteId: string | null;
}) {
  if (!siteId) return null;
  const recent = recentEntriesAtSite(events, metrics, trialId, siteId);
  if (recent.length === 0) return null;

  return (
    <section
      aria-label="Recent entries at this site"
      className="rounded-xl border border-ink/10 bg-surface p-4 dark:border-ink-dark/10 dark:bg-surface-dark"
    >
      <h2 className="font-semibold">Already recorded here</h2>
      <ul className="mt-2 divide-y divide-ink/10 text-sm dark:divide-ink-dark/10">
        {recent.map(({ event, summary }) => {
          const arm = arms.find((candidate) => candidate.armId === event.armId);
          return (
            <li key={event.eventId} className="flex flex-wrap items-baseline gap-2 py-2">
              <span className="font-medium">
                {format(new Date(event.eventDate), "d MMM, h:mm a")}
              </span>
              {arm ? (
                <span className="text-ink/60 dark:text-ink-dark/60">{arm.name}</span>
              ) : null}
              {summary ? (
                <span className="text-ink/60 dark:text-ink-dark/60">{summary}</span>
              ) : null}
              <SyncBadge status={event.syncStatus} />
              <Link
                to={`/trials/${trialId}/entry?edit=${event.eventId}`}
                aria-label={`Correct the entry from ${format(
                  new Date(event.eventDate),
                  "d MMM, h:mm a",
                )}`}
                className="ml-auto min-h-11 px-2 py-2.5 font-medium text-primary underline dark:text-primary-soft"
              >
                Fix
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
