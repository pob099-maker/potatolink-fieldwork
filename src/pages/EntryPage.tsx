import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { buildEntryFormSchema } from "../schemas";
import { addEntry, removeEntry, updateEntry } from "../services/store";
import { metricFormValue } from "../services/metricValue";
import { templateForEvent } from "../services/events";
import { generateLayout, layoutProblem, plotContext } from "../services/layout";
import { words } from "../services/vocabulary";
import { canRecord, closedReason } from "../services/lifecycle";
import { areaAsM2, areaUnit, plotAreaM2 as plotArea } from "../services/plotArea";
import { isBackendConfigured } from "../lib/supabase";
import {
  useArms,
  useContacts,
  useEvents,
  useMetrics,
  useSites,
  useTemplates,
  useTrials,
} from "../hooks/useCollections";
import { Card, EmptyState, ErrorState, PageTitle, Skeleton, SyncBadge } from "../components/ui";
import { EntryField } from "../components/fields";
import { RecentEntries, SyncReassurance } from "../components/EntryStatus";
import { Attachments } from "../components/Attachments";
import { growerForSite } from "../services/involvement";
import { summariseSync } from "../services/syncHealth";
import {
  clearDraft,
  describeAge,
  draftId as draftIdOf,
  isStale,
  readDraft,
  writeDraft,
  type DraftKey,
  type EntryDraft,
} from "../services/entryDraft";
import { useAccess } from "../contexts/AccessContext";
import type { PlotAssignment } from "../services/layout";
import type { Words } from "../services/vocabulary";
import type {
  DeviceType,
  FormField,
  MeasurementEvent,
  Metric,
  MetricValue,
  PracticeArm,
  Site,
} from "../types";

const FIELDS_PER_SCREEN = 4; // brief allows at most 5 visible per screen

