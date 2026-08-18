import { Link } from "react-router-dom";
import { useSites, useTrials } from "../hooks/useCollections";
import { Card, EmptyState, ErrorState, PageTitle, Skeleton, StatusPill } from "../components/ui";

export function TrialsPage() {
  const trials = useTrials();
  const sites = useSites();

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
            <p className="mt-2 flex items-center gap-2 text-sm">
              <StatusPill status={trial.status} />
              <span className="text-ink/60 dark:text-ink-dark/60">
                {(sites.data ?? []).filter((site) => site.trialId === trial.trialId).length} sites
              </span>
            </p>
          </Card>
        ))
      )}
    </div>
  );
}
