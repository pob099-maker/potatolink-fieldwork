// A trial report you can hand to somebody, or save as a PDF.
//
// No PDF library. The browser already has one — every desktop and phone can
// "Save as PDF" from its own print dialog, and going through it means the
// output uses the reader's paper size, embeds the photos without a second
// encoding step, and costs the bundle nothing. jsPDF is around 350 KB and
// pdfmake more than a megabyte; on an app whose entire bundle is 748 KB and
// whose job is to open in a paddock with no signal, that is a poor trade for
// something used once at the end of a season.
//
// The cost is honest and small: it is Print → Save as PDF rather than a direct
// download, so the page says so.
//
// What it will not do is infer. The means are descriptive, the block note
// hedges, and the footer says plainly that nothing here is a significance
// test — the same promise the rest of the app makes, kept in the document that
// is most likely to be read by somebody who did not build the trial.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
import { replicationStatus, responseSummary } from "../services/replication";
import { blockVariation } from "../services/trialReport";
import { words } from "../services/vocabulary";
import { plotAreaM2 } from "../services/plotArea";
import { generateLayout, layoutProblem } from "../services/layout";
import { getMedia, isMediaPointer, mediaIdFromPointer } from "../services/media";
import { isLinkValue } from "../services/metricValue";
import { EmptyState, ErrorState, Skeleton } from "../components/ui";
import type { FormTemplate, MeasurementEvent, Metric } from "../types";

const dash = "—";
const n2 = (value: number | null | undefined) =>
  value === null || value === undefined ? dash : value.toFixed(2);

