// Reading a trial back: what has come in, how complete it is, what it says.
//
// Split off the trial page because it is the half nobody needs while a trial
// is being built, and the only half that matters once it is finished. Keeping
// it here gives the summaries room — a replication grid and a per-treatment
// breakdown are worth a screen each, and were competing with setup cards on a
// page that had neither the space nor the reason.
//
// Descriptive throughout, as everywhere else: means and standard errors, never
// a significance test. The report page assembles the same figures for printing.

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { useTrialData } from "../hooks/useTrialData";
import { summariseArm } from "../services/entryLinks";
import { buildHandoff, handoffCsv, handoffFileName } from "../services/resultsHandoff";
import { tallySync } from "../services/events";
import { replicationStatus, responseSummary } from "../services/replication";
import { buildTrialCsv, csvFileName, downloadCsv } from "../services/export";
import {
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  PageTitle,
  Section,
  Skeleton,
  StatusPill,
  SyncBadge,
  SyncTallyLine,
} from "../components/ui";
import { FactorialResults } from "../components/FactorialResults";
import {
  EditEntryLink,
  ReplicationStatusCard,
  ResponseSummaryCard,
  StaffRecords,
} from "../components/trial/cards";

export function TrialResultsPage() {
  const { trialId } = useParams();
  const data = useTrialData(trialId);
  // null = every site combined; otherwise one site's figures only.
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

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

  const { trial, sites, activeArms, templates, events, metrics, word } = data;
  const selectedSite = sites.find((site) => site.siteId === selectedSiteId);
  const responseField = templates
    .flatMap((form) => form.fields)
    .find((field) => field.fieldName === trial.responseMetric);
  const responseLabel = responseField?.label ?? trial.responseMetric;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          to={`/trials/${trial.trialId}`}
          className="min-h-11 py-2.5 font-medium text-primary underline dark:text-primary-soft"
        >
          &larr; {trial.name}
        </Link>
        <PageTitle>Results</PageTitle>
        <p className="mt-1 text-ink-soft">
          What has been recorded, how much of the design is filled in, and the figures it
          gives. Descriptive only &mdash; export the tidy data to analyse it properly.
        </p>
      </div>

      {sites.length > 1 ? (
        <div>
          <h2 className="sr-only">Filter by site</h2>
          <div role="group" aria-label="Filter by site" className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={selectedSiteId === null}
              onClick={() => setSelectedSiteId(null)}
              className={`min-h-11 rounded-full border px-4 py-2 font-medium ${
                selectedSiteId === null ? "border-primary bg-primary text-white" : "border-line-strong"
              }`}
            >
              All sites
            </button>
            {sites.map((site) => (
              <button
                key={site.siteId}
                type="button"
                aria-pressed={selectedSiteId === site.siteId}
                onClick={() => setSelectedSiteId(site.siteId)}
                className={`min-h-11 rounded-full border px-4 py-2 font-medium ${
                  selectedSiteId === site.siteId
                    ? "border-primary bg-primary text-white"
                    : "border-line-strong"
                }`}
              >
                &#128205; {site.location}
              </button>
            ))}
          </div>
          {selectedSite ? (
            <p className="mt-2 text-sm text-ink-soft">
              Showing {selectedSite.location} only &mdash; {selectedSite.region}, {selectedSite.soilType}.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link
          to={`/trials/${trial.trialId}/report`}
          className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
        >
          Trial report
        </Link>
        {/* What a result is worth is a different kind of claim, made from
            prices and rates nobody observed in a paddock. It leaves here as
            numbers and gets costed somewhere built for costing. */}
        <button
          type="button"
          disabled={events.length === 0}
          onClick={() =>
            downloadCsv(
              handoffFileName(trial),
              handoffCsv(
                buildHandoff(
                  trial,
                  sites,
                  activeArms,
                  events,
                  metrics,
                  responseLabel ?? "",
                  responseField?.unit ?? "",
                ),
              ),
            )
          }
          className="min-h-11 rounded-lg border border-primary px-4 py-2.5 font-medium text-primary disabled:opacity-60 dark:text-primary-soft"
        >
          Results for costing (CSV)
        </button>
        <button
          type="button"
          disabled={events.length === 0}
          onClick={() =>
            downloadCsv(
              csvFileName(trial),
              buildTrialCsv(trial, sites, data.arms, templates, events, metrics, data.contacts),
            )
          }
          className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium disabled:opacity-40"
        >
          Export data (CSV)
        </button>
      </div>

      <Section
        title="How much has come back"
        description="This trial's records, and whether the design is filled in."
      >
        <Card>
          <CardTitle>This trial's entries</CardTitle>
          {/* This trial's, not the device's. What is queued on a phone is a
              property of the phone and is shown on the dashboard. */}
          <p className="mt-1 text-sm">
            <SyncTallyLine tally={tallySync(events)} />
          </p>
        </Card>

        {trial.design === "replicated" ? (
          <ReplicationStatusCard
            status={replicationStatus(trial, activeArms, sites, events, data.plotNumbers)}
            arms={activeArms}
          />
        ) : null}
      </Section>

      {trial.responseMetric ? (
        <Section
          title="What the numbers say"
          description="Means and standard errors per treatment. Not a significance test."
        >
          <ResponseSummaryCard
            stats={responseSummary(trial, activeArms, events, metrics, selectedSiteId ?? undefined)}
            responseLabel={responseLabel ?? ""}
            responseUnit={responseField?.unit ?? ""}
            word={word}
          />
        </Section>
      ) : null}

      {data.isFactorial && trial.responseMetric ? (
        <FactorialResults
          trial={trial}
          factors={data.factors}
          levels={data.levels}
          arms={activeArms}
          events={events}
          metrics={metrics}
          responseLabel={responseLabel ?? ""}
          responseUnit={responseField?.unit ?? ""}
        />
      ) : null}

      <Section
        title={`Records by ${word.one}`}
        description="Every entry filed against each one, newest first."
      >
        {activeArms.length === 0 ? (
          <EmptyState message={`No ${word.many} configured for this trial yet.`} />
        ) : (
          activeArms.map((arm) => {
            const armEvents = events.filter(
              (event) =>
                event.armId === arm.armId &&
                (selectedSiteId === null || event.siteId === selectedSiteId),
            );
            const summary = summariseArm(
              events,
              metrics,
              arm.armId,
              selectedSiteId ?? undefined,
            );

            return (
              <Card key={arm.armId}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>{arm.name}</CardTitle>
                  <StatusPill status={arm.type} />
                </div>
                <p className="mt-1 text-sm text-ink-soft">{arm.description}</p>

                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-sunk p-2">
                    <dt className="text-meta text-ink-soft">Entries</dt>
                    <dd className="font-display text-xl font-bold">{summary.entryCount}</dd>
                  </div>
                  <div className="rounded-lg bg-sunk p-2">
                    <dt className="text-meta text-ink-soft">Total tonnes</dt>
                    <dd className="font-display text-xl font-bold">
                      {summary.totalTonnes > 0 ? summary.totalTonnes.toFixed(1) : "–"}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-sunk p-2">
                    <dt className="text-meta text-ink-soft">Avg t/hr</dt>
                    <dd className="font-display text-xl font-bold">
                      {summary.throughput === null ? "–" : summary.throughput.toFixed(1)}
                    </dd>
                  </div>
                </dl>

                {sites.length > 1 && selectedSiteId === null && summary.entryCount > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-meta text-ink-soft">
                    {sites.map((site) => {
                      const perSite = summariseArm(
                        events,
                        metrics,
                        arm.armId,
                        site.siteId,
                      );
                      return (
                        <li key={site.siteId}>
                          📍 {site.location}: {perSite.entryCount}{" "}
                          {perSite.entryCount === 1 ? "entry" : "entries"}
                          {perSite.totalTonnes > 0 ? ` · ${perSite.totalTonnes.toFixed(1)} t` : ""}
                          {perSite.throughput !== null
                            ? ` · ${perSite.throughput.toFixed(1)} t/hr`
                            : ""}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}

                {armEvents.length > 0 ? (
                  <ul className="mt-3 divide-y divide-line text-sm">
                    {armEvents
                      .sort((a, b) => b.eventDate.localeCompare(a.eventDate))
                      .map((event) => {
                        const site = sites.find(
                          (candidate) => candidate.siteId === event.siteId,
                        );
                        const media = (metrics).filter(
                          (metric) =>
                            metric.eventId === event.eventId &&
                            metric.photoUrl?.startsWith("http"),
                        );
                        return (
                          <li key={event.eventId} className="flex flex-wrap items-center gap-2 py-2">
                            <span>{format(new Date(event.eventDate), "d MMM yyyy")}</span>
                            <span className="text-ink-soft">
                              {site?.location ?? "Unknown site"}
                            </span>
                            <SyncBadge status={event.syncStatus} />
                            <EditEntryLink event={event} />
                            {media.map((metric) => (
                              <a
                                key={metric.metricId}
                                href={metric.photoUrl ?? "#"}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary underline dark:text-primary-soft"
                              >
                                {metric.value === "video"
                                  ? "🎬 video"
                                  : metric.value === "file"
                                    ? "📎 file"
                                    : "📷 photo"}
                              </a>
                            ))}
                          </li>
                        );
                      })}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-ink-faint">
                    {selectedSite
                      ? `No entries for this ${word.one} at ${selectedSite.location} yet.`
                      : "No measurement events for this arm yet."}
                  </p>
                )}
              </Card>
            );
          })
        )}      </Section>

      <StaffRecords
        templates={templates}
        events={events}
        metrics={metrics}
        sites={sites}
        selectedSiteId={selectedSiteId}
      />
    </div>
  );
}
