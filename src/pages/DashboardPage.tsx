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
  useWaitingToSync,
} from "../hooks/useCollections";
import { describeEvent, describeEventScope, eventsForTrial, tallySync } from "../services/events";
import { isSeedTrial, seedPresence, type SeedPresence } from "../services/seed";
import { hiddenCount, visibleTrials } from "../services/lifecycle";
import { useOnline } from "../hooks/useOnline";
import {
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  ExamplePill,
  PageTitle,
  Skeleton,
  StatusPill,
  SyncBadge,
  SyncTallyLine,
} from "../components/ui";

/**
 * What this is, and which part of it is yours.
 *
 * The dashboard used to open on a sync readout — an operator's question,
 * answered before anybody had been told what the app was for. Three people use
 * this: whoever designs a trial, whoever runs it, and whoever records in the
 * field. Each arrives looking for a different thing, and none of them was
 * being pointed anywhere.
 */
function StartHere({ presence }: { presence: SeedPresence }) {
  const routes = [
    {
      to: "/trials/new",
      role: "Designing a trial",
      // App-wide, so no one trial's vocabulary applies — kept neutral.
      what: "Import a written protocol as a spreadsheet, or build one here: sites, what is being compared, and the questions asked in the field.",
    },
    {
      to: "/trials",
      role: "Running one",
      what: "What has been recorded, whether a replicated design is filled in, and the data out as a CSV for analysis.",
    },
    {
      to: "/record",
      role: "Recording observations",
      what: "Pick where you are and start. Four questions a screen, photos and video, and it keeps working with no signal. A device used for this opens straight here next time.",
    },
  ];

  return (
    <Card className="border-accent/50">
      <CardTitle>Start here</CardTitle>
      <p className="mt-1 text-ink-soft">
        Fieldwork records what happens in a field trial and turns it into data you can
        analyse. Nothing in it is specific to one crop — trials, sites, what is being
        compared and the questions asked are all set up in the app.
      </p>
      <ul className="mt-3 divide-y divide-line">
        {routes.map((route) => (
          <li key={route.role} className="py-2">
            <Link
              to={route.to}
              className="font-medium text-primary hover:underline dark:text-primary-soft"
            >
              {route.role}
            </Link>
            <p className="text-sm text-ink-soft">{route.what}</p>
          </li>
        ))}
      </ul>
      {/* Only while the demonstration data is actually here. A standing
          warning that the trials are examples becomes false the moment a real
          one is created, and a warning that is wrong about your own data
          teaches you to ignore warnings. */}
      {presence === "none" ? null : (
        <p className="mt-3 border-t border-line pt-3 text-sm text-ink-soft">
          <span className="font-medium text-warning">
            {presence === "all"
              ? "The trials below are examples."
              : "Trials marked Example are demonstration data."}
          </span>{" "}
          Their costs and returns are stand-in figures, not any grower's real numbers. The
          Economics page tracks that per figure, and stops saying it once each one is
          marked confirmed.
        </p>
      )}
    </Card>
  );
}

import { DueNowBanner } from "../components/ObservationTiming";
import { buildDueList, todayIso } from "../services/dueList";

export function DashboardPage() {
  const trials = useTrials();
  const sites = useSites();
  const arms = useArms();
  const events = useEvents();
  const templates = useTemplates();

  const loading = trials.isPending || sites.isPending || events.isPending || arms.isPending;
  const failed = trials.isError || sites.isError || events.isError;

  // What is waiting on the crop, rather than on the network. Recomputed from
  // the same data the rest of the dashboard already has, so it costs nothing
  // extra and cannot drift from what the trial pages say.
  const due = useMemo(
    () =>
      buildDueList({
        trials: trials.data ?? [],
        sites: sites.data ?? [],
        templates: templates.data ?? [],
        events: events.data ?? [],
        today: todayIso(),
      }),
    [trials.data, sites.data, templates.data, events.data],
  );

  const trouble = useSyncTrouble();
  const waiting = useWaitingToSync();
  const online = useOnline();
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

      {/* Above everything, because it is the only thing on this screen that
          is time-critical — an observation window closes whether or not
          anybody scrolled. */}
      <DueNowBanner items={due} />

      <StartHere presence={seedPresence((trials.data ?? []).map((trial) => trial.trialId))} />

      <Card>
        <h2 className="mb-2 font-semibold">This device</h2>
        {/* Deliberately not a count of everything recorded anywhere. The queue
            and the connection belong to this device; how much of one trial is
            outstanding belongs to that trial, and is shown against it. Merging
            the two produced a number nobody could act on once more than one
            team was using the app. */}
        <p className="text-sm">
          {online ? (
            <span className="text-success">Online</span>
          ) : (
            <span className="text-warning">
              Offline — entries are saved here and go up when a connection returns
            </span>
          )}
        </p>
        {waiting.isPending ? (
          <Skeleton lines={1} />
        ) : (waiting.data ?? 0) > 0 ? (
          <p className="mt-1 text-sm text-ink-soft">
            {waiting.data} {waiting.data === 1 ? "record is" : "records are"} waiting to
            leave this device.
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-soft">
            Everything on this device has reached the cloud.
          </p>
        )}
        {trouble.data ? (
          <div className="mt-3 rounded-lg bg-warning/15 p-3 text-sm">
            <p className="font-medium text-warning">
              The last attempt to send was refused.
            </p>
            <p className="mt-1 text-ink-soft">
              Nothing has been lost — it is all saved on this device and will go up once
              the cause is fixed. The cloud said:{" "}
              <span className="font-mono">{trouble.data.message}</span>
            </p>
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Trials</h2>
        {/* The dashboard is a starting point, not an archive: archived trials
            are listed on the Trials page, which has the control to show them. */}
        {hiddenCount(trials.data ?? []) > 0 ? (
          <p className="mb-2 text-sm text-ink-soft">
            {hiddenCount(trials.data ?? [])} archived, on the{" "}
            <Link to="/trials" className="underline">
              Trials page
            </Link>
            .
          </p>
        ) : null}
        {loading ? (
          <Skeleton lines={4} />
        ) : (trials.data ?? []).length === 0 ? (
          <EmptyState message="No trials yet. Create the first one to get started." />
        ) : (
          <ul className="divide-y divide-line">
            {visibleTrials(trials.data ?? [], false).map((trial) => {
              const siteCount = (sites.data ?? []).filter(
                (site) => site.trialId === trial.trialId,
              ).length;
              return (
                <li key={trial.trialId} className="py-3">
                  <Link
                    to={`/trials/${trial.trialId}`}
                    className="font-medium text-primary hover:underline dark:text-primary-soft"
                  >
                    {trial.name}
                  </Link>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                    <StatusPill status={trial.status} />
                    {isSeedTrial(trial.trialId) ? <ExamplePill /> : null}
                    <span>
                      {siteCount} {siteCount === 1 ? "site" : "sites"}
                    </span>
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
          <ul className="divide-y divide-line">
            {recentEvents.map((event) => {
              const arm = (arms.data ?? []).find((candidate) => candidate.armId === event.armId);
              return (
                <li key={event.eventId} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="font-medium">
                    {describeEventScope(event, sites.data ?? [])}
                  </span>
                  <span className="text-ink-soft">
                    {arm?.name ?? describeEvent(event, templates.data ?? [])}
                  </span>
                  <span className="text-ink-faint">
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
