// Setting a trial up so it can actually collect data: the sites it runs at,
// and a checklist of what is still missing. A trial created in the app starts
// with no sites, and a form that needs a site cannot be filled in until one
// exists — so the gap is named here rather than discovered in a paddock.

import { useState } from "react";
import { Link } from "react-router-dom";
import { addSite, removeSite, saveSite } from "../services/store";
import { words } from "../services/vocabulary";
import { Card, CardTitle } from "./ui";
import type { FormTemplate, PracticeArm, Site, Trial } from "../types";

export function SetupChecklist({
  trial,
  sites,
  arms,
  templates,
}: {
  trial: Trial;
  sites: Site[];
  arms: PracticeArm[];
  templates: FormTemplate[];
}) {
  const trialId = trial.trialId;
  const word = words(trial);
  const growerForm = templates.find((template) => template.audience === "grower");
  const needsSite = growerForm?.requiresSite ?? true;
  const needsArm = growerForm?.requiresArm ?? true;

  const steps = [
    {
      key: "sites",
      done: sites.length > 0,
      label:
        sites.length > 0
          ? `${sites.length} site${sites.length === 1 ? "" : "s"}`
          : "Add a site",
      hint: "Where the trial runs. Every entry is filed against a site.",
      blocking: needsSite,
    },
    {
      key: "practices",
      done: arms.length > 1,
      label:
        arms.length > 1
          ? `${arms.length} ${word.many}`
          : `Add a ${word.one} to compare`,
      hint: "A control plus at least one alternative makes a comparison.",
      blocking: needsArm,
    },
    {
      key: "replicates",
      done: trial.replicates > 1,
      label:
        trial.replicates > 1
          ? `${trial.replicates} replicates`
          : "Set how many replicates",
      hint: "A replicated trial needs a replicate count before plots can be recorded.",
      blocking: trial.design === "replicated",
    },
    {
      key: "forms",
      done: templates.length > 0,
      label:
        templates.length > 0
          ? `${templates.length} form${templates.length === 1 ? "" : "s"}`
          : "Add a form",
      hint: "What people record in the field.",
      blocking: true,
    },
  ];

  // Only show what this trial actually needs. A replicate count is
  // meaningless for an observational trial, and listing it as an unticked
  // step made the count disagree with the ticks on screen.
  const relevant = steps.filter((step) => step.blocking || step.done);
  const outstanding = relevant.filter((step) => !step.done);
  if (outstanding.length === 0) return null;

  return (
    <Card tone="feature">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Finish setting up this trial</CardTitle>
        <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-sm font-medium text-warning">
          {outstanding.length} still needed
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Entries cannot be recorded until these are in place.
      </p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {relevant.map((step) => (
          <li key={step.key} className="flex flex-wrap items-baseline gap-2">
            <span className={step.done ? "text-success" : "text-warning"}>
              {step.done ? "✓" : "○"}
            </span>
            <span className={step.done ? "text-ink-soft" : "font-medium"}>
              {step.label}
            </span>
            {!step.done ? (
              <span className="text-ink-soft">— {step.hint}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {templates.length === 0 ? (
        <Link
          to={`/trials/${trialId}/template`}
          className="mt-3 inline-block min-h-11 rounded-lg border border-primary px-4 py-2.5 font-medium text-primary dark:text-primary-soft"
        >
          Set up the form
        </Link>
      ) : null}
    </Card>
  );
}

/** Add, rename and remove the sites a trial runs at. */
export function SiteManager({ trialId, sites }: { trialId: string; sites: Site[] }) {
  const [location, setLocation] = useState("");
  const [region, setRegion] = useState("");
  const [soilType, setSoilType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const inputClass =
    "min-h-11 rounded-lg border border-line-strong bg-surface px-3";

  async function onAdd(): Promise<void> {
    setError(null);
    setMessage(null);
    const result = await addSite({
      trialId,
      location: location.trim(),
      region: region.trim(),
      soilType: soilType.trim(),
    });
    if (!result.success) {
      setError(result.error);
      return;
    }
    setLocation("");
    setRegion("");
    setSoilType("");
    setMessage(`Added ${result.data.location}.`);
  }

  async function onRemove(site: Site): Promise<void> {
    setError(null);
    setMessage(null);
    const result = await removeSite(site);
    if (!result.success) setError(result.error);
    else setMessage(`Removed ${site.location}.`);
  }

  return (
    <Card>
      <CardTitle>Sites</CardTitle>
      <p className="mt-1 text-sm text-ink-soft">
        Where this trial runs. Every entry is filed against a site, so a trial needs at
        least one before data can be recorded.
      </p>

      {sites.length === 0 ? (
        <p className="mt-2 text-sm text-warning">No sites yet — add the first one below.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {sites.map((site) => (
            <li key={site.siteId} className="flex flex-wrap items-center gap-2 py-2">
              <input
                aria-label={`Rename ${site.location}`}
                defaultValue={site.location}
                onBlur={(changeEvent) => {
                  const next = changeEvent.target.value.trim();
                  if (next && next !== site.location) void saveSite({ ...site, location: next });
                }}
                className={`${inputClass} flex-1`}
              />
              <input
                aria-label={`Region for ${site.location}`}
                defaultValue={site.region}
                placeholder="Region"
                onBlur={(changeEvent) => {
                  const next = changeEvent.target.value.trim();
                  if (next !== site.region) void saveSite({ ...site, region: next });
                }}
                className={`${inputClass} w-32`}
              />
              <button
                type="button"
                aria-label={`Remove ${site.location}`}
                onClick={() => void onRemove(site)}
                className="min-h-11 rounded-lg border border-danger/40 px-3 font-medium text-danger"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          void onAdd();
        }}
      >
        <input
          aria-label="New site location"
          placeholder="e.g. Gatton"
          value={location}
          onChange={(changeEvent) => setLocation(changeEvent.target.value)}
          required
          className={`${inputClass} flex-1`}
        />
        <input
          aria-label="Region"
          placeholder="Region"
          value={region}
          onChange={(changeEvent) => setRegion(changeEvent.target.value)}
          className={`${inputClass} w-32`}
        />
        <input
          aria-label="Soil type"
          placeholder="Soil type"
          value={soilType}
          onChange={(changeEvent) => setSoilType(changeEvent.target.value)}
          className={`${inputClass} w-32`}
        />
        <button type="submit" className="min-h-11 rounded-lg bg-primary px-4 font-medium text-white">
          Add site
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
