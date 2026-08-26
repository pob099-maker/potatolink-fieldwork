// Confidence for whoever is filling in a form: is my connection going to be a
// problem, and did my last run actually go in? Both questions get asked in the
// paddock, and until now the app only answered them after a save.

import { format } from "date-fns";
import { Link } from "react-router-dom";
import { useOnline } from "../hooks/useOnline";
import { isBackendConfigured } from "../lib/supabase";
import { recentEntriesAtSite } from "../services/events";
import { SyncBadge } from "./ui";
import { syncSentence, type SyncState, type SyncTone } from "../services/syncHealth";
import type { MeasurementEvent, Metric, PracticeArm } from "../types";

/**
 * A standing line above the form saying where entries go. Offline is stated as
 * a normal, safe condition rather than an error — it is the expected case in a
 * paddock, and the app is built for it.
 *
 * A refusal is not. It gets a second line that does not share the first one's
 * colour or its calm, because the two facts are separately true and the
 * reassuring one used to swallow the other whole.
 */
const TONE_STYLES: Record<SyncTone, string> = {
  ok: "bg-success/10 text-success",
  offline: "bg-warning/15 text-warning",
  local: "bg-ink/5 text-ink-soft",
  danger: "bg-success/10 text-success",
};

const TONE_MARKS: Record<SyncTone, string> = {
  ok: "●",
  offline: "◌",
  local: "📁",
  danger: "●",
};

export function SyncReassurance({ state }: { state: SyncState }) {
  const online = useOnline();
  const backend = isBackendConfigured();
  const sentence = syncSentence(state, { online, backend });

  return (
    <div className="flex flex-col gap-2">
      <p className={`rounded-lg p-2.5 text-sm ${TONE_STYLES[sentence.tone]}`}>
        <span aria-hidden>{TONE_MARKS[sentence.tone]}</span> {sentence.text}
      </p>
      {/* Its own line, its own colour, and a live region — because this is the
          one thing on the screen somebody must not scroll past. Folding it into
          the green line above is exactly how sixteen dead entries passed for
          "waiting to send". */}
      {sentence.alert ? (
        <p
          role="alert"
          className="rounded-lg bg-danger/15 p-2.5 text-sm font-medium text-danger"
        >
          ⚠ {sentence.alert} Tell whoever set the trial up — the dashboard says why.
        </p>
      ) : null}
    </div>
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
      className="rounded-xl border border-line bg-surface p-4"
    >
      <h2 className="font-semibold">Already recorded here</h2>
      <ul className="mt-2 divide-y divide-line text-sm">
        {recent.map(({ event, summary }) => {
          const arm = arms.find((candidate) => candidate.armId === event.armId);
          return (
            <li key={event.eventId} className="flex flex-wrap items-baseline gap-2 py-2">
              {/* Plot first, because "have I already done plot 7?" is the
                  question somebody walking a trial is actually asking, and the
                  list could not answer it. */}
              {event.plot !== null ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary dark:bg-primary-soft/20 dark:text-primary-soft">
                  Plot {event.plot}
                </span>
              ) : null}
              <span className="font-medium">
                {format(new Date(event.eventDate), "d MMM, h:mm a")}
              </span>
              {arm ? (
                <span className="text-ink-soft">{arm.name}</span>
              ) : null}
              {summary ? (
                <span className="text-ink-soft">{summary}</span>
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
