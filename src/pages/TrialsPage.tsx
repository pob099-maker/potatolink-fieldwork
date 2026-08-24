import { useState } from "react";
import { Link } from "react-router-dom";
import { useArms, useEvents, useSites, useTrials } from "../hooks/useCollections";
import { eventsForTrial, tallySync } from "../services/events";
import { isSeedTrial } from "../services/seed";
import { hiddenCount, visibleTrials } from "../services/lifecycle";
import {
  Card,
  EmptyState,
  ExamplePill,
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
  // Archived trials are kept out of the way rather than out of reach — one
  // tap brings them back, and everything about them stays readable.
  const [showArchived, setShowArchived] = useState(false);

  if (trials.isError) {
    return (
      <ErrorState message="Could not load trials." onRetry={() => void trials.refetch()} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle>Trials</PageTitle>
        {hiddenCount(trials.data ?? []) > 0 ? (
          <button
            type="button"
            aria-pressed={showArchived}
            onClick={() => setShowArchived(!showArchived)}
            className="min-h-11 rounded-lg border border-ink/20 px-4 py-2.5 font-medium dark:border-ink-dark/20"
          >
            {showArchived
              ? "Hide archived"
              : `Show archived (${hiddenCount(trials.data ?? [])})`}
          </button>
        ) : null}
      </div>
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
        visibleTrials(trials.data ?? [], showArchived).map((trial) => (
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
              {isSeedTrial(trial.trialId) ? <ExamplePill /> : null}
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
