// Where the data comes from, besides the app itself.
//
// Recorded, not ingested. Nothing here is fetched or parsed, and being plain
// about that is the point: a soil probe's endpoint, a machinery export, the
// written protocol. Provenance is the first question anybody reviewing a
// trial asks, and until now nothing in the app could answer it — a number in
// the export had no way of saying where it came from if it did not come from
// somebody's phone.
//
// It is also the groundwork. Pulling a daily summary from a SensorThings
// datastream, or task totals out of an ISOXML export, both start with knowing
// which datastream and which export — and that is a question worth answering
// now, whether or not the fetching ever gets built.

import { useState } from "react";
import { saveTrial } from "../services/store";
import { Card, ErrorState } from "./ui";
import { describeScope, scopeProblem } from "../services/dataSourceScope";
import { words } from "../services/vocabulary";
import type { DataSource, DataSourceKind, PracticeArm, Site, Trial } from "../types";

const KINDS: Array<{ value: DataSourceKind; label: string; hint: string }> = [
  {
    value: "sensorthings",
    label: "Sensor feed (OGC SensorThings)",
    hint: "A datastream URL from a soil moisture probe, weather station or similar.",
  },
  {
    value: "isoxml",
    label: "Machinery export (ISOBUS / ISOXML)",
    hint: "A TASKDATA export from a terminal — as-applied, as-harvested, or a prescription.",
  },
  {
    value: "weather",
    label: "Weather record",
    hint: "A station, a bureau feed, or wherever the weather for this site is kept.",
  },
  {
    value: "document",
    label: "Document",
    hint: "The written protocol, a lab report, a scanned sheet.",
  },
  { value: "other", label: "Something else", hint: "Anything worth being able to find again." },
];

const inputClass =
  "mt-1 min-h-11 w-full rounded-lg border border-ink/20 bg-surface px-3 py-2 " +
  "dark:border-ink-dark/20 dark:bg-surface-dark";

/** A link is worth making clickable; a file path is not. */
function isLink(reference: string): boolean {
  return /^https?:\/\//i.test(reference.trim());
}

