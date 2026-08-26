// A trial at a glance: what stage it is at, what needs doing, where to go.
//
// This page used to be the whole trial — nineteen cards, thirteen phone
// screens, ninety-six controls. It grew that way one reasonable card at a
// time, and each addition was defensible on its own; nobody was watching the
// total. The result served neither of the people who use it: whoever set the
// trial up scrolled past results that did not exist yet, and whoever runs it
// scrolls past setup they finished in September.
//
// So it split three ways — overview, setup, results — along when people
// arrive rather than who they are. Setting a trial up is one long sequential
// burst that should end. Running one is short repeat visits asking the same
// question. Reading it back happens once at the finish.
//
// Two rules keep that from becoming a maze. Anything time-critical answers
// itself here, with no click: an observation window closes whether or not
// somebody went looking. And the actions people take repeatedly — record,
// hand out links, export — stay on this page rather than moving behind a door.
//
// The emphasis follows the trial's own stage, so the app points rather than
// leaving somebody to search. A draft leads with finishing setup; an active
// trial leads with what is due; a finished one leads with the results.

import { Link, useParams } from "react-router-dom";
import { useTrialData } from "../hooks/useTrialData";
import { isSeedTrial } from "../services/seed";
import { canRecord, closedReason } from "../services/lifecycle";
import { tallySync } from "../services/events";
import { buildTrialCsv, csvFileName, downloadCsv } from "../services/export";
import { useAccess } from "../contexts/AccessContext";
import {
  Card,
  CardTitle,
  EmptyState,
  ExamplePill,
  ErrorState,
  PageTitle,
  Skeleton,
  StatusPill,
  SyncTallyLine,
} from "../components/ui";
import { DueNowBanner } from "../components/ObservationTiming";
import { SetupChecklist } from "../components/TrialSetup";
import { EntryLinks } from "../components/trial/cards";
import { replicationStatus } from "../services/replication";

export function TrialDetailPage() {
  const { trialId } = useParams();
  const data = useTrialData(trialId);
  const { accessCode } = useAccess();

  if (data.loading) {
    return (
      <Card>
        <Skeleton lines={8} />
      </Card>
    );
  }
  if (data.failed) {
    return <ErrorState message="Could not load this trial." onRetry={data.refetch} />;
  }
  if (!data.trial) {
    return <EmptyState message="Trial not found." action={{ label: "All trials", to: "/trials" }} />;
  }

  const { trial, sites, activeArms, templates, events, growerForm, word } = data;
  const setUp = sites.length > 0 && activeArms.length > 0 && templates.length > 0;
  const completeness =
    trial.design === "replicated"
      ? replicationStatus(trial, activeArms, sites, events, data.plotNumbers)
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <PageTitle>{trial.name}</PageTitle>
        {trial.objective ? <p className="mt-1 text-ink-soft">{trial.objective}</p> : null}
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <StatusPill status={trial.status} />
          {isSeedTrial(trial.trialId) ? <ExamplePill /> : null}
        </p>
        {isSeedTrial(trial.trialId) ? (
          <p className="mt-2 rounded-lg bg-accent/20 p-3 text-sm">
            Demonstration data that ships with the app, so there is something to look at
            before a real trial exists. Everything here works exactly as it would on a real
            one — the numbers are just invented. Remove it once you no longer need it.
          </p>
        ) : null}
      </div>

      {/* Above everything, because it is the only thing on this screen that is
          time-critical — a window closes whether or not anybody scrolled. */}
      <DueNowBanner items={data.due} showTrial={false} />

      {/* A trial that cannot take entries yet has one job, and it is not on
          this page. Saying so beats showing four cards that will not work. */}
      {!setUp ? (
        <SetupChecklist trial={trial} sites={sites} arms={activeArms} templates={templates} />
      ) : null}

      <Card tone={setUp ? "default" : "quiet"}>
        <CardTitle>Where this trial is up to</CardTitle>
        <dl className="tabular mt-2 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <Fact label="Sites">{sites.length}</Fact>
          <Fact label={word.Many}>{activeArms.length}</Fact>
          <Fact label="Forms">{templates.length}</Fact>
          <Fact label="Records">{events.length}</Fact>
        </dl>
        {completeness ? (
          <p className="mt-3 text-sm text-ink-soft">
            {completeness.recorded} of {completeness.expected} plots recorded.
          </p>
        ) : null}
        <p className="mt-1 text-sm">
          <SyncTallyLine tally={tallySync(events)} />
        </p>
      </Card>

      {/* The things somebody does over and over stay here. Moving these behind
          a door would trade one long page for a lot of navigation. */}
      <div className="flex flex-wrap gap-2">
        {canRecord(trial) && growerForm && sites.length > 0 && activeArms.length > 0 ? (
          <Link
            to={`/trials/${trial.trialId}/entry?form=${growerForm.templateId}&code=${encodeURIComponent(accessCode)}`}
            className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
          >
            + Add an entry
          </Link>
        ) : null}
        <Link
          to={`/trials/${trial.trialId}/results`}
          className="min-h-11 rounded-lg border border-primary px-4 py-2.5 font-medium text-primary dark:text-primary-soft"
        >
          Results
        </Link>
        <Link
          to={`/trials/${trial.trialId}/setup`}
          className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
        >
          Set up
        </Link>
        <button
          type="button"
          disabled={events.length === 0}
          title={
            events.length === 0
              ? "Nothing recorded yet — the file would hold only column headings."
              : undefined
          }
          onClick={() =>
            downloadCsv(
              csvFileName(trial),
              buildTrialCsv(
                trial,
                sites,
                data.arms,
                templates,
                events,
                data.metrics,
                data.contacts,
              ),
            )
          }
          className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium disabled:opacity-40"
        >
          Export data (CSV)
        </button>
      </div>

      {closedReason(trial) ? (
        <Card tone="quiet">
          <CardTitle>Recording has stopped</CardTitle>
          <p className="mt-1 text-sm text-ink-soft">
            {closedReason(trial)} Change the stage under <strong>Set up</strong> if it needs
            to take entries again.
          </p>
        </Card>
      ) : setUp ? (
        <EntryLinks
          trial={trial}
          sites={sites}
          arms={activeArms}
          selectedSiteId={null}
          word={word}
        />
      ) : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-display text-eyebrow uppercase text-ink-faint">{label}</dt>
      <dd className="text-title font-display">{children}</dd>
    </div>
  );
}
