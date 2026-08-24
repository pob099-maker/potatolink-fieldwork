import { useMemo } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  useArms,
  useEvents,
  useSites,
  useSyncTrouble,
  useTemplates,
  useTrials,
} from "../hooks/useCollections";
import { describeEvent, describeEventScope, eventsForTrial } from "../services/events";
import { Card, EmptyState, ErrorState, PageTitle, Skeleton, StatusPill, SyncBadge } from "../components/ui";

/**
 * What this is, and which part of it is yours.
 *
 * The dashboard used to open on a sync readout — an operator's question,
 * answered before anybody had been told what the app was for. Three people use
 * this: whoever designs a trial, whoever runs it, and whoever records in the
 * field. Each arrives looking for a different thing, and none of them was
 * being pointed anywhere.
 */
function StartHere() {
  const routes = [
    {
      to: "/trials/new",
      role: "Designing a trial",
      what: "Import a written protocol as a spreadsheet, or build one here: sites, the practices being compared, and the questions asked in the field.",
    },
    {
      to: "/trials",
      role: "Running one",
      what: "What has been recorded, whether a replicated design is filled in, and the data out as a CSV for analysis.",
    },
    {
      to: "/trials",
      role: "Recording observations",
      what: "Open a trial and use its entry links. Four questions a screen, photos and video, and it keeps working with no signal.",
    },
  ];

  return (
    <Card className="border-accent/50">
      <h2 className="font-display text-lg font-bold">Start here</h2>
      <p className="mt-1 text-ink/70 dark:text-ink-dark/70">
        Fieldwork records what happens in a field trial and turns it into data you can
        analyse. Nothing in it is specific to one crop — trials, sites, practices and
        questions are all set up in the app.
      </p>
      <ul className="mt-3 divide-y divide-ink/10 dark:divide-ink-dark/10">
        {routes.map((route) => (
          <li key={route.role} className="py-2">
            <Link
              to={route.to}
              className="font-medium text-primary hover:underline dark:text-primary-soft"
            >
              {route.role}
            </Link>
            <p className="text-sm text-ink/60 dark:text-ink-dark/60">{route.what}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-ink/10 pt-3 text-sm text-ink/60 dark:border-ink-dark/10 dark:text-ink-dark/60">
        <span className="font-medium text-warning">The trials below are examples.</span>{" "}
        The costs and returns behind Results &amp; economics are stand-in figures, not any
        grower's real numbers — the page says so above every total.
      </p>
    </Card>
  );
}

export function DashboardPage() {
  const trials = useTrials();
  const sites = useSites();
  const arms = useArms();
  const events = useEvents();
  const templates = useTemplates();

  const loading = trials.isPending || sites.isPending || events.isPending || arms.isPending;
  const failed = trials.isError || sites.isError || events.isError;

  const trouble = useSyncTrouble();
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

      <StartHere />

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
        {trouble.data ? (
          <div className="mt-3 rounded-lg bg-warning/15 p-3 text-sm">
            <p className="font-medium text-warning">
              {trouble.data.count} setup{" "}
              {trouble.data.count === 1 ? "record is" : "records are"} waiting to reach the
              cloud, and the last attempt was refused.
            </p>
            <p className="mt-1 text-ink/70 dark:text-ink-dark/70">
              Nothing has been lost — it is all saved on this device and will go up once
              the cause is fixed. The cloud said:{" "}
              <span className="font-mono">{trouble.data.message}</span>
            </p>
          </div>
        ) : null}
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
