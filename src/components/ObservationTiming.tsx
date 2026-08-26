// Observation timing, in three places it has to appear.
//
// The banner, so somebody opening the app is told what is waiting rather than
// having to go looking. The planting card, so the anchor everything hangs off
// can be entered and corrected. The timing editor, so a form can say what it
// is waiting for.
//
// One rule runs through all of it: an estimate is labelled as an estimate,
// every time it is shown. A window worked out from a typical day count and a
// window somebody confirmed by standing in the crop are different kinds of
// claim, and a grower deciding whether to drive an hour is entitled to know
// which one they are looking at.

import { useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Card, CardTitle, ErrorState } from "./ui";
import { useAccess } from "../contexts/AccessContext";
import { saveSite, saveTemplate } from "../services/store";
import { DEFAULT_STAGES, stageLabel } from "../services/growthStages";
import { todayIso } from "../services/dueList";
import { describeWindow, needsAttention, type DueItem, type TimingStatus } from "../services/timing";
import { buildCalendar, calendarFileName, downloadCalendar } from "../services/calendarExport";
import type { FormTemplate, Site, Trial } from "../types";

const inputClass =
  "mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 py-2";

const STATUS_STYLE: Record<TimingStatus, string> = {
  overdue: "bg-danger/15 text-danger",
  due: "bg-warning/15 text-warning",
  notYet: "bg-primary/10 text-primary dark:bg-primary-soft/20 dark:text-primary-soft",
  recorded: "bg-success/15 text-success",
  unscheduled: "bg-ink/10 text-ink-soft",
};

const STATUS_LABEL: Record<TimingStatus, string> = {
  overdue: "Late",
  due: "Due now",
  notYet: "Coming up",
  recorded: "Recorded",
  unscheduled: "Not scheduled",
};