function detectDevice(): DeviceType {
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function EntryPage() {
  const { trialId } = useParams<{ trialId: string }>();
  const [searchParams] = useSearchParams();
  const { unlocked, tryUnlock } = useAccess();

  // A link that carries the code opens straight onto the form. The gate still
  // stands for anyone arriving without one; this only saves the person who was
  // sent a link from typing something they were also sent.
  const linkCode = searchParams.get("code");
  useEffect(() => {
    if (linkCode && !unlocked) tryUnlock(linkCode);
  }, [linkCode, unlocked, tryUnlock]);

  const trials = useTrials();
  const sites = useSites();
  const arms = useArms();
  const templates = useTemplates();
  const contacts = useContacts();
  const metrics = useMetrics();
  const events = useEvents();

  // Records are part of the gate, not an afterthought: a correction has to
  // open on the answers it is correcting, and the form reads them once when it
  // mounts. Waiting for them is what makes that reliable.
  const loading =
    trials.isPending ||
    sites.isPending ||
    arms.isPending ||
    templates.isPending ||
    contacts.isPending ||
    events.isPending ||
    metrics.isPending;

  const trial = trials.data?.find((candidate) => candidate.trialId === trialId);
  const trialSites = useMemo(
    () => (sites.data ?? []).filter((site) => site.trialId === trialId),
    [sites.data, trialId],
  );
  const trialArms = useMemo(
    () =>
      (arms.data ?? [])
        .filter((arm) => arm.trialId === trialId && !arm.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [arms.data, trialId],
  );
  // Which form: named by the link, else the trial's grower form.
  const trialTemplates = useMemo(
    () => (templates.data ?? []).filter((candidate) => candidate.trialId === trialId),
    [templates.data, trialId],
  );
  // Correcting an existing entry rather than adding a new one. Everything
  // about the record — its form, site, practice and replicate — comes from the
  // record itself, so a correction can never quietly re-file it somewhere else.
  const editing =
    (events.data ?? []).find((event) => event.eventId === searchParams.get("edit")) ?? null;

  const template =
    (editing ? templateForEvent(editing, trialTemplates) : undefined) ??
    trialTemplates.find((candidate) => candidate.templateId === searchParams.get("form")) ??
    trialTemplates.find((candidate) => candidate.audience === "grower") ??
    trialTemplates[0];

  // Site and arm come from the link the grower was given, so they never have
  // to choose (CLAUDE.md). When a link omits them we ask explicitly rather
  // than guessing — a silent default files runs against the wrong site.
  const [pickedSiteId, setPickedSiteId] = useState<string | null>(null);
  const [pickedArmId, setPickedArmId] = useState<string | null>(null);
  const [pickedReplicate, setPickedReplicate] = useState<number | null>(null);
  const [pickedPlot, setPickedPlot] = useState<number | null>(null);

  // After saving, the next record is almost always a different plot — the
  // recorder has walked to it. Keeping the last choice meant tapping "Add
  // another entry" silently filed the next observation against the plot you
  // just left. Only what was picked here is cleared; a site or practice named
  // by the link still holds, because that is the link's job.
  function clearPickedContext(): void {
    setPickedPlot(null);
    setPickedArmId(null);
    setPickedReplicate(null);
  }

  // A trial with a generated layout already knows which treatment is in which
  // plot. So the field question becomes the one the paddock can answer — the
  // number on the peg — and the practice and replicate are looked up. Asking
  // somebody standing in plot 7 which treatment they are looking at is both a
  // question they may not know the answer to and an invitation to guess.
  //
  // Site-specific: each site is arranged independently, so the plots offered
  // have to be the ones at the site this entry belongs to. Before this the
  // same nine numbers were offered everywhere, and the second site's records
  // were filed against the first site's arrangement.
  const contextSiteId =
    (editing ? editing.siteId : null) ??
    searchParams.get("site") ??
    pickedSiteId ??
    (trialSites.length === 1 ? trialSites[0].siteId : null);

  const plots = useMemo(() => {
    if (!trial || trial.design !== "replicated" || !trial.layoutSeed) return [];
    if (!contextSiteId) return [];
    const request = {
      design: trial.blocking === "blocks" ? ("rcb" as const) : ("crd" as const),
      arms: trialArms,
      replicates: trial.replicates,
      seed: trial.layoutSeed,
      siteId: contextSiteId,
    };
    return layoutProblem(request) ? [] : generateLayout(request);
  }, [trial, trialArms, contextSiteId]);

  const onlySite = trialSites.length === 1 ? trialSites[0] : undefined;
  const onlyArm = trialArms.length === 1 ? trialArms[0] : undefined;

  const site = editing
    ? trialSites.find((candidate) => candidate.siteId === editing.siteId)
    : (trialSites.find((candidate) => candidate.siteId === searchParams.get("site")) ??
      trialSites.find((candidate) => candidate.siteId === pickedSiteId) ??
      onlySite);
  const linkPlot = Number(searchParams.get("plot"));
  const plotNumber = editing
    ? editing.plot
    : Number.isInteger(linkPlot) && linkPlot > 0
      ? linkPlot
      : pickedPlot;
  const assignment = plots.length > 0 && plotNumber ? plotContext(plots, plotNumber) : null;

  const arm = editing
    ? trialArms.find((candidate) => candidate.armId === editing.armId)
    : (assignment
        ? trialArms.find((candidate) => candidate.armId === assignment.armId)
        : undefined) ??
      trialArms.find((candidate) => candidate.armId === searchParams.get("arm")) ??
      trialArms.find((candidate) => candidate.armId === pickedArmId) ??
      onlyArm;
  // Whose record this is.
  //
  // This used to be contacts.find(c => c.role === "grower") — the first grower
  // in the list, whatever trial or paddock the entry came from — so one
  // person's name ended up on everybody's data across every trial. The site
  // has named its grower since the first migration; nothing ever read it.
  //
  // Falls back to the old behaviour only when there is no site at all, which
  // is a whole-trial record rather than a paddock one.
  const siteGrower = growerForSite(site?.siteId ?? null, sites.data ?? []);
  const grower =
    contacts.data?.find((contact) => contact.contactId === siteGrower) ??
    contacts.data?.find((contact) => contact.role === "grower");

  // Staff previewing what a grower sees. The real form renders, but saving is
  // disabled so a preview can never leave a record behind.
  const preview = searchParams.get("preview") === "1";
  const linkRep = Number(searchParams.get("rep"));
  const replicate = editing
    ? editing.replicate
    : (assignment?.replicate ??
      (Number.isInteger(linkRep) && linkRep > 0 ? linkRep : pickedReplicate));

  if (loading) {
    return (
      <Card>
        <Skeleton lines={6} />
      </Card>
    );
  }

  if (!trial || !template) {
    return (
      <EmptyState
        message="This trial isn't set up for data entry yet."
        action={{ label: "Back to trials", to: "/trials" }}
      />
    );
  }

  // Removing an entry destroys the record this form was built from, so the
  // form unmounts before it can say anything. The confirmation belongs to the
  // route instead.
  if (searchParams.get("removed") === "1") {
    return (
      <Card className="mx-auto max-w-md text-center">
        <p className="text-4xl" aria-hidden>
          🗑️
        </p>
        <PageTitle>Entry removed</PageTitle>
        <p className="mt-2 text-ink-soft">
          It is gone from this device and is being removed everywhere else.
        </p>
        <Link
          to={`/trials/${trial.trialId}/entry`}
          className="mt-4 inline-block min-h-11 w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
        >
          Back to the form
        </Link>
      </Card>
    );
  }

  // An entry link outlives the trial it points at. Somebody arriving on one
  // after collection has finished should be told, not handed a working form
  // that files an observation into a closed trial.
  if (!canRecord(trial) && !preview) {
    return (
      <Card className="mx-auto max-w-md">
        <PageTitle>{trial.name}</PageTitle>
        <p className="mt-2 text-ink-soft">{closedReason(trial)}</p>
        <p className="mt-2 text-sm text-ink-faint">
          If that is wrong, a staff member can reopen it on the trial page.
        </p>
      </Card>
    );
  }

  if (!unlocked && !preview) {
    return (
      <AccessGate
        onSubmit={tryUnlock}
        trialName={trial.name}
        siteName={site?.location ?? null}
      />
    );
  }

  // Only ask for the context this form actually needs: a cost log belongs to
  // the trial, weather to a site, a harvest run to a site and a practice — and
  // a plot in a replicated trial also belongs to a replicate.
  // With a layout, the plot replaces both the practice and the replicate
  // question — one thing to answer instead of two, and neither can be got
  // wrong. Without one, the old pair stands.
  const laidOut = plots.length > 0 && template.requiresArm;
  const needsSite = !editing && template.requiresSite && !site;
  const needsPlot = !editing && laidOut && plotNumber == null;
  const needsArm = !editing && !laidOut && template.requiresArm && !arm;
  const needsReplicate =
    !editing &&
    !laidOut &&
    trial.design === "replicated" &&
    trial.replicates > 0 &&
    template.requiresArm &&
    replicate == null;
  if (needsSite || needsPlot || needsArm || needsReplicate) {
    return (
      <ContextChooser
        preview={preview}
        trialId={trial.trialId}
        trialName={trial.name}
        sites={trialSites}
        arms={trialArms}
        site={needsSite ? undefined : site}
        arm={needsArm ? undefined : arm}
        replicates={needsSite || needsArm ? 0 : trial.replicates}
        plots={needsSite ? [] : needsPlot ? plots : []}
        word={words(trial)}
        onPickSite={setPickedSiteId}
        onPickArm={setPickedArmId}
        onPickReplicate={setPickedReplicate}
        onPickPlot={setPickedPlot}
      />
    );
  }

  return (
    <EntryForm
      // A fresh form per entry, so switching between adding and correcting
      // never leaves the previous record's answers behind — and per context,
      // because following a link for a different site while the "entry saved"
      // confirmation was up left that confirmation on screen. The context had
      // changed underneath it and the screen had not.
      key={editing?.eventId ?? `new:${contextSiteId ?? ""}:${template.templateId}:${plotNumber ?? ""}`}
      editing={editing}
      onAddAnother={clearPickedContext}
      onChangePlot={laidOut && pickedPlot !== null ? () => setPickedPlot(null) : null}
      formName={template.name}
      trialId={trial.trialId}
      trialName={trial.name}
      siteLabel={template.requiresSite && site ? `${site.location} (${site.region})` : null}
      armLabel={template.requiresArm && arm ? arm.name : null}
      frequency={template.frequency}
      eventType={template.eventType}
      templateId={template.templateId}
      sensitive={template.commerciallySensitive ?? false}
      siteId={template.requiresSite && site ? site.siteId : null}
      armId={template.requiresArm && arm ? arm.armId : null}
      preview={preview}
      events={events.data ?? []}
      metrics={metrics.data ?? []}
      arms={trialArms}
      replicate={trial.design === "replicated" ? replicate : null}
      plot={plotNumber}
      plotAreaM2={plotArea(trial)}
      plotWidthM={trial.plotWidthM}
      replicateLabel={
        // With a layout the plot number is what is painted on the peg, so it
        // is what the person recording recognises; the replicate is bookkeeping.
        plotNumber
          ? `Plot ${plotNumber}`
          : trial.design === "replicated" && replicate
            ? `Rep ${replicate}`
            : null
      }
      enteredBy={grower?.contactId ?? ""}
      fields={[...template.fields].sort((a, b) => a.displayOrder - b.displayOrder)}
    />
  );
}

/**
 * Shown only when the entry link didn't name a site and/or arm. Growers with a
 * proper link never see this; it exists so a generic link can't silently
 * attribute a run to the wrong place.
 */
function ContextChooser({
  preview,
  trialId,
  trialName,
  sites,
  arms,
  site,
  arm,
  replicates,
  plots,
  word,
  onPickSite,
  onPickArm,
  onPickReplicate,
  onPickPlot,
}: {
  /** Staff looking at what a grower sees. Said on every screen, not just the
      form — somebody who works through two choosers before being told they are
      in a preview has been misled by omission. */
  preview: boolean;
  trialId: string;
  trialName: string;
  sites: Site[];
  arms: PracticeArm[];
  site: Site | undefined;
  arm: PracticeArm | undefined;
  replicates: number;
  plots: PlotAssignment[];
  word: Words;
  onPickSite: (siteId: string) => void;
  onPickArm: (armId: string) => void;
  onPickReplicate: (replicate: number) => void;
  onPickPlot: (plot: number) => void;
}) {
  const step = !site ? "site" : plots.length > 0 ? "plot" : !arm ? "arm" : "replicate";
  const optionCount =
    step === "site"
      ? sites.length
      : step === "plot"
        ? plots.length
        : step === "arm"
          ? arms.length
          : Math.max(0, replicates);

  // Nothing to choose from means the trial is not set up yet. Say so, rather
  // than showing a question with no answers.
  if (optionCount === 0) {
    const missing =
      step === "site" ? "a site" : step === "arm" ? `a ${word.one}` : "its replicate count";
    return (
      <Card className="mx-auto max-w-md">
        {preview ? <PreviewBanner /> : null}
        <PageTitle>Not ready for entries yet</PageTitle>
        <p className="mt-2 text-ink-soft">
          {trialName} still needs {missing} before anything can be recorded. A staff member
          can add it on the trial page.
        </p>
        {/* Staff reach this by tapping "Fill in" from the trial page, and the
            screen used to leave them with nowhere to go but the back button. */}
        <Link
          to={`/trials/${trialId}`}
          className="mt-4 inline-block min-h-11 rounded-lg border border-primary px-4 py-2.5 font-medium text-primary dark:text-primary-soft"
        >
          Go to the trial page
        </Link>
      </Card>
    );
  }
  const title =
    step === "site"
      ? "Where are you today?"
      : step === "plot"
        ? "Which plot?"
        : step === "arm"
          ? `Which ${word.one}?`
          : "Which replicate?";
  const help =
    step === "site"
      ? "Choose the site you're recording at so this run is filed correctly."
      : step === "plot"
        ? "Tap the number on the peg. The app already knows what is planted there."
        : step === "arm"
          ? `Choose the ${word.one} this run used.`
          : "Choose the replicate (plot) this record is for.";
  return (
    <Card className="mx-auto max-w-md">
      {preview ? <PreviewBanner /> : null}
      <PageTitle>{title}</PageTitle>
      <p className="mt-1 text-ink-soft">
        {trialName}. {help}
      </p>
      <div className={step === "plot" ? "mt-4" : "mt-4 space-y-2"}>
        {step === "plot" ? (
          <PlotPicker plots={plots} arms={arms} onPick={onPickPlot} />
        ) : step === "site"
          ? sites.map((candidate) => (
              <button
                key={candidate.siteId}
                type="button"
                onClick={() => onPickSite(candidate.siteId)}
                className="min-h-11 w-full rounded-lg border border-line-strong px-4 py-3 text-left font-medium hover:border-primary"
              >
                📍 {candidate.location}
                <span className="block text-sm font-normal text-ink-soft">
                  {candidate.region}
                </span>
              </button>
            ))
          : step === "arm"
          ? arms.map((candidate) => (
              <button
                key={candidate.armId}
                type="button"
                onClick={() => onPickArm(candidate.armId)}
                className="min-h-11 w-full rounded-lg border border-line-strong px-4 py-3 text-left font-medium hover:border-primary"
              >
                {candidate.name}
                <span className="block text-sm font-normal text-ink-soft">
                  {candidate.description}
                </span>
              </button>
            ))
          : Array.from({ length: Math.max(0, replicates) }, (_, index) => index + 1).map((rep) => (
              <button
                key={rep}
                type="button"
                onClick={() => onPickReplicate(rep)}
                className="min-h-11 w-full rounded-lg border border-line-strong px-4 py-3 text-left font-medium hover:border-primary"
              >
                Replicate {rep}
              </button>
            ))}
      </div>
      {site ? (
        <p className="mt-3 text-sm text-ink-faint">
          Recording at {site.location}.
        </p>
      ) : null}
      {/* A tap on the wrong site or plot used to be unrecoverable without a
          reload — the only way on was forward. */}
      <Link
        to="/record"
        className="mt-3 inline-block min-h-11 py-2.5 font-medium text-primary underline dark:text-primary-soft"
      >
        ← Somewhere else
      </Link>
    </Card>
  );
}

/**
 * The plot numbers, grouped the way the field is. Big targets, because this is
 * tapped with one thumb in a paddock, and grouped by block because that is how
 * somebody walks it — find the block, then the peg.
 */
function PlotPicker({
  plots,
  arms,
  onPick,
}: {
  plots: PlotAssignment[];
  arms: PracticeArm[];
  onPick: (plot: number) => void;
}) {
  const blocks = [...new Set(plots.map((plot) => plot.block))];
  const armName = (armId: string) => arms.find((arm) => arm.armId === armId)?.name ?? "";
  const blocked = blocks.length > 1;

  return (
    <div className="space-y-3">
      {blocks.map((block) => (
        <div key={block}>
          {blocked ? (
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
              Block {block}
            </h2>
          ) : null}
          <ul className="mt-1 grid grid-cols-3 gap-2">
            {plots
              .filter((plot) => plot.block === block)
              .map((plot) => (
                <li key={plot.plotNumber}>
                  <button
                    type="button"
                    onClick={() => onPick(plot.plotNumber)}
                    className="min-h-16 w-full rounded-lg border border-line-strong px-2 py-2 hover:border-primary"
                  >
                    <span className="block font-display text-xl font-bold">
                      {plot.plotNumber}
                    </span>
                    <span className="block truncate text-meta text-ink-faint">
                      {armName(plot.armId)}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Says which mode you are in, on every screen of the grower flow. */
function PreviewBanner() {
  return (
    <p className="mb-3 rounded-lg bg-accent/20 p-3 text-sm font-medium text-ink">
      Preview of the form as it appears on site. Nothing here is saved.
    </p>
  );
}

/** Live badge for a just-saved entry: reads the event's real sync status. */
function SavedSyncBadge({ eventId }: { eventId: string }) {
  const events = useEvents();
  const status = events.data?.find((event) => event.eventId === eventId)?.syncStatus;
  return <SyncBadge status={status ?? "pending"} />;
}

function AccessGate({
  onSubmit,
  trialName,
  siteName,
}: {
  onSubmit: (code: string) => boolean;
  trialName: string;
  siteName: string | null;
}) {
  const [code, setCode] = useState("");
  const [failed, setFailed] = useState(false);

  return (
    <Card className="mx-auto max-w-sm">
      <PageTitle>Record an observation</PageTitle>
      <p className="mt-1 font-medium">{trialName}</p>
      {siteName ? (
        <p className="text-sm text-ink-soft">📍 {siteName}</p>
      ) : null}
      <p className="mt-2 text-ink-soft">
        Enter the access code you were given to continue. This device will
        remember it.
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          if (!onSubmit(code)) setFailed(true);
        }}
      >
        <label htmlFor="access-code" className="block font-medium">
          Access code
        </label>
        <input
          id="access-code"
          type="text"
          autoComplete="off"
          value={code}
          onChange={(changeEvent) => {
            setCode(changeEvent.target.value);
            setFailed(false);
          }}
          className="w-full min-h-11 rounded-lg border border-line-strong bg-surface px-3 py-2.5"
        />
        {failed ? (
          <p role="alert" className="text-sm text-danger">
            That code doesn't match. Check with whoever sent you the link.
          </p>
        ) : null}
        <button
          type="submit"
          className="min-h-11 w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
        >
          Continue
        </button>
      </form>
    </Card>
  );
}

function EntryForm({
  preview,
  events,
  metrics,
  arms,
  formName,
  trialId,
  trialName,
  siteLabel,
  armLabel,
  replicateLabel,
  plot,
  plotAreaM2,
  plotWidthM,
  onAddAnother,
  onChangePlot,
  frequency,
  eventType,
  templateId,
  sensitive,
  siteId,
  armId,
  replicate,
  enteredBy,
  fields,
  editing,
}: {
  preview: boolean;
  events: MeasurementEvent[];
  metrics: Metric[];
  arms: PracticeArm[];
  formName: string;
  trialId: string;
  trialName: string;
  siteLabel: string | null;
  armLabel: string | null;
  replicateLabel: string | null;
  plot: number | null;
  /** The plot's area, so a weight can be shown as a yield while it is typed. */
  plotAreaM2: number | null;
  /** The working width, so a strip's area can be measured by walking it. */
  plotWidthM: number | null;
  /** Clears the plot/practice chosen on this device, ready for the next one. */
  onAddAnother: () => void;
  /** Back to the plot picker, when a plot was chosen here rather than by link. */
  onChangePlot: (() => void) | null;
  frequency: string;
  eventType: string;
  templateId: string;
  sensitive: boolean;
  siteId: string | null;
  armId: string | null;
  replicate: number | null;
  enteredBy: string;
  fields: FormField[];
  editing: MeasurementEvent | null;
}) {
  const schema = useMemo(() => buildEntryFormSchema(fields), [fields]);

  // Correcting an entry opens it on what was actually recorded, so a person
  // changing one number does not have to retype the other nine.
  const defaultValues = useMemo(() => {
    if (!editing) return {};
    const recorded = metrics.filter((metric) => metric.eventId === editing.eventId);
    const values: Record<string, unknown> = {};
    for (const field of fields) {
      const value = metricFormValue(
        field,
        recorded.find((metric) => metric.metricName === field.fieldName),
      );
      if (value !== undefined) values[field.fieldName] = value;
    }
    return values;
  }, [editing, fields, metrics]);
  const screens = useMemo(() => {
    const chunks: FormField[][] = [];
    for (let index = 0; index < fields.length; index += FIELDS_PER_SCREEN) {
      chunks.push(fields.slice(index, index + FIELDS_PER_SCREEN));
    }
    return chunks;
  }, [fields]);

  const [screenIndex, setScreenIndex] = useState(0);
  const stepRef = useRef<HTMLDivElement>(null);
  // Only after a change, never on first render: stealing focus on load drops
  // somebody into the middle of a page they have not heard the top of yet.
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    stepRef.current?.focus();
  }, [screenIndex]);
  const [saved, setSaved] = useState<MeasurementEvent | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const navigate = useNavigate();

  // Leaving the correction drops the ?edit, which re-keys this form and gives
  // whoever is holding the phone a blank one rather than a dead end.
  const doneEditing = (): void => navigate(`/trials/${trialId}/entry`);

  const {
    register,
    control,
    handleSubmit,
    trigger,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Record<string, unknown>>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues,
  });

  // Keep what has been typed, so leaving does not lose it.
  //
  // Nothing used to be written until Save. On a sixteen-field form across four
  // screens that is a trapdoor: fifteen answers in, one required field
  // somebody genuinely cannot answer, and the choice is invent a value or
  // start again. Backgrounding a browser tab is enough to lose it, and a phone
  // does that on an incoming call.
  //
  // Not while correcting an existing entry — that record already exists and is
  // the thing being edited — and not in preview, which must leave nothing
  // behind at all.
  const draftKey: DraftKey = {
    trialId,
    templateId,
    siteId,
    armId,
    replicate,
    plot,
  };
  const draftable = !preview && !editing;

  /**
   * An explicitly empty value for every field.
   *
   * reset({}) leaves registered inputs showing what was in them — the fields
   * are not mentioned, so there is nothing for the form to set them back to.
   * Naming each one is what actually empties the screen.
   */
  const blankValues = (): Record<string, unknown> =>
    Object.fromEntries(
      fields.map((field) => [field.fieldName, field.type === "multiselect" ? [] : ""]),
    );
  const [staleDraft, setStaleDraft] = useState<EntryDraft | null>(null);
  const [restored, setRestored] = useState<string | null>(null);
  const draftId = draftIdOf(draftKey);

  useEffect(() => {
    if (!draftable) return;
    let live = true;
    void readDraft(draftKey).then((draft) => {
      if (!live || !draft) return;
      if (isStale(draft, Date.now())) {
        // A different visit to the same plot. Filling last month's numbers in
        // silently would be the app inventing an observation, so it is offered
        // instead.
        setStaleDraft(draft);
        return;
      }
      reset(draft.values);
      setScreenIndex(draft.screenIndex);
      setRestored(describeAge(draft, Date.now()));
    });
    return () => {
      live = false;
    };
    // Keyed on the draft id: a different plot or form is a different draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, draftable]);

  const watched = useWatch({ control });
  useEffect(() => {
    if (!draftable) return;
    // Debounced, because writing on every keystroke would put a transaction
    // behind every character typed in a paddock.
    const timer = window.setTimeout(() => {
      void writeDraft(draftKey, watched as Record<string, unknown>, screenIndex);
    }, 800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watched, screenIndex, draftId, draftable]);

  // The area a weight should be divided by: whatever this record measured,
  // falling back to the trial's plot size. Without this the live conversion
  // stayed blank on exactly the trials that need it — a strip carries its own
  // area because strips differ in length, so the trial has no single one.
  const areaFieldNames = fields
    .filter((candidate) => candidate.type === "number" && areaUnit(candidate.unit))
    .map((candidate) => candidate.fieldName);
  const areaValues = useWatch({ control, name: areaFieldNames });
  const measuredArea = areaFieldNames.reduce<number | null>((found, name, index) => {
    if (found !== null) return found;
    const unit = areaUnit(fields.find((f) => f.fieldName === name)?.unit ?? null);
    const raw = Number((areaValues as unknown[])[index]);
    return unit && Number.isFinite(raw) && raw > 0 ? areaAsM2(raw, unit) : null;
  }, null);
  const effectiveArea = measuredArea ?? plotAreaM2;

  const currentScreen = screens[screenIndex];
  const isLastScreen = screenIndex === screens.length - 1;

  async function nextScreen(): Promise<void> {
    const valid = await trigger(currentScreen.map((field) => field.fieldName));
    if (valid) setScreenIndex((index) => index + 1);
  }

  const onSubmit = handleSubmit(async (values) => {
    if (preview) return;
    setSaveError(null);
    const metricValues = fields
      .map((field) => {
        const raw = values[field.fieldName];
        if (raw === undefined || raw === "" || raw === null) return null;
        if (field.type === "photo" || field.type === "video" || field.type === "file") {
          return {
            metricName: field.fieldName,
            value: field.type,
            unit: "",
            photoUrl: String(raw),
          };
        }
        if (field.type === "multiselect") {
          const chosen = Array.isArray(raw) ? (raw as string[]) : [];
          if (chosen.length === 0) return null;
          // Stored as the list it is, not joined into one cell — the export
          // splits it back into one row per choice.
          return { metricName: field.fieldName, value: chosen, unit: "", photoUrl: null };
        }
        return {
          metricName: field.fieldName,
          value: raw as MetricValue,
          unit: field.unit ?? "",
          photoUrl: null,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);

    const result = editing
      ? await updateEntry(editing.eventId, metricValues)
      : await addEntry({
          trialId,
          siteId,
          armId,
          replicate,
          plot,
          eventType,
          enteredBy,
          deviceType: detectDevice(),
          values: metricValues,
        });

    if (result.success) {
      // The record exists now, so the draft has done its job. Cleared only on
      // success: a failed save is exactly when somebody most needs their
      // answers to still be there.
      if (draftable) void clearDraft(draftKey);
      setRestored(null);
      setSaved(result.data);
    } else {
      setSaveError(result.error);
    }
  });

  async function onRemove(): Promise<void> {
    if (!editing) return;
    setSaveError(null);
    const result = await removeEntry(editing.eventId);
    if (result.success) navigate(`/trials/${trialId}/entry?removed=1`);
    else setSaveError(result.error);
  }

  if (saved) {
    return (
      <>
      <Card className="mx-auto max-w-md text-center">
        <p className="text-4xl" aria-hidden>
          ✅
        </p>
        <PageTitle>{editing ? "Entry updated" : "Entry saved"}</PageTitle>
        <p className="mt-2">
          <SavedSyncBadge eventId={saved.eventId} />
        </p>
        <p className="mt-2 text-ink-soft">
          {isBackendConfigured()
            ? editing
              ? "The correction is safe on this device and syncs automatically."
              : "Your record is safe on this device and syncs automatically."
            : "Saved on this device. It will sync automatically once a connection is available."}
        </p>
        <button
          type="button"
          onClick={
            editing
              ? doneEditing
              : () => {
                  reset();
                  setScreenIndex(0);
                  setSaved(null);
                  onAddAnother();
                }
          }
          className="mt-4 min-h-11 w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
        >
          {editing ? "Back to the form" : "Add another entry"}
        </button>
      </Card>

      {/* Offered after saving, not during. The form is a sequence of questions
          with an end, and an open-ended "anything else?" in the middle of it
          stops somebody who was nearly finished. Afterwards they can see what
          they wrote and then remember the odd patch two rows over — and the
          record exists to attach it to. */}
      {preview ? null : (
        <div className="mx-auto max-w-md">
          <Attachments event={saved} metrics={metrics} />
        </div>
      )}
      <div className="mx-auto mt-4 max-w-md">
        <RecentEntries
          events={events}
          metrics={metrics}
          arms={arms}
          trialId={trialId}
          siteId={siteId}
        />
      </div>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-md space-y-4">
      {preview ? <PreviewBanner /> : null}
      {editing ? (
        <p className="rounded-lg bg-accent/20 p-3 text-sm text-ink">
          <span className="font-medium">Correcting the entry from </span>
          {format(new Date(editing.eventDate), "d MMM yyyy, h:mm a")}. Saving replaces what
          was recorded — it does not add a second entry.
        </p>
      ) : null}
      <div>
        <PageTitle>{formName}</PageTitle>
        <p className="mt-1 text-sm text-ink-soft">
          {trialName}
          {frequency ? ` · ${frequency}` : ""}
        </p>
        {/* items-center, or the 44px tap target on "Change plot" stretches
            every pill on the line to match it and "Plot 1" comes out a circle. */}
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {siteLabel ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary dark:bg-primary-soft/20 dark:text-primary-soft">
              📍 {siteLabel}
            </span>
          ) : null}
          {armLabel ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary dark:bg-primary-soft/20 dark:text-primary-soft">
              {armLabel}
            </span>
          ) : null}
          {replicateLabel ? (
            <span className="rounded-full bg-accent/20 px-2.5 py-0.5 font-medium text-ink">
              {replicateLabel}
            </span>
          ) : null}
          {/* Tapping the wrong plot happens, and every way out of this screen
              used to be forwards. Only offered when the plot was chosen here —
              a link that named it is the link's answer, not a mistake. */}
          {onChangePlot ? (
            <button
              type="button"
              onClick={onChangePlot}
              className="min-h-11 py-2.5 font-medium text-primary underline dark:text-primary-soft"
            >
              Change plot
            </button>
          ) : null}
        </p>
      </div>

      {/* Said where the figures are typed, not only in setup. Somebody
          entering a service contract price is entitled to know the form was
          marked, and to know what the mark does and does not do. */}
      {sensitive ? (
        <p className="rounded-lg border border-accent bg-accent/15 p-2.5 text-sm text-ink">
          🔒 <span className="font-medium">Commercially sensitive.</span> These figures
          are marked in the export so they are not shared by accident. The mark is a
          label, not a lock — anyone who can open this form can see them.
        </p>
      ) : null}

      {preview ? null : (
        <SyncReassurance state={summariseSync(events, 0, 0)} />
      )}

      {/* Said out loud rather than done quietly. Answers appearing in a form
          nobody remembers filling in is unnerving, and on the wrong plot it
          would be worse than unnerving. */}
      {restored ? (
        <p className="flex flex-wrap items-center gap-2 rounded-lg bg-sunk p-2.5 text-sm text-ink-soft">
          Picked up where you left off — saved {restored}.
          <button
            type="button"
            onClick={() => {
              reset(blankValues());
              setScreenIndex(0);
              setRestored(null);
              void clearDraft(draftKey);
            }}
            className="min-h-11 font-medium text-primary underline dark:text-primary-soft"
          >
            Start fresh instead
          </button>
        </p>
      ) : null}

      {/* A month-old draft is a different visit to the same plot, so it is
          offered rather than applied. */}
      {staleDraft ? (
        <div className="rounded-lg bg-warning/15 p-3 text-sm">
          <p className="font-medium text-warning">
            There is an unfinished entry for this plot from{" "}
            {describeAge(staleDraft, Date.now())}.
          </p>
          <p className="mt-1 text-ink-soft">
            It has not been applied, because that long ago is usually a different
            visit.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                reset(staleDraft.values);
                setScreenIndex(staleDraft.screenIndex);
                setRestored(describeAge(staleDraft, Date.now()));
                setStaleDraft(null);
              }}
              className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
            >
              Use it
            </button>
            <button
              type="button"
              onClick={() => {
                void clearDraft(draftKey);
                setStaleDraft(null);
              }}
              className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
            >
              Discard it
            </button>
          </div>
        </div>
      ) : null}

      <p className="text-sm text-ink-faint" aria-live="polite">
        Step {screenIndex + 1} of {screens.length}
      </p>

      {/* Focus moves here when the step changes.
          Without it, pressing Next swapped the fields and left focus on the
          Next button — invisible to anybody who can see the new fields, and a
          dead end for anybody who cannot. The live region above announces
          "Step 2 of 3" either way, but announcing where you are is not the
          same as taking you there.

          A labelled group rather than the first input: landing on a heading
          says which step this is before reading out a field, and landing on an
          input skips that context entirely. tabIndex -1 makes it focusable
          without putting it in the tab order, so keyboard users are not made
          to tab through a wrapper on every step. */}
      <Card className="space-y-4">
        <div
          ref={stepRef}
          tabIndex={-1}
          role="group"
          aria-label={`Step ${screenIndex + 1} of ${screens.length}`}
          className="space-y-4"
        >
          {currentScreen.map((field) => (
            <EntryField
              key={field.fieldName}
              field={field}
              register={register}
              control={control}
              error={errors[field.fieldName]?.message as string | undefined}
              plotAreaM2={effectiveArea}
              plotWidthM={plotWidthM}
              setValue={setValue}
            />
          ))}
        </div>
      </Card>

      {saveError ? <ErrorState message={saveError} onRetry={() => void onSubmit()} /> : null}

      {preview || editing ? null : (
        <RecentEntries
          events={events}
          metrics={metrics}
          arms={arms}
          trialId={trialId}
          siteId={siteId}
        />
      )}

      <div className="flex gap-2">
        {screenIndex > 0 ? (
          <button
            type="button"
            onClick={() => setScreenIndex((index) => index - 1)}
            className="min-h-11 flex-1 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
          >
            Back
          </button>
        ) : null}
        {isLastScreen ? (
          <button
            type="submit"
            disabled={isSubmitting || preview}
            className="min-h-11 flex-1 rounded-lg bg-primary px-4 py-2.5 font-medium text-white disabled:opacity-60"
          >
            {preview
              ? "Save entry (disabled in preview)"
              : isSubmitting
                ? "Saving…"
                : editing
                  ? "Save correction"
                  : "Save entry"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void nextScreen()}
            className="min-h-11 flex-1 rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
          >
            Next
          </button>
        )}
      </div>

      {editing ? (
        <div className="pt-2 text-center">
          {removing ? (
            <div className="rounded-xl border border-danger/40 bg-danger/5 p-3">
              <p className="text-sm">
                Remove this entry for good? The measurements recorded in it are deleted
                everywhere, not just on this device.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setRemoving(false)}
                  className="min-h-11 flex-1 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
                >
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={() => void onRemove()}
                  className="min-h-11 flex-1 rounded-lg bg-danger px-4 py-2.5 font-medium text-white"
                >
                  Remove the entry
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRemoving(true)}
              className="min-h-11 px-4 py-2.5 text-sm font-medium text-danger underline"
            >
              Remove this entry
            </button>
          )}
        </div>
      ) : null}
    </form>
  );
}
