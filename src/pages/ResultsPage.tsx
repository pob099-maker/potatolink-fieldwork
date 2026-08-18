import { Link, useParams } from "react-router-dom";
import { Card, PageTitle } from "../components/ui";

// The economics engine and scenario comparison are explicitly out of scope
// for the MVP stage (docs/PROMPT.md). This placeholder keeps the route alive.
export function ResultsPage() {
  const { trialId } = useParams<{ trialId: string }>();

  return (
    <Card className="mx-auto max-w-md text-center">
      <p className="text-4xl" aria-hidden>
        📊
      </p>
      <PageTitle>Results &amp; economics</PageTitle>
      <p className="mt-2 text-ink/60 dark:text-ink-dark/60">
        Economic comparisons between practice arms are coming in the next stage of the
        build. Data recorded now will feed straight into them.
      </p>
      <Link
        to={`/trials/${trialId}`}
        className="mt-4 inline-block min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
      >
        Back to trial
      </Link>
    </Card>
  );
}