export function ReportPage() {
  const { trialId } = useParams();
  const trials = useTrials();
  const sites = useSites();
  const arms = useArms();
  const events = useEvents();
  const metrics = useMetrics();
  const templates = useTemplates();
  const contacts = useContacts();

  const loading =
    trials.isPending || sites.isPending || arms.isPending || events.isPending || metrics.isPending;

  const trial = (trials.data ?? []).find((candidate) => candidate.trialId === trialId);
  const trialSites = (sites.data ?? []).filter((site) => site.trialId === trialId);
  const trialArms = (arms.data ?? []).filter((arm) => arm.trialId === trialId);
  const trialTemplates = (templates.data ?? []).filter((form) => form.trialId === trialId);
  const trialEvents = useMemo(
    () => (events.data ?? []).filter((event) => event.trialId === trialId),
    [events.data, trialId],
  );
  const eventIds = useMemo(
    () => new Set(trialEvents.map((event) => event.eventId)),
    [trialEvents],
  );
  const trialMetrics = useMemo(
    () => (metrics.data ?? []).filter((metric) => eventIds.has(metric.eventId)),
    [metrics.data, eventIds],
  );

  if (loading) return <Skeleton lines={10} />;
  if (trials.isError) {
    return <ErrorState message="Could not load this trial." onRetry={() => void trials.refetch()} />;
  }
  if (!trial) {
    return <EmptyState message="Trial not found." action={{ label: "All trials", to: "/trials" }} />;
  }

  const word = words(trial);
  const activeArms = trialArms.filter((arm) => !arm.archived);
  const stats = responseSummary(trial, trialArms, trialEvents, trialMetrics);
  const variation = blockVariation(trial, trialEvents, trialMetrics);
  // Name the plot to walk to, not the replicate. "Rep 3" is bookkeeping; the
  // peg in the paddock says 7, and that is what somebody chasing a missing
  // record has to be told.
  const plotNumbers = new Map<string, number>();
  if (trial.design === "replicated" && trial.layoutSeed) {
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
        plotNumbers.set(`${site.siteId}:${plot.armId}:${plot.replicate}`, plot.plotNumber);
      }
    }
  }
  const completeness = replicationStatus(trial, trialArms, trialSites, trialEvents, plotNumbers);
  const responseLabel =
    trialTemplates
      .flatMap((form) => form.fields)
      .find((field) => field.fieldName === trial.responseMetric)?.label ?? trial.responseMetric;
  const responseUnit =
    trialTemplates
      .flatMap((form) => form.fields)
      .find((field) => field.fieldName === trial.responseMetric)?.unit ?? "";
  const outstanding = completeness.sites.flatMap((site) => {
    const missing = site.cells
      .filter((cell) => !cell.recorded)
      .map((cell) => (cell.plotNumber === null ? `rep ${cell.replicate}` : `plot ${cell.plotNumber}`));
    return missing.length === 0
      ? []
      : [`${site.siteName}: ${missing.join(", ")}`];
  });
  const area = plotAreaM2(trial);
  const contactFor = (siteId: string) => {
    const site = trialSites.find((candidate) => candidate.siteId === siteId);
    return (contacts.data ?? []).find((c) => c.contactId === site?.contactId)?.name ?? null;
  };

  return (
    <div className="report flex flex-col gap-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link to={`/trials/${trial.trialId}`} className="min-h-11 py-2.5 font-medium text-primary underline dark:text-primary-soft">
          ← Back to the trial
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
        >
          Print / Save as PDF
        </button>
      </div>

      <p className="no-print rounded-lg bg-sunk p-3 text-sm text-ink-soft">
        Choose <strong>Save as PDF</strong> as the destination in the print dialog. The report
        uses your paper size and embeds the photos; nothing is uploaded to produce it, so it
        works with no signal.
      </p>

      <header className="border-b-2 border-accent pb-3">
        <p className="font-display text-eyebrow uppercase text-ink-faint">Trial report</p>
        <h1 className="text-display text-ink">{trial.name}</h1>
        {trial.objective ? <p className="mt-2 text-ink-soft">{trial.objective}</p> : null}
        <p className="mt-2 text-meta text-ink-faint">
          Prepared {format(new Date(), "d MMMM yyyy")} · {trial.status} ·{" "}
          {trialEvents.length} {trialEvents.length === 1 ? "record" : "records"}
        </p>
      </header>

      <Section title="How the trial was set up">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <Fact label="Design">
            {trial.design === "replicated"
              ? trial.blocking === "blocks"
                ? "Randomised complete block"
                : "Completely randomised"
              : "Observational comparison"}
          </Fact>
          {trial.design === "replicated" ? (
            <Fact label="Blocks">{trial.replicates}</Fact>
          ) : null}
          <Fact label={word.Many}>{activeArms.length}</Fact>
          <Fact label="Sites">{trialSites.length}</Fact>
          {area ? <Fact label="Plot size">{area} m²</Fact> : null}
          {trial.layoutSeed ? <Fact label="Layout seed">{trial.layoutSeed}</Fact> : null}
          <Fact label="Response">{responseLabel ?? dash}</Fact>
        </dl>

        <p className="mt-3 text-sm text-ink-soft">
          {trial.layoutSeed
            ? `The arrangement was generated from seed ${trial.layoutSeed}, so it can be reproduced and checked by anyone who has it.`
            : "No randomised layout was generated for this trial."}
        </p>

        <table className="report-table mt-3 w-full text-sm">
          <caption className="sr-only">{word.Many} compared</caption>
          <thead>
            <tr>
              <th scope="col">{word.One}</th>
              <th scope="col">Role</th>
            </tr>
          </thead>
          <tbody>
            {activeArms.map((arm) => (
              <tr key={arm.armId}>
                <td>{arm.name}</td>
                <td>{arm.type === "control" ? "Control" : "Alternative"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Where it ran">
        <table className="report-table w-full text-sm">
          <thead>
            <tr>
              <th scope="col">Site</th>
              <th scope="col">Region</th>
              <th scope="col">Soil</th>
              <th scope="col">Planted</th>
              <th scope="col">Contact</th>
            </tr>
          </thead>
          <tbody>
            {trialSites.map((site) => (
              <tr key={site.siteId}>
                <td>{site.location}</td>
                <td>{site.region || dash}</td>
                <td>{site.soilType || dash}</td>
                <td>
                  {site.plantingDate
                    ? format(new Date(site.plantingDate), "d MMM yyyy")
                    : dash}
                </td>
                <td>{contactFor(site.siteId) ?? dash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Yield by ${word.one}`}>
        {trial.responseMetric ? (
          <>
            <table className="report-table w-full text-sm tabular">
              <thead>
                <tr>
                  <th scope="col">{word.One}</th>
                  <th scope="col" className="num">n</th>
                  <th scope="col" className="num">Mean{responseUnit ? ` (${responseUnit})` : ""}</th>
                  <th scope="col" className="num">± SE</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((stat) => (
                  <tr key={stat.armId}>
                    <td>{stat.armName}</td>
                    <td className="num">{stat.n}</td>
                    <td className="num">{n2(stat.mean)}</td>
                    <td className="num">{n2(stat.se)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stats.some((stat) => stat.records > stat.n) ? (
              <p className="mt-2 text-sm text-ink-soft">
                Several readings were taken in some plots. They are averaged within the plot
                before {word.many} are compared, because randomisation was applied to plots —
                so n counts plots, not records.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-ink-soft">
            No response variable was nominated for this trial, so there is nothing to average.
          </p>
        )}
      </Section>

      {variation.blocks.length > 0 ? (
        <Section title="Variation between blocks">
          <table className="report-table w-full text-sm tabular">
            <thead>
              <tr>
                <th scope="col">Block</th>
                <th scope="col" className="num">Plots</th>
                <th scope="col" className="num">Mean{responseUnit ? ` (${responseUnit})` : ""}</th>
              </tr>
            </thead>
            <tbody>
              {variation.blocks.map((block) => (
                <tr key={block.block}>
                  <td>Block {block.block}</td>
                  <td className="num">{block.n}</td>
                  <td className="num">{n2(block.mean)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {variation.note ? <p className="mt-2 text-sm text-ink-soft">{variation.note}</p> : null}
        </Section>
      ) : null}

      <Section title="How complete the trial is">
        <p className="text-sm">
          {completeness.recorded} of {completeness.expected} plots recorded.
        </p>
        {outstanding.length > 0 ? (
          <p className="mt-1 text-sm text-ink-soft">
            Still outstanding — {outstanding.join(", ")}.
          </p>
        ) : null}
      </Section>

      <PhotoLog events={trialEvents} metrics={trialMetrics} sites={trialSites} />

      <LinkLog
        events={trialEvents}
        metrics={trialMetrics}
        sites={trialSites}
        templates={trialTemplates}
      />

      {(trial.dataSources ?? []).length > 0 ? (
        <Section title="Where the data came from">
          <ul className="flex flex-col gap-1 text-sm">
            {(trial.dataSources ?? []).map((source, index) => (
              <li key={index}>
                <strong>{source.label}</strong> — <span className="break-all">{source.reference}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <footer className="border-t border-line pt-3 text-sm text-ink-soft">
        <p>
          <strong>These are descriptive figures, not a statistical analysis.</strong> No
          significance test has been run and none is implied — the means and standard errors
          describe what was recorded, nothing more. Export the trial data as CSV and analyse it
          in R or GenStat before drawing conclusions.
        </p>
        <p className="mt-2">
          Generated by Fieldwork from {trialEvents.length} records
          {trial.layoutSeed ? `, layout seed ${trial.layoutSeed}` : ""}.
        </p>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="report-section flex flex-col gap-2">
      <h2 className="font-display text-title text-primary dark:text-primary-soft">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-display text-eyebrow uppercase text-ink-faint">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/**
 * Photos, with the plot they belong to.
 *
 * A picture with no caption is decoration; the point of a disease photo is
 * which plot it was taken in, so the caption carries plot, treatment and date.
 */
/**
 * Links recorded against observations.
 *
 * They need somewhere to be, and the tables above are statistics — a lab
 * result URL recorded against one plot would otherwise be captured, exported,
 * and never seen again by anybody reading the trial. Given its own section for
 * the same reason photographs get one: it is evidence, not a measurement, and
 * it does not average.
 *
 * The address is printed as well as linked, because this page is meant to be
 * printed and a bare anchor on paper is a dead end.
 */
function LinkLog({
  events,
  metrics,
  sites,
  templates,
}: {
  events: MeasurementEvent[];
  metrics: Metric[];
  sites: Array<{ siteId: string; location: string }>;
  templates: FormTemplate[];
}) {
  // The metric carries the machine name, so a report would otherwise announce
  // "labResult" to somebody reading it on paper. The label is what the person
  // filling the form in was asked, and it is what belongs here.
  const labelFor = (fieldName: string): string => {
    for (const template of templates) {
      const field = template.fields.find((candidate) => candidate.fieldName === fieldName);
      if (field) return field.label;
    }
    return fieldName;
  };
  const links = metrics
    .filter((metric) => isLinkValue(metric.value))
    .map((metric) => ({ metric, event: events.find((e) => e.eventId === metric.eventId) }))
    .filter((entry) => entry.event);

  if (links.length === 0) return null;

  return (
    <Section title="Links recorded">
      <ul className="flex flex-col gap-2 text-sm">
        {links.map(({ metric, event }) => {
          const site = sites.find((candidate) => candidate.siteId === event?.siteId);
          const href = String(metric.value).trim();
          return (
            <li key={metric.metricId}>
              <strong>{labelFor(metric.metricName)}</strong>
              {site ? ` — ${site.location}` : ""}
              {event ? ` · ${format(new Date(event.eventDate), "d MMM yyyy")}` : ""}
              <br />
              <a href={href} className="break-all underline">
                {href}
              </a>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function PhotoLog({
  events,
  metrics,
  sites,
}: {
  events: MeasurementEvent[];
  metrics: Metric[];
  sites: Array<{ siteId: string; location: string }>;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  const photos = useMemo(
    () =>
      metrics
        .filter((metric) => isMediaPointer(metric.photoUrl ?? null))
        .map((metric) => ({ metric, event: events.find((e) => e.eventId === metric.eventId) }))
        .filter((entry) => entry.event),
    [metrics, events],
  );

  useEffect(() => {
    let live = true;
    const made: string[] = [];
    void Promise.all(
      photos.map(async ({ metric }) => {
        const item = await getMedia(mediaIdFromPointer(metric.photoUrl as string));
        if (!item || !live) return null;
        const url = URL.createObjectURL(item.blob);
        made.push(url);
        return [metric.metricId, url] as const;
      }),
    ).then((pairs) => {
      if (live) setUrls(Object.fromEntries(pairs.filter(Boolean) as Array<readonly [string, string]>));
    });
    return () => {
      live = false;
      for (const url of made) URL.revokeObjectURL(url);
    };
  }, [photos]);

  if (photos.length === 0) return null;

  return (
    <Section title="Photo log">
      <div className="photo-grid grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map(({ metric, event }) => {
          const site = sites.find((s) => s.siteId === event?.siteId);
          const caption = [
            event?.plot ? `Plot ${event.plot}` : null,
            site?.location,
            event ? format(new Date(event.eventDate), "d MMM yyyy") : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <figure key={metric.metricId} className="flex flex-col gap-1">
              {urls[metric.metricId] ? (
                <img
                  src={urls[metric.metricId]}
                  alt={`Photograph recorded at ${caption || "an unnamed plot"}`}
                  className="w-full rounded-lg border border-line"
                />
              ) : (
                <div className="aspect-[4/3] rounded-lg bg-sunk" aria-hidden />
              )}
              <figcaption className="text-meta text-ink-soft">{caption}</figcaption>
            </figure>
          );
        })}
      </div>
    </Section>
  );
}
