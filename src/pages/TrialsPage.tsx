import { Link } from "react-router-dom";
import { useArms, useEvents, useSites, useTrials } from "../hooks/useCollections";
import { eventsForTrial, tallySync } from "../services/events";
import {
  Card,
  EmptyState,
  ErrorState,
  PageTitle,
  Skeleton,
  StatusPill,
  SyncTallyLine,
} from "../components/ui";

export function TrialsPage() {
  const trials = useTrials();
  const sites = useSites();
  const arms = useArms();
  const events = useEvents();

  if (trials.isError) {
    return (
      <ErrorState message="Could not load trials." onRetry={() => void trials.refetch()} />
    );
  }

  return (
    <div className="space-y-4">
      <PageTitle>Trials</PageTitle>
      {trials.isPending ? (
        <Card>
          <Skeleton lines={4} />
        </Card>
      ) : (trials.data ?? []).length === 0 ? (
        <EmptyState
          message="No trials yet."
          action={{ label: "Go to dashboard", to: "/" }}
        />
      ) : (
        (trials.data ?? []).map((trial) => (
          <Card key={trial.trialId}>
            <Link
              to={`/trials/${trial.trialId}`}
              className="font-display text-lg font-bold text-primary hover:underline dark:text-primary-soft"
            >
              {trial.name}
            </Link>
            <p className="mt-1 text-sm text-ink/70 dark:text-ink-dark/70">{trial.objective}</p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <StatusPill status={trial.status} />
              <span className="text-ink/60 dark:text-ink-dark/60">
                {(() => {
                  const count = (sites.data ?? []).filter(
                    (site) => site.trialId === trial.trialId,
                  ).length;
                  return `${count} ${count === 1 ? "site" : "sites"}`;
                })()}
              </span>
              {/* Per trial, so a team scanning this list sees the state of
                  theirs rather than a total across everybody's. */}
              <SyncTallyLine
                tally={tallySync(
                  eventsForTrial(
                    events.data ?? [],
                    trial.trialId,
                    sites.data ?? [],
                    arms.data ?? [],
                  ),
                )}
              />
            </p>
          </Card>
        ))
      )}
    </div>
  );
}
