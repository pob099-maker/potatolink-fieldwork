import { useMemo } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  useArms,
  useEvents,
  useSites,
  useTemplates,
  useTrials,
} from "../hooks/useCollections";
import { describeEvent, describeEventScope, eventsForTrial } from "../services/events";
import { Card, EmptyState, ErrorState, PageTitle, Skeleton, StatusPill, SyncBadge } from "../components/ui";

export function DashboardPage() {
  const trials = useTrials();
  const sites = useSites();
  const arms = useArms();
  const events = useEvents();
  const templates = useTemplates();

  const loading = trials.isPending || sites.isPending || events.isPending || arms.isPending;
  const failed = trials.isError || sites.isError || events.isError;

  const syncSummary = useMemo(() => {
    const summary = { pending: 0, synced: 0, error: 0 };
    for (const event of events.data ?? []) summary[event.syncStatus] += 1;
    return summary;
  }, [events.data]);

  const recentEvents = useMemo(
    () =>
      [...(events.data ?? [])]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5),
    [events.data],
  );

  if (failed) {
    return (
      <ErrorState
        message="Could not load trial data from this device."
        onRetry={() => void trials.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>Dashboard</PageTitle>
        <Link
          to="/trials/new"
          className="min-h-11 rounded-lg bg-primary px-4 py-2 font-medium text-white"
        >
          + New trial
        </Link>
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">Sync status</h2>
        {events.isPending ? (
          <Skeleton lines={1} />
        ) : (
          <div className="flex flex-wrap gap-4">
            <span>
              <SyncBadge status="pending" /> {syncSummary.pending}
            </span>
            <span>
              <SyncBadge status="synced" /> {syncSummary.synced}
            </span>
            <span>
              <SyncBadge status="error" /> {syncSummary.error}
            </span>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Trials</h2>
        {loading ? (
          <Skeleton lines={4} />
        ) : (trials.data ?? []).length === 0 ? (
          <EmptyState message="No trials yet. Create the first one to get started." />
        ) : (
          <ul className="divide-y divide-ink/10 dark:divide-ink-dark/10">
            {(trials.data ?? []).map((trial) => {
              const siteCount = (sites.data ?? []).filter(
                (site) => site.trialId === trial.trialId,
              ).length;
              const entryCount = eventsForTrial(
                events.data ?? [],
                trial.trialId,
                sites.data ?? [],
                arms.data ?? [],
              ).length;
              return (
                <li key={trial.trialId} className="py-3">
                  <Link
                    to={`/trials/${trial.trialId}`}
                    className="font-medium text-primary hover:underline dark:text-primary-soft"
                  >
                    {trial.name}
                  </Link>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink/60 dark:text-ink-dark/60">
                    <StatusPill status={trial.status} />
                    <span>
                      {siteCount} {siteCount === 1 ? "site" : "sites"}
                    </span>
                    <span>
                      {entryCount} {entryCount === 1 ? "entry" : "entries"}
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Recent entries</h2>
        {events.isPending ? (
          <Skeleton lines={3} />
        ) : recentEvents.length === 0 ? (
          <EmptyState message="No entries recorded yet." />
        ) : (
          <ul className="divide-y divide-ink/10 dark:divide-ink-dark/10">
            {recentEvents.map((event) => {
              const arm = (arms.data ?? []).find((candidate) => candidate.armId === event.armId);
              return (
                <li key={event.eventId} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="font-medium">
                    {describeEventScope(event, sites.data ?? [])}
                  </span>
                  <span className="text-ink/60 dark:text-ink-dark/60">
                    {arm?.name ?? describeEvent(event, templates.data ?? [])}
                  </span>
                  <span className="text-ink/50 dark:text-ink-dark/50">
                    {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                  </span>
                  <SyncBadge status={event.syncStatus} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
