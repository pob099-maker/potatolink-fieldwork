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
import { buildEntryUrl, summariseArm } from "../services/entryLinks";
import { Card, EmptyState, ErrorState, PageTitle, Skeleton, StatusPill, SyncBadge } from "../components/ui";
import type { FormTemplate, PracticeArm, Site, Trial } from "../types";

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

  const trialTemplates = useMemo(
    () => (templates.data ?? []).filter((candidate) => candidate.trialId === trialId),
    [templates.data, trialId],
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
        <Link
          to={`/trials/${trial.trialId}/results`}
          className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
        >
          Results &amp; economics
        </Link>
        <Link
          to={`/trials/${trial.trialId}/template`}
          className="min-h-11 rounded-lg border border-ink/20 px-4 py-2.5 font-medium dark:border-ink-dark/20"
        >
          Edit entry form
        </Link>
      </div>

      <TrialForms trial={trial} templates={trialTemplates} />

      <EntryLinks trial={trial} sites={trialSites} arms={trialArms} selectedSiteId={selectedSiteId} />

      {trialArms.length === 0 ? (
        <EmptyState message="No practice arms configured for this trial yet." />
      ) : (
        trialArms.map((arm) => {
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