export function TimingPill({ status }: { status: TimingStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-meta font-medium ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function entryLink(item: DueItem, code: string): string {
  return `/trials/${item.trialId}/entry?form=${item.templateId}&site=${item.siteId}&code=${encodeURIComponent(code)}`;
}

/**
 * What is waiting, at the top of the screen.
 *
 * Only ever shows what is due or late. "Coming up" belongs on the trial page,
 * where somebody has gone looking; putting it here would mean the banner is
 * always on, and a banner that is always on is furniture rather than a
 * warning.
 */
export function DueNowBanner({ items, showTrial = true }: { items: DueItem[]; showTrial?: boolean }) {
  const today = todayIso();
  const urgent = needsAttention(items);
  if (urgent.length === 0) return null;

  const late = urgent.filter((item) => item.window.status === "overdue").length;

  return (
    <Card tone="feature">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle>
          {urgent.length === 1 ? "An observation is due" : `${urgent.length} observations are due`}
        </CardTitle>
        {late > 0 ? (
          <span className="text-meta font-medium text-danger">
            {late === 1 ? "1 is past its window" : `${late} are past their window`}
          </span>
        ) : null}
      </div>
      <ul className="mt-3 divide-y divide-line">
        {urgent.slice(0, 5).map((item) => (
          <li key={`${item.templateId}-${item.siteId}`} className="flex flex-wrap items-center gap-2 py-3">
            <span className="w-full sm:flex-1">
              <span className="block font-medium">
                {item.formName} · {item.siteName}
              </span>
              {showTrial ? (
                <span className="block text-meta text-ink-faint">{item.trialName}</span>
              ) : null}
              <span className="block text-sm text-ink-soft">
                {describeWindow(item.window, today)}
              </span>
            </span>
            <TimingPill status={item.window.status} />
            <RecordLink item={item} />
          </li>
        ))}
      </ul>
      {urgent.length > 5 ? (
        <p className="mt-2 text-sm text-ink-faint">
          and {urgent.length - 5} more.
        </p>
      ) : null}
    </Card>
  );
}

function RecordLink({ item }: { item: DueItem }) {
  const { accessCode } = useAccess();
  return (
    <Link
      to={entryLink(item, accessCode)}
      className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
    >
      Record
    </Link>
  );
}

/**
 * Everything scheduled for one trial, due or not, plus the calendar file.
 *
 * The calendar is the reminder. Fieldwork has no server and so cannot send
 * anything; a .ics file hands the job to the phone's own calendar, which the
 * grower already checks and already knows how to silence.
 */
export function TrialSchedule({ trial, items }: { trial: Trial; items: DueItem[] }) {
  const today = todayIso();
  const scheduled = items.filter((item) => item.window.status !== "unscheduled");
  const estimated = scheduled.some((item) => item.window.estimated);

  if (items.length === 0) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle>When observations are due</CardTitle>
        {scheduled.length > 0 ? (
          <button
            type="button"
            onClick={() =>
              downloadCalendar(
                calendarFileName(trial.name),
                buildCalendar(scheduled),
              )
            }
            className="min-h-11 rounded-lg border border-line-strong px-3 font-medium"
          >
            Add to calendar
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Worked out from each site's planting date. Download the calendar file and open it
        on the phone that does the recording — its own calendar then does the reminding,
        which is the only thing that reaches somebody who has not opened this app.
      </p>

      <ul className="mt-3 divide-y divide-line">
        {items.map((item) => (
          <li key={`${item.templateId}-${item.siteId}`} className="flex flex-wrap items-center gap-2 py-3">
            <span className="w-full sm:flex-1">
              <span className="block font-medium">
                {item.formName} · {item.siteName}
              </span>
              <span className="block text-sm text-ink-soft">
                {describeWindow(item.window, today)}
              </span>
            </span>
            <TimingPill status={item.window.status} />
          </li>
        ))}
      </ul>

      {estimated ? (
        <p className="mt-3 rounded-lg bg-sunk p-3 text-sm text-ink-soft">
          Dates marked <strong>estimated</strong> come from the planting date and a typical
          number of days. Seasons move them, sometimes by a fortnight. Confirm the stage
          below when it actually arrives and every date hanging off it moves with it — then
          download the calendar again.
        </p>
      ) : null}
    </Card>
  );
}

/**
 * The planting date, and the stages that have actually arrived.
 *
 * Per site, because two sites planted a fortnight apart are two schedules —
 * the same reason each site's plot layout is randomised separately.
 */
export function PlantingCard({ sites }: { sites: Site[] }) {
  if (sites.length === 0) return null;
  return (
    <Card tone="quiet">
      <CardTitle>Planting and growth stages</CardTitle>
      <p className="mt-1 text-sm text-ink-soft">
        The planting date is what observation timing is worked out from. Confirming a
        stage when it arrives replaces the estimate for everything that hangs off it.
      </p>
      <div className="mt-3 flex flex-col gap-4">
        {sites.map((site) => (
          <SiteTiming key={site.siteId} site={site} />
        ))}
      </div>
    </Card>
  );
}

function SiteTiming({ site }: { site: Site }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stageDates = site.stageDates ?? {};

  async function write(next: Partial<Site>): Promise<void> {
    setSaving(true);
    setError(null);
    const result = await saveSite({ ...site, ...next });
    setSaving(false);
    if (!result.success) setError(result.error);
  }

  const confirmed = DEFAULT_STAGES.filter((stage) => stageDates[stage.id]);
  const outstanding = DEFAULT_STAGES.filter((stage) => !stageDates[stage.id]);

  return (
    <div className="rounded-lg border border-line p-3">
      <h4 className="font-medium">{site.location}</h4>

      <label className="mt-2 block text-sm font-medium">
        Planting date
        <input
          type="date"
          value={site.plantingDate ?? ""}
          disabled={saving}
          onChange={(event) => void write({ plantingDate: event.target.value || null })}
          className={inputClass}
        />
        <span className="mt-1 block text-sm font-normal text-ink-faint">
          {site.plantingDate
            ? "Everything else is measured from here."
            : "Without this, nothing at this site can be scheduled."}
        </span>
      </label>

      {error ? <ErrorState message={error} /> : null}

      {confirmed.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1">
          {confirmed.map((stage) => (
            <li key={stage.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{stage.label}</span>
              <span className="text-ink-soft">
                {format(parseISO(stageDates[stage.id]), "d MMM yyyy")}
              </span>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  const next = { ...stageDates };
                  delete next[stage.id];
                  void write({ stageDates: next });
                }}
                className="min-h-11 font-medium text-danger underline"
                aria-label={`Undo the confirmed date for ${stage.label} at ${site.location}`}
              >
                Undo
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {site.plantingDate && outstanding.length > 0 ? (
        <div className="mt-3">
          <label className="block text-sm font-medium">
            Confirm a stage has arrived
            <select
              value=""
              disabled={saving}
              onChange={(event) => {
                if (!event.target.value) return;
                void write({
                  stageDates: { ...stageDates, [event.target.value]: todayIso() },
                });
              }}
              className={inputClass}
            >
              <option value="">Choose a stage reached today…</option>
              {outstanding.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}

/** When one form is wanted, set on the form rather than buried in trial setup. */
export function TimingEditor({ template }: { template: FormTemplate }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timing = template.timing;

  async function write(next: FormTemplate["timing"]): Promise<void> {
    setSaving(true);
    setError(null);
    const result = await saveTemplate({ ...template, timing: next });
    setSaving(false);
    if (!result.success) setError(result.error);
  }

  if (!template.requiresSite) {
    return (
      <p className="text-sm text-ink-faint">
        Filled in when it happens — this form is not tied to a site, so there is no
        planting date to schedule it against.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="block text-sm font-medium">
        When is this wanted?
        <select
          value={timing?.stage ?? (timing ? "__days" : "")}
          disabled={saving}
          onChange={(event) => {
            const value = event.target.value;
            if (!value) return void write(null);
            if (value === "__days") return void write({ stage: null, dapFrom: 30, dapTo: 40 });
            void write({ stage: value, dapFrom: null, dapTo: null });
          }}
          className={inputClass}
        >
          <option value="">Whenever it is filled in</option>
          {DEFAULT_STAGES.map((stage) => (
            <option key={stage.id} value={stage.id}>
              At {stage.label.toLowerCase()}
            </option>
          ))}
          <option value="__days">A set number of days after planting</option>
        </select>
      </label>

      {timing ? (
        <div className="flex flex-wrap gap-2">
          <label className="text-sm font-medium">
            {timing.stage ? "Days after the stage" : "From day"}
            <input
              type="number"
              inputMode="numeric"
              value={timing.dapFrom ?? ""}
              disabled={saving}
              placeholder={timing.stage ? "0" : "30"}
              onChange={(event) =>
                void write({
                  ...timing,
                  dapFrom: event.target.value === "" ? null : Number(event.target.value),
                })
              }
              className={`${inputClass} w-28`}
            />
          </label>
          <label className="text-sm font-medium">
            {timing.stage ? "Until day" : "To day"}
            <input
              type="number"
              inputMode="numeric"
              value={timing.dapTo ?? ""}
              disabled={saving}
              placeholder={timing.stage ? "0" : "40"}
              onChange={(event) =>
                void write({
                  ...timing,
                  dapTo: event.target.value === "" ? null : Number(event.target.value),
                })
              }
              className={`${inputClass} w-28`}
            />
          </label>
        </div>
      ) : null}

      {timing?.stage ? (
        <p className="text-sm text-ink-faint">
          Left blank, this uses the usual window for {stageLabel(DEFAULT_STAGES, timing.stage).toLowerCase()}.
          Fill them in to shift off the stage — 12 to 16 reads as “about a fortnight after”.
        </p>
      ) : null}

      {error ? <ErrorState message={error} /> : null}
    </div>
  );
}