export function DataSources({
  trial,
  sites,
  arms,
}: {
  trial: Trial;
  sites: Site[];
  arms: PracticeArm[];
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DataSource>({
    label: "",
    kind: "sensorthings",
    reference: "",
    siteId: null,
    armId: null,
    plot: null,
    note: "",
  });
  const word = words(trial);

  const sources = trial.dataSources ?? [];

  async function write(next: DataSource[]): Promise<void> {
    setSaving(true);
    setError(null);
    const result = await saveTrial({ ...trial, dataSources: next });
    setSaving(false);
    if (!result.success) setError(result.error);
  }

  async function add(): Promise<void> {
    if (!draft.label.trim() || !draft.reference.trim()) return;
    const problem = scopeProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    await write([
      ...sources,
      { ...draft, label: draft.label.trim(), reference: draft.reference.trim() },
    ]);
    setDraft({
      label: "",
      kind: draft.kind,
      reference: "",
      siteId: null,
      armId: null,
      plot: null,
      note: "",
    });
    setOpen(false);
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Where the data comes from</h2>
      <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
        Anything feeding this trial that the app does not collect itself — a sensor
        datastream, a machinery export, the written protocol. These are recorded so the
        data can be traced, not fetched: nothing here is read or imported.
      </p>

      {sources.length > 0 ? (
        <ul className="mt-3 divide-y divide-ink/10 dark:divide-ink-dark/10">
          {sources.map((source, index) => {
            const kind = KINDS.find((entry) => entry.value === source.kind);
            const where = describeScope(source, sites, arms, word.One);
            return (
              <li key={`${source.reference}-${index}`} className="flex flex-wrap gap-2 py-3">
                <span className="flex-1">
                  <span className="block font-medium">{source.label}</span>
                  <span className="block text-sm text-ink/60 dark:text-ink-dark/60">
                    {kind?.label ?? source.kind} · {where}
                  </span>
                  {isLink(source.reference) ? (
                    <a
                      href={source.reference}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block break-all text-sm text-primary underline dark:text-primary-soft"
                    >
                      {source.reference}
                    </a>
                  ) : (
                    <span className="block break-all font-mono text-sm text-ink/60 dark:text-ink-dark/60">
                      {source.reference}
                    </span>
                  )}
                  {source.note ? (
                    <span className="block text-sm text-ink/60 dark:text-ink-dark/60">
                      {source.note}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${source.label}`}
                  disabled={saving}
                  onClick={() => void write(sources.filter((_, at) => at !== index))}
                  className="min-h-11 rounded-lg border border-danger/40 px-3 font-medium text-danger disabled:opacity-60"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink/50 dark:text-ink-dark/50">
          None recorded yet.
        </p>
      )}

      {error ? <ErrorState message={error} /> : null}

      {open ? (
        <form
          className="mt-3 space-y-3 rounded-lg border border-ink/15 p-3 dark:border-ink-dark/15"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            void add();
          }}
        >
          <label className="block text-sm font-medium">
            What is it?
            <input
              value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              required
              placeholder="e.g. Soil moisture probe, north end"
              className={inputClass}
            />
          </label>
          <label className="block text-sm font-medium">
            Kind
            <select
              value={draft.kind}
              onChange={(event) =>
                setDraft({ ...draft, kind: event.target.value as DataSourceKind })
              }
              className={inputClass}
            >
              {KINDS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-sm font-normal text-ink/60 dark:text-ink-dark/60">
              {KINDS.find((entry) => entry.value === draft.kind)?.hint}
            </span>
          </label>
          <label className="block text-sm font-medium">
            Link or file reference
            <input
              value={draft.reference}
              onChange={(event) => setDraft({ ...draft, reference: event.target.value })}
              required
              placeholder="https://… or where the file is kept"
              className={inputClass}
            />
          </label>
          <fieldset>
            <legend className="text-sm font-medium">What does it measure?</legend>
            <span className="mt-1 block text-sm text-ink/60 dark:text-ink-dark/60">
              A probe covers a paddock; a flow meter under a variable-rate pivot covers
              one plot, because each zone gets its own rate.
            </span>
            <select
              aria-label="What the source measures"
              value={
                draft.armId
                  ? `arm:${draft.armId}`
                  : draft.siteId
                    ? `site:${draft.siteId}`
                    : "trial"
              }
              onChange={(event) => {
                const [level, id] = event.target.value.split(":");
                setDraft({
                  ...draft,
                  siteId: level === "site" ? id : null,
                  armId: level === "arm" ? id : null,
                  // A plot number only means something inside a site.
                  plot: level === "site" ? draft.plot : null,
                });
              }}
              className={inputClass}
            >
              <option value="trial">The whole trial</option>
              {sites.map((site) => (
                <option key={site.siteId} value={`site:${site.siteId}`}>
                  📍 {site.location}
                </option>
              ))}
              {arms.map((arm) => (
                <option key={arm.armId} value={`arm:${arm.armId}`}>
                  {word.One}: {arm.name}
                </option>
              ))}
            </select>
          </fieldset>

          {draft.siteId ? (
            <label className="block text-sm font-medium">
              One plot only (optional)
              <input
                type="number"
                min={1}
                value={draft.plot ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, plot: Number(event.target.value) || null })
                }
                placeholder="Leave blank for the whole site"
                className={inputClass}
              />
              <span className="mt-1 block text-sm font-normal text-ink/60 dark:text-ink-dark/60">
                The number painted on the peg at this site.
              </span>
            </label>
          ) : null}

          <label className="block text-sm font-medium">
            Anything worth noting
            <input
              value={draft.note}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              placeholder="Optional — who owns it, how often it reports, what to ask for"
              className={inputClass}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Add it"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-11 rounded-lg border border-ink/20 px-4 py-2.5 font-medium dark:border-ink-dark/20"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 min-h-11 rounded-lg border border-primary px-4 py-2.5 font-medium text-primary dark:text-primary-soft"
        >
          + Add a data source
        </button>
      )}
    </Card>
  );
}
