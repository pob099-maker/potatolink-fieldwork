import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { buildEntryFormSchema } from "../schemas";
import { addEntry } from "../services/store";
import { isBackendConfigured } from "../lib/supabase";
import {
  useArms,
  useContacts,
  useEvents,
  useSites,
  useTemplates,
  useTrials,
} from "../hooks/useCollections";
import { Card, EmptyState, ErrorState, PageTitle, Skeleton, SyncBadge } from "../components/ui";
import { EntryField } from "../components/fields";
import { useAccess } from "../contexts/AccessContext";
import type { DeviceType, FormField, MeasurementEvent } from "../types";

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

  const loading =
    trials.isPending || sites.isPending || arms.isPending || templates.isPending || contacts.isPending;

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
  const template = templates.data?.find((candidate) => candidate.trialId === trialId);

  // Site and arm come from the link the grower was given; never chosen by hand.
  const site =
    trialSites.find((candidate) => candidate.siteId === searchParams.get("site")) ?? trialSites[0];
  const arm =
    trialArms.find((candidate) => candidate.armId === searchParams.get("arm")) ??
    trialArms.find((candidate) => candidate.type === "control");
  const grower = contacts.data?.find((contact) => contact.role === "grower");

  if (loading) {
    return (
      <Card>
        <Skeleton lines={6} />
      </Card>
    );
  }

  if (!trial || !template || !site || !arm) {
    return (
      <EmptyState
        message="This trial isn't set up for data entry yet."
        action={{ label: "Back to trials", to: "/trials" }}
      />
    );
  }

  if (!unlocked) {
    return <AccessGate onSubmit={tryUnlock} />;
  }

  return (
    <EntryForm
      trialName={trial.name}
      siteLabel={`${site.location} (${site.region})`}
      armLabel={arm.name}
      siteId={site.siteId}
      armId={arm.armId}
      enteredBy={grower?.contactId ?? ""}
      fields={[...template.fields].sort((a, b) => a.displayOrder - b.displayOrder)}
    />
  );
}

/** Live badge for a just-saved entry: reads the event's real sync status. */
function SavedSyncBadge({ eventId }: { eventId: string }) {
  const events = useEvents();
  const status = events.data?.find((event) => event.eventId === eventId)?.syncStatus;
  return <SyncBadge status={status ?? "pending"} />;
}

function AccessGate({ onSubmit }: { onSubmit: (code: string) => boolean }) {
  const [code, setCode] = useState("");
  const [failed, setFailed] = useState(false);

  return (
    <Card className="mx-auto max-w-sm">
      <PageTitle>Enter access code</PageTitle>
      <p className="mt-1 text-ink/60 dark:text-ink-dark/60">
        Use the code from your PotatoLink contact to record trial data.
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
  trialName,
  siteLabel,
  armLabel,
  siteId,
  armId,
  enteredBy,
  fields,
}: {
  trialName: string;
  siteLabel: string;
  armLabel: string;
  siteId: string;
  armId: string;
  enteredBy: string;
  fields: FormField[];
}) {
  const schema = useMemo(() => buildEntryFormSchema(fields), [fields]);
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
  });

  const currentScreen = screens[screenIndex];
  const isLastScreen = screenIndex === screens.length - 1;

  async function nextScreen(): Promise<void> {
    const valid = await trigger(currentScreen.map((field) => field.fieldName));
    if (valid) setScreenIndex((index) => index + 1);
  }

  const onSubmit = handleSubmit(async (values) => {
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
          const chosen = Array.isArray(raw) ? raw : [];
          if (chosen.length === 0) return null;
          return {
            metricName: field.fieldName,
            value: chosen.join(", "),
            unit: "",
            photoUrl: null,
          };
        }
        return {
          metricName: field.fieldName,
          value: typeof raw === "boolean" ? String(raw) : (raw as number | string),
          unit: field.unit ?? "",
          photoUrl: null,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);

    const result = await addEntry({
      siteId,
      armId,
      eventType: "field_record",
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

  if (saved) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <p className="text-4xl" aria-hidden>
          ✅
        </p>
        <PageTitle>Entry saved</PageTitle>
        <p className="mt-2">
          <SavedSyncBadge eventId={saved.eventId} />
        </p>
        <p className="mt-2 text-ink/60 dark:text-ink-dark/60">
          {isBackendConfigured()
            ? "Your record is safe on this device and syncs automatically."
            : "Saved on this device. It will sync automatically once a connection is available."}
        </p>
        <button
          type="button"
          onClick={() => {
            reset();
            setScreenIndex(0);
            setSaved(null);
          }}
          className="mt-4 min-h-11 w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
        >
          Add another entry
        </button>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-md space-y-4">
      <div>
        <PageTitle>Record your run</PageTitle>
        <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">{trialName}</p>
        <p className="mt-2 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary dark:bg-primary-soft/20 dark:text-primary-soft">
            📍 {siteLabel}
          </span>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary dark:bg-primary-soft/20 dark:text-primary-soft">
            {armLabel}
          </span>
        </p>
      </div>

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
            disabled={isSubmitting}
            className="min-h-11 flex-1 rounded-lg bg-primary px-4 py-2.5 font-medium text-white disabled:opacity-60"
          >
            {isSubmitting ? "Saving…" : "Save entry"}
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
    </form>
  );
}
