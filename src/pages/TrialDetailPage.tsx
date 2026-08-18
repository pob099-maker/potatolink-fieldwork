import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  useArms,
  useEvents,
  useMetrics,
  useSites,
  useTrials,
} from "../hooks/useCollections";
import { Card, EmptyState, ErrorState, PageTitle, Skeleton, StatusPill, SyncBadge } from "../components/ui";
import type { Metric } from "../types";

function metricNumber(metrics: Metric[], eventIds: Set<string>, name: string): number[] {
  return metrics
    .filter((metric) => eventIds.has(metric.eventId) && metric.metricName === name)
    .map((metric) => Number(metric.value))
    .filter((value) => Number.isFinite(value));
}

export function TrialDetailPage() {
  const { trialId } = useParams<{ trialId: string }>();
  const trials = useTrials();
  const sites = useSites();
  const arms = useArms();
  const events = useEvents();
  const metrics = useMetrics();

  const loading =
    trials.isPending || sites.isPending || arms.isPending || events.isPending || metrics.isPending;

  const trial = trials.data?.find((candidate) => candidate.trialId === trialId);
  const trialSites = useMemo(
    () => (sites.data ?? []).filter((site) => site.trialId === trialId),
    [sites.data, trialId],
  );
  const trialArms = useMemo(
    () =>
      (arms.data ?? [])
        .filter((arm) => arm.trialId === trialId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [arms.data, trialId],
  );

  if (loading) {
    return (
      <Card>
        <Skeleton lines={8} />
      </Card>
    );
  }

  if (trials.isError) {
    return <ErrorState message="Could not load this trial." onRetry={() => void trials.refetch()} />;
  }

  if (!trial) {
    return (
      <EmptyState message="Trial not found." action={{ label: "All trials", to: "/trials" }} />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <PageTitle>{trial.name}</PageTitle>
        <p className="mt-1 text-ink/70 dark:text-ink-dark/70">{trial.objective}</p>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <StatusPill status={trial.status} />
          {trialSites.map((site) => (
            <span key={site.siteId} className="text-ink/60 dark:text-ink-dark/60">
              📍 {site.location}
            </span>
          ))}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          to={`/trials/${trial.trialId}/entry`}
          className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
        >
          Grower entry form
        </Link>
        <Link
          to={`/trials/${trial.trialId}/results`}
          className="min-h-11 rounded-lg border border-primary px-4 py-2.5 font-medium text-primary dark:text-primary-soft"
        >
          Results &amp; economics
        </Link>
      </div>

      {trialArms.length === 0 ? (
        <EmptyState message="No practice arms configured for this trial yet." />
      ) : (
        trialArms.map((arm) => {
          const armEvents = (events.data ?? []).filter((event) => event.armId === arm.armId);
          const eventIds = new Set(armEvents.map((event) => event.eventId));
          const tonnes = metricNumber(metrics.data ?? [], eventIds, "tonnesHandled");
          const durations = metricNumber(metrics.data ?? [], eventIds, "runDuration");
          const totalTonnes = tonnes.reduce((sum, value) => sum + value, 0);
          const totalHours = durations.reduce((sum, value) => sum + value, 0);

          return (
            <Card key={arm.armId}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg font-bold">{arm.name}</h2>
                <StatusPill status={arm.type} />
              </div>
              <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">{arm.description}</p>

              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-paper p-2 dark:bg-paper-dark">
                  <dt className="text-xs text-ink/60 dark:text-ink-dark/60">Entries</dt>
                  <dd className="font-display text-xl font-bold">{armEvents.length}</dd>
                </div>
                <div className="rounded-lg bg-paper p-2 dark:bg-paper-dark">
                  <dt className="text-xs text-ink/60 dark:text-ink-dark/60">Total tonnes</dt>
                  <dd className="font-display text-xl font-bold">
                    {totalTonnes > 0 ? totalTonnes.toFixed(1) : "–"}
                  </dd>
                </div>
                <div className="rounded-lg bg-paper p-2 dark:bg-paper-dark">
                  <dt className="text-xs text-ink/60 dark:text-ink-dark/60">Avg t/hr</dt>
                  <dd className="font-display text-xl font-bold">
                    {totalHours > 0 ? (totalTonnes / totalHours).toFixed(1) : "–"}
                  </dd>
                </div>
              </dl>

              {armEvents.length > 0 ? (
                <ul className="mt-3 divide-y divide-ink/10 text-sm dark:divide-ink-dark/10">
                  {armEvents
                    .sort((a, b) => b.eventDate.localeCompare(a.eventDate))
                    .map((event) => {
                      const site = trialSites.find(
                        (candidate) => candidate.siteId === event.siteId,
                      );
                      return (
                        <li key={event.eventId} className="flex flex-wrap items-center gap-2 py-2">
                          <span>{format(new Date(event.eventDate), "d MMM yyyy")}</span>
                          <span className="text-ink/60 dark:text-ink-dark/60">
                            {site?.location ?? "Unknown site"}
                          </span>
                          <SyncBadge status={event.syncStatus} />
                        </li>
                      );
                    })}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-ink/50 dark:text-ink-dark/50">
                  No measurement events for this arm yet.
                </p>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
