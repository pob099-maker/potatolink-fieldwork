import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  useArms,
  useEvents,
  useProjects,
  useSites,
  useTrials,
} from "../hooks/useCollections";
import { addTrial } from "../services/store";
import { Card, EmptyState, ErrorState, PageTitle, Skeleton, StatusPill, SyncBadge } from "../components/ui";

export function DashboardPage() {
  const projects = useProjects();
  const trials = useTrials();
  const sites = useSites();
  const arms = useArms();
  const events = useEvents();

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
        <NewTrialButton defaultProjectId={projects.data?.[0]?.projectId ?? null} />
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
              const trialArmIds = new Set(
                (arms.data ?? [])
                  .filter((arm) => arm.trialId === trial.trialId)
                  .map((arm) => arm.armId),
              );
              const entryCount = (events.data ?? []).filter((event) =>
                trialArmIds.has(event.armId),
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
              const site = (sites.data ?? []).find(
                (candidate) => candidate.siteId === event.siteId,
              );
              const arm = (arms.data ?? []).find((candidate) => candidate.armId === event.armId);
              return (
                <li key={event.eventId} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="font-medium">{site?.location ?? "Unknown site"}</span>
                  <span className="text-ink/60 dark:text-ink-dark/60">{arm?.name ?? ""}</span>
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

function NewTrialButton({ defaultProjectId }: { defaultProjectId: string | null }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-lg bg-primary px-4 py-2 font-medium text-white"
      >
        + New trial
      </button>
    );
  }

  return (
    <form
      className="flex w-full flex-col gap-2 rounded-xl border border-ink/10 bg-surface p-3 dark:border-ink-dark/10 dark:bg-surface-dark sm:max-w-md"
      onSubmit={(submitEvent) => {
        submitEvent.preventDefault();
        if (!defaultProjectId) {
          setError("No project available to attach the trial to.");
          return;
        }
        void addTrial({ projectId: defaultProjectId, name, objective }).then((result) => {
          if (result.success) {
            setOpen(false);
            setName("");
            setObjective("");
            setError(null);
          } else {
            setError(result.error);
          }
        });
      }}
    >
      <label htmlFor="new-trial-name" className="text-sm font-medium">
        Trial name
      </label>
      <input
        id="new-trial-name"
        value={name}
        onChange={(changeEvent) => setName(changeEvent.target.value)}
        required
        className="min-h-11 rounded-lg border border-ink/20 bg-surface px-3 dark:border-ink-dark/20 dark:bg-surface-dark"
      />
      <label htmlFor="new-trial-objective" className="text-sm font-medium">
        Objective
      </label>
      <input
        id="new-trial-objective"
        value={objective}
        onChange={(changeEvent) => setObjective(changeEvent.target.value)}
        className="min-h-11 rounded-lg border border-ink/20 bg-surface px-3 dark:border-ink-dark/20 dark:bg-surface-dark"
      />
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" className="min-h-11 flex-1 rounded-lg bg-primary font-medium text-white">
          Create draft
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-11 flex-1 rounded-lg border border-ink/20 font-medium dark:border-ink-dark/20"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
