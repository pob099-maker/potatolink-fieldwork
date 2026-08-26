import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  useArms,
  useContacts,
  useEvents,
  useMetrics,
  useSites,
  useTemplates,
  useTrials,
} from "../hooks/useCollections";
import { addArm, addTemplate, removeArm, removeTrial, saveArm } from "../services/store";
import { buildEntryUrl, summariseArm } from "../services/entryLinks";
import { buildTrialCsv, csvFileName, downloadCsv } from "../services/export";
import { describeEvent, describeEventScope, eventsForTrial, tallySync } from "../services/events";
import { isSeedTrial } from "../services/seed";
import { TRIAL_STATES, canRecord, closedReason } from "../services/lifecycle";
import { metricDisplay } from "../services/metricValue";
import { replicationStatus, responseSummary, type Completeness, type TreatmentStat } from "../services/replication";
import { saveTrial } from "../services/store";
import {
  Card,
  CardTitle,
  EmptyState,
  ExamplePill,
  ErrorState,
  PageTitle,
  Section,
  Skeleton,
  StatusPill,
  SyncBadge,
  SyncTallyLine,
} from "../components/ui";
import { SetupChecklist, SiteManager } from "../components/TrialSetup";
import { PlotLayout } from "../components/PlotLayout";
import { DataSources } from "../components/DataSources";
import { DueNowBanner, PlantingCard, TimingEditor, TrialSchedule } from "../components/ObservationTiming";
import { buildDueList, todayIso } from "../services/dueList";
import { generateLayout, layoutProblem } from "../services/layout";
import { describePlot } from "../services/plotArea";
import { useAccess } from "../contexts/AccessContext";
import { VOCABULARY_CHOICES, trialVocabulary, words, type Words } from "../services/vocabulary";
import type {
  FormAudience,
  FormTemplate,
  MeasurementEvent,
  Metric,
  PracticeArm,
  Site,
  Trial
} from "../types";

