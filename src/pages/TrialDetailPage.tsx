import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  useArms,
  useEvents,
  useMetrics,
  useSites,
  useTemplates,
  useTrials,
} from "../hooks/useCollections";
import { addArm, removeArm, saveArm } from "../services/store";
import { buildEntryUrl, summariseArm } from "../services/entryLinks";
import { buildTrialCsv, csvFileName, downloadCsv } from "../services/export";
import { describeEvent, describeEventScope, eventsForTrial } from "../services/events";
import { metricDisplay } from "../services/metricValue";
import { replicationStatus, responseSummary, type Completeness, type TreatmentStat } from "../services/replication";
import { saveTrial } from "../services/store";
import { Card, EmptyState, ErrorState, PageTitle, Skeleton, StatusPill, SyncBadge } from "../components/ui";
import { SetupChecklist, SiteManager } from "../components/TrialSetup";
import type { FormTemplate, MeasurementEvent, Metric, PracticeArm, Site, Trial } from "../types";

export function TrialDetailPage() {
  const { trialId } = useParams<{ trialId: string }>();
  const trials = useTrials();
  const sites = useSites();
  const arms = useArms();
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
        <p className="mt-1 text-ink/70 dark:text-ink-dark/70">{trial.objective}</p>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <StatusPill status={trial.status} />
        </p>
      </div>

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
                  : "border-ink/20 dark:border-ink-dark/20"
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
                    : "border-ink/20 dark:border-ink-dark/20"
                }`}
              >
                📍 {site.location}
              </button>
            ))}
          </div>
          {selectedSite ? (
            <p className="mt-2 text-sm text-ink/60 dark:text-ink-dark/60">
              Showing {selectedSite.location} only — {selectedSite.region}, {selectedSite.soilType}.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {growerForm ? (
          <Link
            to={`/trials/${trial.trialId}/entry?form=${growerForm.templateId}${
              selectedSiteId ? `&site=${selectedSiteId}` : ""
            }`}
            className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
          >
            + Add an entry
          </Link>
        ) : null}
        {growerForm && trialSites.length > 0 && activeArms.length > 0 ? (
          <Link
            to={`/trials/${trial.trialId}/entry?form=${growerForm.templateId}&site=${trialSites[0].siteId}&arm=${activeArms[0].armId}&preview=1`}
            className="min-h-11 rounded-lg border border-ink/20 px-4 py-2.5 font-medium dark:border-ink-dark/20"
          >
            Preview as grower
          </Link>
        ) : null}
        <Link
          to={`/trials/${trial.trialId}/results`}
          className="min-h-11 rounded-lg border border-primary px-4 py-2.5 font-medium text-primary dark:text-primary-soft"
        >
          Results &amp; economics
        </Link>
        <button
          type="button"
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
              ),
            )
          }
          className="min-h-11 rounded-lg border border-ink/20 px-4 py-2.5 font-medium dark:border-ink-dark/20"
        >
          Export data (CSV)
        </button>
      </div>

      <TrialDesignCard trial={trial} templates={trialTemplates} />

      {trial.design === "replicated" ? (
        <ReplicationStatusCard
          status={replicationStatus(trial, activeArms, trialSites, trialEvents)}
          arms={activeArms}
        />
      ) : null}

      {trial.design === "replicated" ? (
        <ResponseSummaryCard
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

      <SetupChecklist
        trial={trial}
        sites={trialSites}
        arms={activeArms}
        templates={trialTemplates}
      />

      <SiteManager trialId={trial.trialId} sites={trialSites} />

      <ArmManager trialId={trial.trialId} arms={trialArms} />

      <TrialForms trial={trial} templates={trialTemplates} />

      <EntryLinks trial={trial} sites={trialSites} arms={activeArms} selectedSiteId={selectedSiteId} />

      {activeArms.length === 0 ? (
        <EmptyState message="No practice arms configured for this trial yet." />
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
                <h2 className="font-display text-lg font-bold">{arm.name}</h2>
                <StatusPill status={arm.type} />
              </div>
              <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">{arm.description}</p>

              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-paper p-2 dark:bg-paper-dark">
                  <dt className="text-xs text-ink/60 dark:text-ink-dark/60">Entries</dt>
                  <dd className="font-display text-xl font-bold">{summary.entryCount}</dd>
                </div>
                <div className="rounded-lg bg-paper p-2 dark:bg-paper-dark">
                  <dt className="text-xs text-ink/60 dark:text-ink-dark/60">Total tonnes</dt>
                  <dd className="font-display text-xl font-bold">
                    {summary.totalTonnes > 0 ? summary.totalTonnes.toFixed(1) : "–"}
                  </dd>
                </div>
                <div className="rounded-lg bg-paper p-2 dark:bg-paper-dark">
                  <dt className="text-xs text-ink/60 dark:text-ink-dark/60">Avg t/hr</dt>
                  <dd className="font-display text-xl font-bold">
                    {summary.throughput === null ? "–" : summary.throughput.toFixed(1)}
                  </dd>
                </div>
              </dl>

              {trialSites.length > 1 && selectedSiteId === null && summary.entryCount > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/60 dark:text-ink-dark/60">
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
                <ul className="mt-3 divide-y divide-ink/10 text-sm dark:divide-ink-dark/10">
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
                          <span className="text-ink/60 dark:text-ink-dark/60">
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
                <p className="mt-3 text-sm text-ink/50 dark:text-ink-dark/50">
                  {selectedSite
                    ? `No entries for this practice at ${selectedSite.location} yet.`
                    : "No measurement events for this arm yet."}
                </p>
              )}
            </Card>
          );
        })
      )}
    </div>
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
    <Card>
      <h2 className="font-display text-lg font-bold">Staff records</h2>
      <ul className="mt-2 divide-y divide-ink/10 text-sm dark:divide-ink-dark/10">
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
                <span className="text-ink/60 dark:text-ink-dark/60">
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
                <p className="text-xs text-ink/60 dark:text-ink-dark/60">{readable}</p>
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
}: {
  trial: Trial;
  templates: FormTemplate[];
}) {
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
    <Card>
      <h2 className="font-display text-lg font-bold">Trial design</h2>
      <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
        Observational trials record what happened. A replicated trial adds replicate
        plots and a response variable so the data can be analysed statistically.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-medium">
          Design
          <select
            value={trial.design}
            disabled={saving}
            onChange={(changeEvent) =>
              void update({ design: changeEvent.target.value as Trial["design"] })
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-ink/20 bg-surface px-3 dark:border-ink-dark/20 dark:bg-surface-dark"
          >
            <option value="observational">Observational</option>
            <option value="replicated">Replicated experiment</option>
          </select>
        </label>
        {trial.design === "replicated" ? (
          <>
            <label className="block text-sm font-medium">
              Replicates per treatment
              <input
                type="number"
                min={1}
                value={trial.replicates}
                disabled={saving}
                onChange={(changeEvent) =>
                  void update({ replicates: Math.max(0, Number(changeEvent.target.value) || 0) })
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-ink/20 bg-surface px-3 dark:border-ink-dark/20 dark:bg-surface-dark"
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
                className="mt-1 min-h-11 w-full rounded-lg border border-ink/20 bg-surface px-3 dark:border-ink-dark/20 dark:bg-surface-dark"
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
        <h2 className="font-display text-lg font-bold">Replication status</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${
            complete ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
          }`}
        >
          {status.recorded} of {status.expected} plots recorded
        </span>
      </div>
      <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
        Each cell is a plot (treatment × replicate). Amber cells are outstanding.
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
                        title={`Replicate ${cell.replicate}`}
                      >
                        {cell.recorded ? "✓" : `R${cell.replicate}`}
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
}: {
  stats: TreatmentStat[];
  responseLabel: string;
  responseUnit: string;
}) {
  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Response summary — {responseLabel}</h2>
      <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
        Descriptive means ± standard error per treatment. This is not a significance test —
        export the tidy data for statistical analysis.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink/60 dark:text-ink-dark/60">
              <th className="py-1">Treatment</th>
              <th className="py-1">n</th>
              <th className="py-1">Mean{responseUnit ? ` (${responseUnit})` : ""}</th>
              <th className="py-1">± SE</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat) => (
              <tr key={stat.armId} className="border-t border-ink/10 dark:border-ink-dark/10">
                <td className="py-1 font-medium">{stat.armName}</td>
                <td className="py-1">{stat.n}</td>
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
function ArmManager({ trialId, arms }: { trialId: string; arms: PracticeArm[] }) {
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
      <h2 className="font-display text-lg font-bold">Practices</h2>
      <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
        The practices this trial compares. Every trial keeps one control; the rest are
        the alternatives being tested against it.
      </p>

      <ul className="mt-3 divide-y divide-ink/10 dark:divide-ink-dark/10">
        {active.map((arm, index) => (
          <li key={arm.armId} className="flex flex-wrap items-center gap-2 py-2">
            <input
              aria-label={`Rename ${arm.name}`}
              defaultValue={arm.name}
              onBlur={(changeEvent) => {
                const name = changeEvent.target.value.trim();
                if (name && name !== arm.name) void saveArm({ ...arm, name });
              }}
              className="min-h-11 flex-1 rounded-lg border border-ink/20 bg-surface px-3 dark:border-ink-dark/20 dark:bg-surface-dark"
            />
            <StatusPill status={arm.type} />
            <button
              type="button"
              aria-label={`Move ${arm.name} up`}
              disabled={index === 0}
              onClick={() => void reorder(index, -1)}
              className="min-h-11 min-w-11 rounded-lg border border-ink/15 disabled:opacity-30 dark:border-ink-dark/15"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${arm.name} down`}
              disabled={index === active.length - 1}
              onClick={() => void reorder(index, 1)}
              className="min-h-11 min-w-11 rounded-lg border border-ink/15 disabled:opacity-30 dark:border-ink-dark/15"
            >
              ↓
            </button>
            <button
              type="button"
              aria-label={`Remove ${arm.name}`}
              onClick={() => void onRemove(arm)}
              className="min-h-11 rounded-lg border border-danger/40 px-3 font-medium text-danger"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {archived.length > 0 ? (
        <div className="mt-3">
          <h3 className="text-sm font-semibold text-ink/60 dark:text-ink-dark/60">Archived</h3>
          <ul className="divide-y divide-ink/10 text-sm dark:divide-ink-dark/10">
            {archived.map((arm) => (
              <li key={arm.armId} className="flex flex-wrap items-center gap-2 py-2">
                <span className="flex-1 text-ink/60 dark:text-ink-dark/60">{arm.name}</span>
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
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          void onAdd();
        }}
      >
        <input
          aria-label="New practice name"
          placeholder="e.g. Improved handling"
          value={newName}
          onChange={(changeEvent) => setNewName(changeEvent.target.value)}
          required
          className="min-h-11 flex-1 rounded-lg border border-ink/20 bg-surface px-3 dark:border-ink-dark/20 dark:bg-surface-dark"
        />
        <select
          aria-label="Practice type"
          value={newType}
          onChange={(changeEvent) => setNewType(changeEvent.target.value as PracticeArm["type"])}
          className="min-h-11 rounded-lg border border-ink/20 bg-surface px-3 dark:border-ink-dark/20 dark:bg-surface-dark"
        >
          <option value="alternative">Alternative</option>
          <option value="control">Control</option>
        </select>
        <button type="submit" className="min-h-11 rounded-lg bg-primary px-4 font-medium text-white">
          Add practice
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
function TrialForms({ trial, templates }: { trial: Trial; templates: FormTemplate[] }) {
  const growerForms = templates.filter((template) => template.audience === "grower");
  const staffForms = templates.filter((template) => template.audience === "staff");

  if (templates.length === 0) return null;

  const row = (template: FormTemplate) => (
    <li key={template.templateId} className="flex flex-wrap items-center gap-2 py-2">
      <span className="flex-1">
        <span className="font-medium">{template.name}</span>
        {template.frequency ? (
          <span className="block text-xs text-ink/60 dark:text-ink-dark/60">
            {template.frequency}
            {template.requiresSite ? " · per site" : " · whole trial"}
            {template.requiresArm ? " · per practice" : ""}
          </span>
        ) : null}
      </span>
      <Link
        to={`/trials/${trial.trialId}/entry?form=${template.templateId}`}
        className="min-h-11 rounded-lg border border-primary px-3 py-2 font-medium text-primary dark:text-primary-soft"
      >
        Fill in
      </Link>
      <Link
        to={`/trials/${trial.trialId}/template?form=${template.templateId}`}
        className="min-h-11 rounded-lg border border-ink/20 px-3 py-2 font-medium dark:border-ink-dark/20"
      >
        Edit
      </Link>
    </li>
  );

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Trial forms</h2>
      {growerForms.length > 0 ? (
        <>
          <h3 className="mt-2 text-sm font-semibold text-ink/60 dark:text-ink-dark/60">
            Filled in by growers
          </h3>
          <ul className="divide-y divide-ink/10 dark:divide-ink-dark/10">
            {growerForms.map(row)}
          </ul>
        </>
      ) : null}
      {staffForms.length > 0 ? (
        <>
          <h3 className="mt-3 text-sm font-semibold text-ink/60 dark:text-ink-dark/60">
            Filled in by staff
          </h3>
          <ul className="divide-y divide-ink/10 dark:divide-ink-dark/10">
            {staffForms.map(row)}
          </ul>
        </>
      ) : null}
    </Card>
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
}: {
  trial: Trial;
  sites: Site[];
  arms: PracticeArm[];
  selectedSiteId: string | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const shown = selectedSiteId ? sites.filter((site) => site.siteId === selectedSiteId) : sites;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 w-full rounded-lg border border-dashed border-ink/30 px-4 py-2.5 font-medium text-ink/70 dark:border-ink-dark/30 dark:text-ink-dark/70"
      >
        🔗 Show entry links to send to growers
      </button>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">Entry links</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-11 rounded-lg border border-ink/20 px-3 font-medium dark:border-ink-dark/20"
        >
          Hide
        </button>
      </div>
      <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
        Send the link that matches where the grower is and which practice they are using.
        Each link fills in the site and practice automatically.
      </p>
      {shown.map((site) => (
        <div key={site.siteId} className="mt-3">
          <h3 className="font-semibold">📍 {site.location}</h3>
          <ul className="mt-1 divide-y divide-ink/10 text-sm dark:divide-ink-dark/10">
            {arms.map((arm) => {
              const url = buildEntryUrl(
                window.location.origin,
                import.meta.env.BASE_URL,
                trial.trialId,
                site.siteId,
                arm.armId,
              );
              const key = `${site.siteId}-${arm.armId}`;
              return (
                <li key={key} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="flex-1">{arm.name}</span>
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
