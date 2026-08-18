import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { buildEntryFormSchema } from "../schemas";
import { addEntry, removeEntry, updateEntry } from "../services/store";
import { metricFormValue } from "../services/metricValue";
import { templateForEvent } from "../services/events";
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
import { useAccess } from "../contexts/AccessContext";
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

  const onlySite = trialSites.length === 1 ? trialSites[0] : undefined;
  const onlyArm = trialArms.length === 1 ? trialArms[0] : undefined;

  const site = editing
    ? trialSites.find((candidate) => candidate.siteId === editing.siteId)
    : (trialSites.find((candidate) => candidate.siteId === searchParams.get("site")) ??
      trialSites.find((candidate) => candidate.siteId === pickedSiteId) ??
      onlySite);
  const arm = editing
    ? trialArms.find((candidate) => candidate.armId === editing.armId)
    : (trialArms.find((candidate) => candidate.armId === searchParams.get("arm")) ??
      trialArms.find((candidate) => candidate.armId === pickedArmId) ??
      onlyArm);
  const grower = contacts.data?.find((contact) => contact.role === "grower");

  // Staff previewing what a grower sees. The real form renders, but saving is
  // disabled so a preview can never leave a record behind.
  const preview = searchParams.get("preview") === "1";
  const linkRep = Number(searchParams.get("rep"));
  const replicate = editing
    ? editing.replicate
    : Number.isInteger(linkRep) && linkRep > 0
      ? linkRep
      : pickedReplicate;

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
        <p className="mt-2 text-ink/60 dark:text-ink-dark/60">
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
  const needsSite = !editing && template.requiresSite && !site;
  const needsArm = !editing && template.requiresArm && !arm;
  const needsReplicate =
    !editing &&
    trial.design === "replicated" &&
    trial.replicates > 0 &&
    template.requiresArm &&
    replicate == null;
  if (needsSite || needsArm || needsReplicate) {
    return (
      <ContextChooser
        trialName={trial.name}
        sites={trialSites}
        arms={trialArms}
        site={needsSite ? undefined : site}
        arm={needsArm ? undefined : arm}
        replicates={needsSite || needsArm ? 0 : trial.replicates}
        onPickSite={setPickedSiteId}
        onPickArm={setPickedArmId}
        onPickReplicate={setPickedReplicate}
      />
    );
  }

  return (
    <EntryForm
      // A fresh form per entry, so switching between adding and correcting
      // never leaves the previous record's answers behind.
      key={editing?.eventId ?? "new"}
      editing={editing}
      formName={template.name}
      trialId={trial.trialId}
      trialName={trial.name}
      siteLabel={template.requiresSite && site ? `${site.location} (${site.region})` : null}
      armLabel={template.requiresArm && arm ? arm.name : null}
      frequency={template.frequency}
      eventType={template.eventType}
      siteId={template.requiresSite && site ? site.siteId : null}
      armId={template.requiresArm && arm ? arm.armId : null}
      preview={preview}
      events={events.data ?? []}
      metrics={metrics.data ?? []}
      arms={trialArms}
      replicate={trial.design === "replicated" ? replicate : null}
      replicateLabel={trial.design === "replicated" && replicate ? `Rep ${replicate}` : null}
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
  trialName,
  sites,
  arms,
  site,
  arm,
  replicates,
  onPickSite,
  onPickArm,
  onPickReplicate,
}: {
  trialName: string;
  sites: Site[];
  arms: PracticeArm[];
  site: Site | undefined;
  arm: PracticeArm | undefined;
  replicates: number;
  onPickSite: (siteId: string) => void;
  onPickArm: (armId: string) => void;
  onPickReplicate: (replicate: number) => void;
}) {
  const step = !site ? "site" : !arm ? "arm" : "replicate";
  const optionCount =
    step === "site" ? sites.length : step === "arm" ? arms.length : Math.max(0, replicates);

  // Nothing to choose from means the trial is not set up yet. Say so, rather
  // than showing a question with no answers.
  if (optionCount === 0) {
    const missing =
      step === "site" ? "a site" : step === "arm" ? "a practice" : "its replicate count";
    return (
      <Card className="mx-auto max-w-md">
        <PageTitle>Not ready for entries yet</PageTitle>
        <p className="mt-2 text-ink/60 dark:text-ink-dark/60">
          {trialName} still needs {missing} before anything can be recorded. A staff member
          can add it on the trial page.
        </p>
      </Card>
    );
  }
  const title =
    step === "site" ? "Where are you today?" : step === "arm" ? "Which practice?" : "Which replicate?";
  const help =
    step === "site"
      ? "Choose the site you're recording at so this run is filed correctly."
      : step === "arm"
        ? "Choose the practice this run used."
        : "Choose the replicate (plot) this record is for.";
  return (
    <Card className="mx-auto max-w-md">
      <PageTitle>{title}</PageTitle>
      <p className="mt-1 text-ink/60 dark:text-ink-dark/60">
        {trialName}. {help}
      </p>
      <div className="mt-4 space-y-2">
        {step === "site"
          ? sites.map((candidate) => (
              <button
                key={candidate.siteId}
                type="button"
                onClick={() => onPickSite(candidate.siteId)}
                className="min-h-11 w-full rounded-lg border border-ink/20 px-4 py-3 text-left font-medium hover:border-primary dark:border-ink-dark/20"
              >
                📍 {candidate.location}
                <span className="block text-sm font-normal text-ink/60 dark:text-ink-dark/60">
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
                className="min-h-11 w-full rounded-lg border border-ink/20 px-4 py-3 text-left font-medium hover:border-primary dark:border-ink-dark/20"
              >
                {candidate.name}
                <span className="block text-sm font-normal text-ink/60 dark:text-ink-dark/60">
                  {candidate.description}
                </span>
              </button>
            ))
          : Array.from({ length: Math.max(0, replicates) }, (_, index) => index + 1).map((rep) => (
              <button
                key={rep}
                type="button"
                onClick={() => onPickReplicate(rep)}
                className="min-h-11 w-full rounded-lg border border-ink/20 px-4 py-3 text-left font-medium hover:border-primary dark:border-ink-dark/20"
              >
                Replicate {rep}
              </button>
            ))}
      </div>
      {site ? (
        <p className="mt-3 text-sm text-ink/50 dark:text-ink-dark/50">
          Recording at {site.location}.
        </p>
      ) : null}
    </Card>
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
        <p className="text-sm text-ink/60 dark:text-ink-dark/60">📍 {siteName}</p>
      ) : null}
      <p className="mt-2 text-ink/60 dark:text-ink-dark/60">
        Enter the access code from your PotatoLink contact to continue. This device will
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
          className="w-full min-h-11 rounded-lg border border-ink/20 bg-surface px-3 py-2.5 dark:border-ink-dark/20 dark:bg-surface-dark"
        />
        {failed ? (
          <p role="alert" className="text-sm text-danger">
            That code doesn't match. Check with your PotatoLink contact.
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
  frequency,
  eventType,
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
  frequency: string;
  eventType: string;
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
    formState: { errors, isSubmitting },
  } = useForm<Record<string, unknown>>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues,
  });

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
          eventType,
          enteredBy,
          deviceType: detectDevice(),
          values: metricValues,
        });

    if (result.success) {
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
        <p className="mt-2 text-ink/60 dark:text-ink-dark/60">
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
                }
          }
          className="mt-4 min-h-11 w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
        >
          {editing ? "Back to the form" : "Add another entry"}
        </button>
      </Card>
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
      {preview ? (
        <p className="rounded-lg bg-accent/20 p-3 text-sm font-medium text-ink dark:text-ink-dark">
          Preview of what a grower sees. Nothing here is saved.
        </p>
      ) : null}
      {editing ? (
        <p className="rounded-lg bg-accent/20 p-3 text-sm text-ink dark:text-ink-dark">
          <span className="font-medium">Correcting the entry from </span>
          {format(new Date(editing.eventDate), "d MMM yyyy, h:mm a")}. Saving replaces what
          was recorded — it does not add a second entry.
        </p>
      ) : null}
      <div>
        <PageTitle>{formName}</PageTitle>
        <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
          {trialName}
          {frequency ? ` · ${frequency}` : ""}
        </p>
        <p className="mt-2 flex flex-wrap gap-2 text-sm">
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
            <span className="rounded-full bg-accent/20 px-2.5 py-0.5 font-medium text-ink dark:text-ink-dark">
              {replicateLabel}
            </span>
          ) : null}
        </p>
      </div>

      {preview ? null : (
        <SyncReassurance
          pendingCount={events.filter((event) => event.syncStatus !== "synced").length}
        />
      )}

      <p className="text-sm text-ink/50 dark:text-ink-dark/50" aria-live="polite">
        Step {screenIndex + 1} of {screens.length}
      </p>

      <Card className="space-y-4">
        {currentScreen.map((field) => (
          <EntryField
            key={field.fieldName}
            field={field}
            register={register}
            control={control}
            error={errors[field.fieldName]?.message as string | undefined}
          />
        ))}
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
            className="min-h-11 flex-1 rounded-lg border border-ink/20 px-4 py-2.5 font-medium dark:border-ink-dark/20"
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
                  className="min-h-11 flex-1 rounded-lg border border-ink/20 px-4 py-2.5 font-medium dark:border-ink-dark/20"
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