export function TrialDetailPage() {
  const { trialId } = useParams<{ trialId: string }>();
  const { accessCode } = useAccess();
  const trials = useTrials();
  const sites = useSites();
  const arms = useArms();
  const contacts = useContacts();
  const events = useEvents();
  const metrics = useMetrics();
  const templates = useTemplates();

  const loading =
    trials.isPending || sites.isPending || arms.isPending || events.isPending || metrics.isPending;

  const trial = trials.data?.find((candidate) => candidate.trialId === trialId);
  const trialSites = useMemo(
    () => (sites.data ?? []).filter((site) => site.trialId === trialId),
    [sites.data, trialId],
  );
  const trialArms = useMemo(
    () =>
      (arms.data ?? [])
        .filter((arm) => arm.trialId === trialId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [arms.data, trialId],
  );
  // Archived practices keep their data but drop out of the live comparison,
  // the entry links, and the per-arm stat cards.
  const activeArms = useMemo(
    () => trialArms.filter((arm) => !arm.archived),
    [trialArms],
  );

  const trialTemplates = useMemo(
    () => (templates.data ?? []).filter((candidate) => candidate.trialId === trialId),
    [templates.data, trialId],
  );

  const growerForm = trialTemplates.find((template) => template.audience === "grower");
  const trialEvents = useMemo(
    () => eventsForTrial(events.data ?? [], trialId ?? "", sites.data ?? [], arms.data ?? []),
    [events.data, trialId, sites.data, arms.data],
  );

  // The layout is derived from the seed, the treatments and the replicate
  // count — which makes it reproducible, and makes any change to those a
  // silent re-labelling of every record already keyed to a plot. Once one such
  // record exists, those three inputs are frozen.
  const plotRecords = useMemo(
    () => trialEvents.filter((event) => event.plot !== null).length,
    [trialEvents],
  );
  const layoutLocked = plotRecords > 0;
  // The same per-site layouts the plot map draws, indexed so the replication
  // grid can name the plot rather than the replicate.
  const plotNumbers = useMemo(() => {
    const index = new Map<string, number>();
    if (!trial || trial.design !== "replicated" || !trial.layoutSeed) return index;
    for (const site of trialSites) {
      const request = {
        design: trial.blocking === "blocks" ? ("rcb" as const) : ("crd" as const),
        arms: activeArms,
        replicates: trial.replicates,
        seed: trial.layoutSeed,
        siteId: site.siteId,
      };
      if (layoutProblem(request)) continue;
      for (const plot of generateLayout(request)) {
        index.set(`${site.siteId}:${plot.armId}:${plot.replicate}`, plot.plotNumber);
      }
    }
    return index;
  }, [trial, trialSites, activeArms]);
  // What this trial calls the things it compares. One word, used everywhere on
  // the page, so a researcher and a grower each read their own vocabulary
  // rather than both meeting a compromise neither uses.
  const word = trial ? words(trial) : words({ vocabulary: null, design: "observational" });

  // This trial's schedule. Same computation as the dashboard's, over the
  // subset already loaded here, so the two can never disagree about what is
  // due.
  const due = useMemo(
    () =>
      trial
        ? buildDueList({
            trials: [trial],
            sites: trialSites,
            templates: trialTemplates,
            events: trialEvents,
            today: todayIso(),
          })
        : [],
    [trial, trialSites, trialTemplates, trialEvents],
  );

  // null = every site combined; otherwise one site's figures only.
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const selectedSite = trialSites.find((site) => site.siteId === selectedSiteId);

  if (loading) {
    return (
      <Card>
        <Skeleton lines={8} />
      </Card>
    );
  }

  if (trials.isError) {
    return <ErrorState message="Could not load this trial." onRetry={() => void trials.refetch()} />;
  }

  if (!trial) {
    return (
      <EmptyState message="Trial not found." action={{ label: "All trials", to: "/trials" }} />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <PageTitle>{trial.name}</PageTitle>
        <p className="mt-1 text-ink-soft">{trial.objective}</p>
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

      {/* The trial name is already on screen, so the banner does not repeat it. */}
      <DueNowBanner items={due} showTrial={false} />

      {trialSites.length > 1 ? (
        <div>
          <h2 className="sr-only">Filter by site</h2>
          <div role="group" aria-label="Filter by site" className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={selectedSiteId === null}
              onClick={() => setSelectedSiteId(null)}
              className={`min-h-11 rounded-full border px-4 py-2 font-medium ${
                selectedSiteId === null
                  ? "border-primary bg-primary text-white"
                  : "border-line-strong"
              }`}
            >
              All sites
            </button>
            {trialSites.map((site) => (
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
                📍 {site.location}
              </button>
            ))}
          </div>
          {selectedSite ? (
            <p className="mt-2 text-sm text-ink-soft">
              Showing {selectedSite.location} only — {selectedSite.region}, {selectedSite.soilType}.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canRecord(trial) && growerForm && trialSites.length > 0 && activeArms.length > 0 ? (
          <Link
            to={`/trials/${trial.trialId}/entry?form=${growerForm.templateId}${
              selectedSiteId ? `&site=${selectedSiteId}` : ""
            }&code=${encodeURIComponent(accessCode)}`}
            className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
          >
            + Add an entry
          </Link>
        ) : null}
        {growerForm && trialSites.length > 0 && activeArms.length > 0 ? (
          <Link
            to={`/trials/${trial.trialId}/entry?form=${growerForm.templateId}&site=${trialSites[0].siteId}&arm=${activeArms[0].armId}&preview=1`}
            className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
          >
            Preview the observation form
          </Link>
        ) : null}
        <Link
          to={`/trials/${trial.trialId}/report`}
          className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
        >
          Trial report
        </Link>
        <Link
          to={`/trials/${trial.trialId}/economics`}
          className="min-h-11 rounded-lg border border-primary px-4 py-2.5 font-medium text-primary dark:text-primary-soft"
        >
          Economics
        </Link>
        <button
          type="button"
          disabled={trialEvents.length === 0}
          title={
            trialEvents.length === 0
              ? "Nothing recorded yet — the file would hold only column headings."
              : undefined
          }
          onClick={() =>
            downloadCsv(
              csvFileName(trial),
              buildTrialCsv(
                trial,
                trialSites,
                trialArms,
                trialTemplates,
                trialEvents,
                metrics.data ?? [],
                contacts.data ?? [],
              ),
            )
          }
          className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium disabled:opacity-40"
        >
          Export data (CSV)
        </button>
      </div>


      <Section
        title="Setting up the trial"
        description={`For whoever designs the trial — the sites it runs at, the ${word.many} being compared, and the questions asked in the field.`}
      >
      <SetupChecklist
        trial={trial}
        sites={trialSites}
        arms={activeArms}
        templates={trialTemplates}
      />
      <TrialDesignCard trial={trial} templates={trialTemplates} layoutLocked={layoutLocked} />
      <SiteManager trialId={trial.trialId} sites={trialSites} />
      <ArmManager trialId={trial.trialId} arms={trialArms} layoutLocked={layoutLocked} word={word} />
      <PlotLayout trial={trial} arms={activeArms} sites={trialSites} recorded={plotRecords} />
      <TrialForms trial={trial} templates={trialTemplates} word={word} />
      <RemoveTrial trial={trial} />
      </Section>

      <Section
        title="Collecting observations"
        description={`For whoever is in the paddock — a contractor, a staff member or the grower. One link per site and ${word.one}, and the form works with no signal.`}
      >
      <TrialSchedule trial={trial} items={due} />
      <PlantingCard sites={trialSites} />

      <DataSources trial={trial} sites={trialSites} arms={activeArms} />

      {closedReason(trial) ? (
        <Card>
          <CardTitle>Recording has stopped</CardTitle>
          <p className="mt-1 text-sm text-ink-soft">
            {closedReason(trial)} Move the trial back to Active under Stage if it needs to
            take entries again.
          </p>
        </Card>
      ) : (
        <EntryLinks trial={trial} sites={trialSites} arms={activeArms} selectedSiteId={selectedSiteId} word={word} />
      )}
      </Section>

      <Section
        title="Managing and reviewing"
        description="For whoever runs the trial — what has come back, whether the design is filled in, and getting the data out."
      >
      <TrialStage trial={trial} />

      <Card>
        <CardTitle>This trial's entries</CardTitle>
        {/* This trial's, not the device's. What is queued on a phone is a
            property of the phone and is shown on the dashboard; what is
            outstanding here is what whoever runs this trial needs. */}
        <p className="mt-1 text-sm">
          <SyncTallyLine tally={tallySync(trialEvents)} />
        </p>
      </Card>

      {trial.design === "replicated" ? (
        <ReplicationStatusCard
          status={replicationStatus(trial, activeArms, trialSites, trialEvents, plotNumbers)}
          arms={activeArms}
        />
      ) : null}

      {/* Without a response variable there is nothing to summarise, and the
          card rendered a column of dashes under the heading "— response",
          which reads as a broken app rather than an unfinished setup. */}
      {trial.design === "replicated" && trial.responseMetric === null ? (
        <Card>
          <CardTitle>Response summary</CardTitle>
          <p className="mt-1 text-sm text-ink-soft">
            Choose the response variable under Trial design — the one number this trial
            exists to compare, usually yield. Until then there is nothing to summarise.
          </p>
        </Card>
      ) : null}

      {trial.design === "replicated" && trial.responseMetric !== null ? (
        <ResponseSummaryCard
          word={word}
          stats={responseSummary(
            trial,
            activeArms,
            trialEvents,
            metrics.data ?? [],
            selectedSiteId ?? undefined,
          )}
          responseLabel={
            trialTemplates
              .flatMap((template) => template.fields)
              .find((field) => field.fieldName === trial.responseMetric)?.label ??
            trial.responseMetric ??
            "response"
          }
          responseUnit={
            trialTemplates
              .flatMap((template) => template.fields)
              .find((field) => field.fieldName === trial.responseMetric)?.unit ?? ""
          }
        />
      ) : null}

      <StaffRecords
        events={trialEvents.filter((event) => {
          const template = trialTemplates.find(
            (candidate) => candidate.eventType === event.eventType,
          );
          return template ? template.audience === "staff" : event.armId === null;
        })}
        templates={trialTemplates}
        sites={trialSites}
        metrics={metrics.data ?? []}
        selectedSiteId={selectedSiteId}
      />






      {activeArms.length === 0 ? (
        <EmptyState message={`No ${word.many} configured for this trial yet.`} />
      ) : (
        activeArms.map((arm) => {
          const armEvents = (events.data ?? []).filter(
            (event) =>
              event.armId === arm.armId &&
              (selectedSiteId === null || event.siteId === selectedSiteId),
          );
          const summary = summariseArm(
            events.data ?? [],
            metrics.data ?? [],
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

              {trialSites.length > 1 && selectedSiteId === null && summary.entryCount > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-meta text-ink-soft">
                  {trialSites.map((site) => {
                    const perSite = summariseArm(
                      events.data ?? [],
                      metrics.data ?? [],
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
                      const site = trialSites.find(
                        (candidate) => candidate.siteId === event.siteId,
                      );
                      const media = (metrics.data ?? []).filter(
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
      )}
      </Section>
    </div>
  );
}

/**
 * Removing a trial created by mistake. Deliberately plain and at the bottom of
 * the setup section — it is a tidying-up tool, not something to meet on the way
 * past. The store refuses outright if anything has been recorded, so the worst
 * this can do is delete an empty shell.
 */
function RemoveTrial({ trial }: { trial: Trial }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRemove(): Promise<void> {
    const result = await removeTrial(trial);
    if (result.success) navigate("/trials");
    else setError(result.error);
  }

  return (
    <Card tone="danger">
      <CardTitle>Remove this trial</CardTitle>
      <p className="mt-1 text-sm text-ink-soft">
        For a trial set up by mistake. Its sites, {words(trial).many} and forms go with
        it. A trial
        with anything recorded against it cannot be removed — archive it instead, so the
        data survives.
      </p>
      {error ? <ErrorState message={error} /> : null}
      {confirming ? (
        <div className="mt-3 rounded-xl border border-danger/40 bg-danger/5 p-3">
          <p className="text-sm">Remove “{trial.name}” and everything set up for it?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="min-h-11 flex-1 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={() => void onRemove()}
              className="min-h-11 flex-1 rounded-lg bg-danger px-4 py-2.5 font-medium text-white"
            >
              Remove the trial
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 min-h-11 rounded-lg border border-danger/40 px-4 py-2.5 font-medium text-danger"
        >
          Remove this trial
        </button>
      )}
    </Card>
  );
}

/**
 * Records from the staff forms — calibration, weather, cost logs and the like.
 * They don't belong to a practice arm, so they'd otherwise be invisible on a
 * page organised by arm.
 */
/**
 * Opens a record for correction. Staff reviewing a trial are the ones who
 * spot a figure that cannot be right, and until now the only options were to
 * live with it or add a second record contradicting the first.
 */
function EditEntryLink({ event }: { event: MeasurementEvent }) {
  if (!event.trialId) return null;
  return (
    <Link
      to={`/trials/${event.trialId}/entry?edit=${event.eventId}`}
      aria-label={`Correct the record from ${format(new Date(event.eventDate), "d MMM yyyy")}`}
      className="text-primary underline dark:text-primary-soft"
    >
      Edit
    </Link>
  );
}

function StaffRecords({
  events,
  templates,
  sites,
  metrics,
  selectedSiteId,
}: {
  events: MeasurementEvent[];
  templates: FormTemplate[];
  sites: Site[];
  metrics: Metric[];
  selectedSiteId: string | null;
}) {
  // A trial-level record (no site) stays visible whichever site is selected.
  const shown = events
    .filter(
      (event) =>
        selectedSiteId === null || event.siteId === null || event.siteId === selectedSiteId,
    )
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate));

  if (shown.length === 0) return null;

  return (
    <Card tone="quiet">
      <CardTitle>Staff records</CardTitle>
      <ul className="mt-2 divide-y divide-line text-sm">
        {shown.map((event) => {
          const values = metrics.filter((metric) => metric.eventId === event.eventId);
          const media = values.filter((metric) => metric.photoUrl?.startsWith("http"));
          const readable = values
            .filter((metric) => !metric.photoUrl)
            .slice(0, 3)
            .map((metric) => `${metric.metricName}: ${metricDisplay(metric.value, metric.unit)}`)
            .join(" · ");
          return (
            <li key={event.eventId} className="py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{describeEvent(event, templates)}</span>
                <span className="text-ink-soft">
                  {format(new Date(event.eventDate), "d MMM yyyy")} ·{" "}
                  {describeEventScope(event, sites)}
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
                    {metric.value === "video" ? "🎬" : metric.value === "file" ? "📎" : "📷"}
                  </a>
                ))}
              </div>
              {readable ? (
                <p className="text-meta text-ink-soft">{readable}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function TrialDesignCard({
  trial,
  templates,
  layoutLocked,
}: {
  trial: Trial;
  templates: FormTemplate[];
  layoutLocked: boolean;
}) {
  const word = words(trial);
  const numericFields = templates
    .flatMap((template) => template.fields)
    .filter((field) => field.type === "number");
  const [saving, setSaving] = useState(false);

  async function update(changes: Partial<Trial>): Promise<void> {
    setSaving(true);
    await saveTrial({ ...trial, ...changes });
    setSaving(false);
  }

  return (
    <Card tone="quiet">
      <CardTitle>Trial design</CardTitle>
      <p className="mt-1 text-sm text-ink-soft">
        Observational trials record what happened. A replicated trial adds replicate
        plots and a response variable so the data can be analysed statistically.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-medium">
          Design
          <select
            value={trial.design}
            disabled={saving || layoutLocked}
            onChange={(changeEvent) => {
              const design = changeEvent.target.value as Trial["design"];
              // Turning a trial into an experiment is the moment to pick an
              // arrangement, and the blocked one is what a paddock almost
              // always wants. Left at "none" it would default to the answer
              // that suits a glasshouse. Only for a trial not yet laid out —
              // an existing layout keeps its own arrangement.
              const starting = design === "replicated" && trial.layoutSeed === null;
              void update({
                design,
                ...(starting ? { blocking: "blocks" as const } : {}),
                ...(starting && trial.replicates < 2 ? { replicates: 3 } : {}),
              });
            }}
            className="mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3"
          >
            <option value="observational">Observational</option>
            <option value="replicated">Replicated experiment</option>
          </select>
        </label>
        {trial.design === "replicated" ? (
          <>
            <label className="block text-sm font-medium">
              {/* Under blocking these are blocks, and each block holds one plot
                  of every one of them — same number, but calling it "replicates"
                  invites somebody to enter the plot count instead. */}
              {trial.blocking === "blocks" ? "Blocks" : `Replicates per ${word.one}`}
              <input
                type="number"
                min={1}
                value={trial.replicates}
                disabled={saving || layoutLocked}
                onChange={(changeEvent) =>
                  void update({ replicates: Math.max(0, Number(changeEvent.target.value) || 0) })
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3"
              />
            </label>
            <label className="block text-sm font-medium">
              Response variable
              <select
                value={trial.responseMetric ?? ""}
                disabled={saving}
                onChange={(changeEvent) =>
                  void update({ responseMetric: changeEvent.target.value || null })
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3"
              >
                <option value="">Choose…</option>
                {numericFields.map((field) => (
                  <option key={field.fieldName} value={field.fieldName}>
                    {field.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Plot size</legend>
        <p className="mt-1 text-sm text-ink-soft">
          Optional, and worth it: with a size recorded, a form can ask for the weight off
          the plot and the app works out the yield per hectare. Otherwise somebody is
          doing that conversion in a paddock, and a misplaced decimal never shows up
          again. Strips that differ in length can carry their own area on the form
          instead — a field measured in ha or m² overrides this.
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <label className="block text-sm font-medium">
            Width (m)
            <input
              type="number"
              min={0}
              step="any"
              value={trial.plotWidthM ?? ""}
              disabled={saving}
              onChange={(changeEvent) =>
                void update({ plotWidthM: Number(changeEvent.target.value) || null })
              }
              className="mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3"
            />
          </label>
          <label className="block text-sm font-medium">
            Length (m)
            <input
              type="number"
              min={0}
              step="any"
              value={trial.plotLengthM ?? ""}
              disabled={saving}
              onChange={(changeEvent) =>
                void update({ plotLengthM: Number(changeEvent.target.value) || null })
              }
              className="mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3"
            />
          </label>
          <p className="self-end text-sm text-ink-soft">
            {describePlot(trial) ?? "Both sides needed before an area."}
          </p>
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">What this trial calls them</legend>
        <p className="mt-1 text-sm text-ink-soft">
          Only the wording changes, and only on this trial. The exported data uses one
          fixed column name either way, so two trials still pool together.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {VOCABULARY_CHOICES.map((choice) => {
            const chosen = trialVocabulary(trial) === choice.value;
            return (
              <label
                key={choice.value}
                className={`flex max-w-xs flex-1 cursor-pointer gap-2 rounded-lg border p-3 ${
                  chosen ? "border-primary bg-primary/5" : "border-line"
                }`}
              >
                <input
                  type="radio"
                  name="vocabulary"
                  checked={chosen}
                  disabled={saving}
                  onChange={() => void update({ vocabulary: choice.value })}
                  className="mt-1 size-4 shrink-0"
                />
                <span>
                  <span className="block font-medium">{choice.label}</span>
                  <span className="block text-sm text-ink-soft">
                    {choice.detail}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </Card>
  );
}

/**
 * Where the trial is in its life.
 *
 * The four states existed and nothing could set them, so every trial stayed a
 * draft forever and the lists filled up with finished work. Put here rather
 * than in setup because it is the running of a trial, not its design — and
 * whoever runs it is the person who knows collection has stopped.
 */
function TrialStage({ trial }: { trial: Trial }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(status: Trial["status"]): Promise<void> {
    setSaving(true);
    setError(null);
    const result = await saveTrial({ ...trial, status });
    setSaving(false);
    if (!result.success) setError(result.error);
  }

  return (
    <Card tone="quiet">
      <CardTitle>Stage</CardTitle>
      <p className="mt-1 text-sm text-ink-soft">
        Nothing is ever deleted by this. Archiving takes a finished trial out of the lists
        and no more; its results, economics and CSV export all keep working, and it comes
        back with one tap.
      </p>
      <div className="mt-3 space-y-2">
        {TRIAL_STATES.map((state) => (
          <label
            key={state.value}
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
              trial.status === state.value
                ? "border-primary bg-primary/5"
                : "border-line"
            }`}
          >
            <input
              type="radio"
              name="stage"
              checked={trial.status === state.value}
              disabled={saving}
              onChange={() => void choose(state.value)}
              className="mt-1 size-4 shrink-0"
            />
            <span>
              <span className="block font-medium">{state.label}</span>
              <span className="block text-sm text-ink-soft">
                {state.detail}
              </span>
            </span>
          </label>
        ))}
      </div>
      {error ? <ErrorState message={error} /> : null}
    </Card>
  );
}

function ReplicationStatusCard({
  status,
  arms,
}: {
  status: Completeness;
  arms: PracticeArm[];
}) {
  const complete = status.recorded === status.expected && status.expected > 0;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Replication status</CardTitle>
        <span
          className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${
            complete ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
          }`}
        >
          {status.recorded} of {status.expected} plots recorded
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        One cell per plot. Amber cells are outstanding — the number is the plot to
        walk to.
      </p>
      {status.sites.map((site) => (
        <div key={site.siteId} className="mt-3 overflow-x-auto">
          <h3 className="text-sm font-semibold">📍 {site.siteName}</h3>
          <table className="mt-1 border-separate border-spacing-1 text-center text-sm">
            <tbody>
              {arms.map((arm) => (
                <tr key={arm.armId}>
                  <th scope="row" className="pr-2 text-right font-medium">
                    {arm.name}
                  </th>
                  {site.cells
                    .filter((cell) => cell.armId === arm.armId)
                    .map((cell) => (
                      <td
                        key={cell.replicate}
                        className={`h-9 w-12 rounded ${
                          cell.recorded
                            ? "bg-success/20 text-success"
                            : "bg-warning/15 text-warning"
                        }`}
                        title={
                          cell.plotNumber === null
                            ? `Replicate ${cell.replicate}`
                            : `Plot ${cell.plotNumber} · replicate ${cell.replicate}`
                        }
                      >
                        {cell.recorded
                          ? "✓"
                          : cell.plotNumber === null
                            ? `R${cell.replicate}`
                            : cell.plotNumber}
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </Card>
  );
}

function ResponseSummaryCard({
  stats,
  responseLabel,
  responseUnit,
  word,
}: {
  stats: TreatmentStat[];
  responseLabel: string;
  responseUnit: string;
  word: Words;
}) {
  const subSampled = stats.some((stat) => stat.records > stat.n);
  return (
    <Card tone="feature">
      <CardTitle>Response summary — {responseLabel}</CardTitle>
      <p className="mt-1 text-sm text-ink-soft">
        Descriptive means ± standard error per {word.one}. This is not a significance test —
        export the tidy data for statistical analysis.
      </p>
      {/* Say it, rather than quietly producing a smaller number than the
          reader expects. Somebody who took six readings down a strip and sees
          n=3 needs to know why, and somebody who did not needs to know the app
          would have handled it. */}
      {subSampled ? (
        <p className="mt-2 rounded-lg bg-accent/20 p-3 text-sm">
          Several readings were taken in the same plot. They are averaged within the plot
          before the {word.many} are compared, because randomisation was applied to plots
          — counting each reading separately would understate the error by roughly the
          square root of the number of samples. <strong>n</strong> below is plots.
        </p>
      ) : null}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-soft">
              <th className="py-1">{word.One}</th>
              <th className="py-1" title="Independent plots, not records">
                n
              </th>
              <th className="py-1">Mean{responseUnit ? ` (${responseUnit})` : ""}</th>
              <th className="py-1">± SE</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat) => (
              <tr key={stat.armId} className="border-t border-line">
                <td className="py-1 font-medium">{stat.armName}</td>
                <td className="py-1">
                  {stat.n}
                  {stat.records > stat.n ? (
                    <span className="text-ink-faint">
                      {" "}
                      ({stat.records} readings)
                    </span>
                  ) : null}
                </td>
                <td className="py-1">{stat.mean === null ? "–" : stat.mean.toFixed(2)}</td>
                <td className="py-1">{stat.se === null ? "–" : stat.se.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * Add, rename, reorder and retire the practices being compared in a trial.
 * Removing a practice with data archives it (kept but hidden from new entry
 * and the live comparison); one with no data yet is deleted outright.
 */
function ArmManager({
  trialId,
  arms,
  layoutLocked,
  word,
}: {
  trialId: string;
  arms: PracticeArm[];
  layoutLocked: boolean;
  word: Words;
}) {
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<PracticeArm["type"]>("alternative");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = arms.filter((arm) => !arm.archived);
  const archived = arms.filter((arm) => arm.archived);

  async function reorder(index: number, delta: -1 | 1): Promise<void> {
    const target = index + delta;
    if (target < 0 || target >= active.length) return;
    const a = active[index];
    const b = active[target];
    await saveArm({ ...a, sortOrder: b.sortOrder });
    await saveArm({ ...b, sortOrder: a.sortOrder });
  }

  async function onRemove(arm: PracticeArm): Promise<void> {
    setError(null);
    const result = await removeArm(arm);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setMessage(
      result.data === "deleted"
        ? `Removed "${arm.name}".`
        : `Archived "${arm.name}" — its records are kept and can be restored.`,
    );
  }

  async function onAdd(): Promise<void> {
    setError(null);
    setMessage(null);
    const result = await addArm({ trialId, name: newName.trim(), type: newType });
    if (!result.success) {
      setError(result.error);
      return;
    }
    setNewName("");
    setMessage(`Added "${result.data.name}".`);
  }

  return (
    <Card>
      <CardTitle>{word.Many}</CardTitle>
      <p className="mt-1 text-sm text-ink-soft">
        The {word.many} this trial compares. Every trial keeps one control; the rest are
        the alternatives being tested against it.
      </p>
      {layoutLocked ? (
        <p className="mt-2 rounded-lg bg-accent/20 p-3 text-sm">
          Records have been taken against the plot layout, so the set of {word.many} is
          fixed. Adding or removing one now would change which {word.one} each plot holds,
          and re-label every record already taken. Renaming is still fine.
        </p>
      ) : null}

      <ul className="mt-3 divide-y divide-line">
        {active.map((arm, index) => (
          <li key={arm.armId} className="flex flex-wrap items-center gap-2 py-2">
            <input
              aria-label={`Rename ${arm.name}`}
              defaultValue={arm.name}
              onBlur={(changeEvent) => {
                const name = changeEvent.target.value.trim();
                if (name && name !== arm.name) void saveArm({ ...arm, name });
              }}
              className="min-h-11 flex-1 rounded-lg border border-line-strong bg-surface px-3"
            />
            <StatusPill status={arm.type} />
            <button
              type="button"
              aria-label={`Move ${arm.name} up`}
              disabled={index === 0 || layoutLocked}
              onClick={() => void reorder(index, -1)}
              className="min-h-11 min-w-11 rounded-lg border border-line disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${arm.name} down`}
              disabled={index === active.length - 1 || layoutLocked}
              onClick={() => void reorder(index, 1)}
              className="min-h-11 min-w-11 rounded-lg border border-line disabled:opacity-30"
            >
              ↓
            </button>
            {layoutLocked ? null : (
              <button
                type="button"
                aria-label={`Remove ${arm.name}`}
                onClick={() => void onRemove(arm)}
                className="min-h-11 rounded-lg border border-danger/40 px-3 font-medium text-danger"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {archived.length > 0 ? (
        <div className="mt-3">
          <h3 className="text-sm font-semibold text-ink-soft">Archived</h3>
          <ul className="divide-y divide-line text-sm">
            {archived.map((arm) => (
              <li key={arm.armId} className="flex flex-wrap items-center gap-2 py-2">
                <span className="flex-1 text-ink-soft">{arm.name}</span>
                <button
                  type="button"
                  onClick={() => void saveArm({ ...arm, archived: false })}
                  className="min-h-11 rounded-lg border border-primary px-3 font-medium text-primary dark:text-primary-soft"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form
        className={`mt-3 flex-wrap gap-2 ${layoutLocked ? "hidden" : "flex"}`}
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          void onAdd();
        }}
      >
        <input
          aria-label={`New ${word.one} name`}
          placeholder="e.g. Improved handling"
          value={newName}
          onChange={(changeEvent) => setNewName(changeEvent.target.value)}
          required
          className="min-h-11 flex-1 rounded-lg border border-line-strong bg-surface px-3"
        />
        <select
          aria-label={`${word.One} type`}
          value={newType}
          onChange={(changeEvent) => setNewType(changeEvent.target.value as PracticeArm["type"])}
          className="min-h-11 rounded-lg border border-line-strong bg-surface px-3"
        >
          <option value="alternative">Alternative</option>
          <option value="control">Control</option>
        </select>
        <button type="submit" className="min-h-11 rounded-lg bg-primary px-4 font-medium text-white">
          Add {word.one}
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mt-2 text-sm text-success">
          {message}
        </p>
      ) : null}
    </Card>
  );
}

/**
 * Every form the trial protocol needs, not just the per-pass grower record:
 * calibration, weather, cost logs and the rest each have their own cadence
 * and their own place to be filled in.
 */
function TrialForms({
  trial,
  templates,
  word,
}: {
  trial: Trial;
  templates: FormTemplate[];
  word: Words;
}) {
  const growerForms = templates.filter((template) => template.audience === "grower");
  const staffForms = templates.filter((template) => template.audience === "staff");

  const row = (template: FormTemplate) => (
    <li key={template.templateId} className="flex flex-wrap items-center gap-2 py-2">
      <span className="flex-1">
        <span className="font-medium">{template.name}</span>
        {template.frequency ? (
          <span className="block text-meta text-ink-soft">
            {template.frequency}
            {template.requiresSite ? " · per site" : " · whole trial"}
            {template.requiresArm ? ` · per ${word.one}` : ""}
          </span>
        ) : null}
        <span className="mt-2 block max-w-md">
          <TimingEditor template={template} />
        </span>
      </span>
      <Link
        to={`/trials/${trial.trialId}/entry?form=${template.templateId}`}
        className="min-h-11 rounded-lg border border-primary px-3 py-2 font-medium text-primary dark:text-primary-soft"
      >
        Fill in
      </Link>
      <Link
        to={`/trials/${trial.trialId}/template?form=${template.templateId}`}
        className="min-h-11 rounded-lg border border-line-strong px-3 py-2 font-medium"
      >
        Edit
      </Link>
    </li>
  );

  return (
    <Card tone="quiet">
      <CardTitle>Trial forms</CardTitle>
      {growerForms.length > 0 ? (
        <>
          <h3 className="mt-2 text-sm font-semibold text-ink-soft">
            Filled in on site
          </h3>
          <ul className="divide-y divide-line">
            {growerForms.map(row)}
          </ul>
        </>
      ) : null}
      {staffForms.length > 0 ? (
        <>
          <h3 className="mt-3 text-sm font-semibold text-ink-soft">
            Filled in by staff
          </h3>
          <ul className="divide-y divide-line">
            {staffForms.map(row)}
          </ul>
        </>
      ) : null}
      <AddForm trial={trial} />
    </Card>
  );
}

/**
 * A second form, and a third.
 *
 * Most protocols are several visits, not one: an emergence count, a mid-season
 * disease score, a harvest weight. Each wants its own questions, its own
 * audience and — since timing hangs off a form — its own place in the season.
 * Until now a trial got exactly one form when it was created and there was no
 * way to add another short of rebuilding the trial from a spreadsheet.
 */
function AddForm({ trial }: { trial: Trial }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<FormAudience>("grower");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(): Promise<void> {
    setSaving(true);
    setError(null);
    const result = await addTemplate({ trialId: trial.trialId, name, audience });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    // Straight into the editor: a new form has one placeholder question and is
    // no use until somebody says what it asks.
    navigate(`/trials/${trial.trialId}/template?form=${result.data.templateId}`);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 min-h-11 w-full rounded-lg border border-dashed border-line-strong px-4 py-2.5 font-medium text-ink-soft"
      >
        + Add a form
      </button>
    );
  }

  return (
    <form
      className="mt-3 space-y-3 rounded-lg border border-line p-3"
      onSubmit={(submitEvent) => {
        submitEvent.preventDefault();
        void create();
      }}
    >
      <label className="block text-sm font-medium">
        What is this form for?
        <input
          value={name}
          onChange={(changeEvent) => setName(changeEvent.target.value)}
          required
          placeholder="e.g. Emergence count"
          className="mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 py-2"
        />
        <span className="mt-1 block text-sm font-normal text-ink-faint">
          Name it after the visit, not the trial — it is what somebody picks from a list
          in a paddock.
        </span>
      </label>

      <fieldset>
        <legend className="text-sm font-medium">Who fills it in?</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {(["grower", "staff"] as const).map((who) => (
            <label
              key={who}
              className={`min-h-11 flex-1 cursor-pointer rounded-lg border px-3 py-2.5 ${
                audience === who ? "border-primary bg-primary/10" : "border-line-strong"
              }`}
            >
              <input
                type="radio"
                name="audience"
                className="sr-only"
                checked={audience === who}
                onChange={() => setAudience(who)}
              />
              <span className="font-medium">
                {who === "grower" ? "In the paddock" : "Staff"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {error ? <ErrorState message={error} /> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="min-h-11 flex-1 rounded-lg bg-primary px-4 py-2.5 font-medium text-white disabled:opacity-60"
        >
          {saving ? "Adding…" : "Add the form"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Copyable entry links, one per site and practice. Every link names both, so a
 * run can never be recorded against the wrong site.
 */
function EntryLinks({
  trial,
  sites,
  arms,
  selectedSiteId,
  word,
}: {
  trial: Trial;
  sites: Site[];
  arms: PracticeArm[];
  selectedSiteId: string | null;
  word: Words;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { accessCode } = useAccess();

  const shown = selectedSiteId ? sites.filter((site) => site.siteId === selectedSiteId) : sites;
  // With a layout the plot decides the practice, so a per-practice link would
  // be a choice the grower no longer has to make — and one more link to get
  // wrong.
  const laidOut = trial.design === "replicated" && trial.layoutSeed !== null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 w-full rounded-lg border border-dashed border-line-strong px-4 py-2.5 font-medium text-ink-soft"
      >
        🔗 Show the links for recording in the field
      </button>
    );
  }

  return (
    <Card tone="feature">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Entry links</CardTitle>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-11 rounded-lg border border-line-strong px-3 font-medium"
        >
          Hide
        </button>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {laidOut
          ? `One link per site. The form asks which plot, and works out the ${word.one} from the layout — so there is nothing to match up and nothing to send twice.`
          : `Send the link that matches where the grower is and which ${word.one} they are using. Each link fills in the site and ${word.one} automatically.`}
      </p>
      <p className="mt-1 text-sm text-ink-faint">
        These links carry the entry code, so whoever you send one to taps it and starts
        recording. Treat a link like the code itself — anyone who has it can add entries.
      </p>
      {shown.map((site) => (
        <div key={site.siteId} className="mt-3">
          <h3 className="font-semibold">📍 {site.location}</h3>
          <ul className="mt-1 divide-y divide-line text-sm">
            {(laidOut ? [null] : arms).map((arm) => {
              const url = buildEntryUrl(
                window.location.origin,
                import.meta.env.BASE_URL,
                trial.trialId,
                site.siteId,
                arm?.armId ?? null,
                accessCode,
              );
              const key = `${site.siteId}-${arm?.armId ?? "all"}`;
              return (
                <li key={key} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="flex-1">{arm ? arm.name : "Any plot at this site"}</span>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(url).then(() => setCopied(key));
                    }}
                    className="min-h-11 rounded-lg border border-primary px-3 font-medium text-primary dark:text-primary-soft"
                  >
                    {copied === key ? "Copied ✓" : "Copy link"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </Card>
  );
}
