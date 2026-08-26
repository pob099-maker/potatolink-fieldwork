// Weather and soil, on the trial page.
//
// Two cards rather than one, because they are two different kinds of thing and
// pretending otherwise is what produced the free-text "soil type" field this
// replaces. Weather is a time series that belongs to a station and is shared
// by every trial near it; soil is a profile that belongs to a point in one
// paddock.
//
// Both are read from files rather than fetched. BOM's JSON products carry no
// CORS headers, so a browser cannot request one and this app has no server to
// do it on the browser's behalf — saying that plainly is better than a button
// that fails in the field for reasons nobody can see.

import { useMemo, useState } from "react";
import { Card, CardTitle, ErrorState } from "./ui";
import { saveSoil, saveWeatherObservations } from "../services/store";
import { parseBomObservations, summariseWindow } from "../services/weatherImport";
import { parseSoilCsv, soilTemplateCsv } from "../services/soilImport";
import { byDepth, describeDepth } from "../services/soilAttributes";
import { downloadCsv } from "../services/export";
import type { Site, SoilResult, SoilSample, Trial, WeatherObservation } from "../types";

const inputClass =
  "mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 py-2";

const n1 = (value: number | null) => (value === null ? "—" : value.toFixed(1));

/* --- Weather -------------------------------------------------------------- */

export function WeatherCard({
  sites,
  observations,
  onSiteChange,
}: {
  sites: Site[];
  observations: WeatherObservation[];
  onSiteChange: (site: Site) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const linked = sites.filter((site) => site.bomStationId);

  async function importFeed(): Promise<void> {
    setBusy(true);
    setError(null);
    setNote(null);
    const parsed = parseBomObservations(paste);
    if (!parsed.success) {
      setBusy(false);
      setError(parsed.error);
      return;
    }
    const saved = await saveWeatherObservations(parsed.data.observations);
    setBusy(false);
    if (!saved.success) {
      setError(saved.error);
      return;
    }
    setPaste("");
    setOpen(false);
    const skipped = parsed.data.skipped.length;
    setNote(
      `Saved ${saved.data} observations from ${parsed.data.stationName || parsed.data.stationId}` +
        (skipped > 0 ? `, and skipped ${skipped} without a usable time.` : ".") +
        ` Set a site's station to ${parsed.data.stationId} to use them.`,
    );
  }

  return (
    <Card tone="quiet">
      <CardTitle>Weather</CardTitle>
      <p className="mt-1 text-sm text-ink-soft">
        Observations belong to a weather station, not to this trial — so two trials in the
        same district share one set of records, and the source can change later without
        touching either trial.
      </p>

      <div className="mt-3 flex flex-col gap-3">
        {sites.map((site) => (
          <StationLink key={site.siteId} site={site} observations={observations} onChange={onSiteChange} />
        ))}
      </div>

      {note ? <p className="mt-3 rounded-lg bg-sunk p-3 text-sm text-ink-soft">{note}</p> : null}
      {error ? <ErrorState message={error} /> : null}

      {open ? (
        <div className="mt-3 space-y-3 rounded-lg border border-line p-3">
          <label className="block text-sm font-medium">
            Paste a BOM observation feed
            <textarea
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
              rows={5}
              placeholder='{"observations":{"data":[…]}}'
              className={`${inputClass} font-mono text-meta`}
            />
            <span className="mt-1 block text-sm font-normal text-ink-faint">
              From bom.gov.au, the <code>.json</code> observation product for your nearest
              station — it carries the last 72 hours. The Bureau does not allow a browser to
              fetch it directly, so it is pasted rather than downloaded by the app.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !paste.trim()}
              onClick={() => void importFeed()}
              className="min-h-11 flex-1 rounded-lg bg-primary px-4 py-2.5 font-medium text-white disabled:opacity-60"
            >
              {busy ? "Reading…" : "Read the feed"}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setError(null); }}
              className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 min-h-11 w-full rounded-lg border border-dashed border-line-strong px-4 py-2.5 font-medium text-ink-soft"
        >
          + Add weather observations
        </button>
      )}

      {linked.length > 0 ? (
        <p className="mt-3 text-meta text-ink-faint">
          Rainfall is stored as BOM publishes it — a running total since 9am — so a window
          total takes each rain day's peak rather than adding the readings up.
        </p>
      ) : null}
    </Card>
  );
}

function StationLink({
  site,
  observations,
  onChange,
}: {
  site: Site;
  observations: WeatherObservation[];
  onChange: (site: Site) => void | Promise<void>;
}) {
  const mine = useMemo(
    () => observations.filter((row) => row.stationId === site.bomStationId),
    [observations, site.bomStationId],
  );

  const window = useMemo(() => {
    if (mine.length === 0) return null;
    const times = mine.map((row) => row.observationTime).sort();
    return summariseWindow(mine, times[0], times[times.length - 1]);
  }, [mine]);

  return (
    <div className="rounded-lg border border-line p-3">
      <h4 className="font-medium">{site.location}</h4>
      <label className="mt-2 block text-sm font-medium">
        BOM station number
        <input
          value={site.bomStationId ?? ""}
          onChange={(event) =>
            void onChange({ ...site, bomStationId: event.target.value.trim() || null })
          }
          inputMode="numeric"
          placeholder="e.g. 95936"
          className={inputClass}
        />
      </label>
      {window ? (
        <dl className="tabular mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <Fact label="Observations">{window.observations}</Fact>
          <Fact label="Mean temp">{n1(window.meanAirTempC)} °C</Fact>
          <Fact label="Range">
            {n1(window.minAirTempC)}–{n1(window.maxAirTempC)} °C
          </Fact>
          <Fact label="Rainfall">
            {window.rainfallMm === null ? "—" : `${window.rainfallMm} mm`}
          </Fact>
        </dl>
      ) : (
        <p className="mt-2 text-sm text-ink-faint">
          {site.bomStationId
            ? "No observations stored for that station yet."
            : "No station set, so no weather is attached to this site."}
        </p>
      )}
    </div>
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

/* --- Soil ----------------------------------------------------------------- */

export function SoilCard({
  trial,
  sites,
  samples,
  results,
}: {
  trial: Trial;
  sites: Site[];
  samples: SoilSample[];
  results: SoilResult[];
}) {
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState(sites[0]?.siteId ?? "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const mine = samples.filter((sample) => sites.some((site) => site.siteId === sample.siteId));

  async function importCsv(): Promise<void> {
    setBusy(true);
    setError(null);
    setNote(null);
    const parsed = parseSoilCsv(text, siteId);
    if (!parsed.success) {
      setBusy(false);
      setError(parsed.error);
      return;
    }
    const saved = await saveSoil(parsed.data.samples, parsed.data.results);
    setBusy(false);
    if (!saved.success) {
      setError(saved.error);
      return;
    }
    setText("");
    setOpen(false);
    const odd = parsed.data.uncontrolled;
    setNote(
      `Saved ${parsed.data.samples.length} samples and ${saved.data} results.` +
        (odd.length > 0
          ? ` ${odd.length} attribute ${odd.length === 1 ? "code is" : "codes are"} outside the standard list and stored as given: ${odd.join(", ")}.`
          : ""),
    );
  }

  return (
    <Card tone="quiet">
      <CardTitle>Soil</CardTitle>
      <p className="mt-1 text-sm text-ink-soft">
        Measured results, by depth, with the unit and method each one was produced by. A
        soil label like “red sandy loam” is worth recording and is somebody's judgement, so
        it sits alongside the measurements rather than standing in for them.
      </p>

      {mine.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="report-table w-full text-sm tabular">
            <thead>
              <tr>
                <th scope="col">Site</th>
                <th scope="col">Depth</th>
                <th scope="col">Attribute</th>
                <th scope="col" className="num">Result</th>
                <th scope="col">Method</th>
              </tr>
            </thead>
            <tbody>
              {[...mine].sort(byDepth).flatMap((sample) => {
                const site = sites.find((entry) => entry.siteId === sample.siteId);
                return results
                  .filter((result) => result.sampleId === sample.sampleId)
                  .map((result) => (
                    <tr key={result.resultId}>
                      <td>{site?.location ?? "—"}</td>
                      <td>{describeDepth(sample.depthFromCm, sample.depthToCm)}</td>
                      <td>{result.attributeName || result.attributeCode}</td>
                      <td className="num">
                        {result.value === null
                          ? result.textValue
                          : `${result.value}${result.unit ? ` ${result.unit}` : ""}`}
                      </td>
                      <td className="text-ink-faint">{result.methodCode}</td>
                    </tr>
                  ));
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-faint">No soil results recorded yet.</p>
      )}

      {mine.length > 0 ? (
        <p className="mt-2 text-meta text-ink-faint">
          {[...new Set(mine.map((sample) => `${sample.soilClassification} (${sample.classificationSystem})`))]
            .filter((entry) => entry.trim() !== " (unspecified)")
            .join(" · ")}
        </p>
      ) : null}

      {note ? <p className="mt-3 rounded-lg bg-sunk p-3 text-sm text-ink-soft">{note}</p> : null}
      {error ? <ErrorState message={error} /> : null}

      {open ? (
        <div className="mt-3 space-y-3 rounded-lg border border-line p-3">
          <label className="block text-sm font-medium">
            Which site?
            <select
              value={siteId}
              onChange={(event) => setSiteId(event.target.value)}
              className={inputClass}
            >
              {sites.map((site) => (
                <option key={site.siteId} value={site.siteId}>
                  {site.location}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Paste the soil report
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={5}
              placeholder="sample_point_id,sample_date,depth_from_cm,…"
              className={`${inputClass} font-mono text-meta`}
            />
            <span className="mt-1 block text-sm font-normal text-ink-faint">
              One row per result. Depths are required — a pH with no depth cannot be
              compared with anything.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !text.trim() || !siteId}
              onClick={() => void importCsv()}
              className="min-h-11 flex-1 rounded-lg bg-primary px-4 py-2.5 font-medium text-white disabled:opacity-60"
            >
              {busy ? "Reading…" : "Read the report"}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setError(null); }}
              className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={sites.length === 0}
            onClick={() => setOpen(true)}
            className="min-h-11 flex-1 rounded-lg border border-dashed border-line-strong px-4 py-2.5 font-medium text-ink-soft disabled:opacity-60"
          >
            + Add soil results
          </button>
          <button
            type="button"
            onClick={() =>
              downloadCsv(`${trial.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-soil-template.csv`, soilTemplateCsv())
            }
            className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
          >
            Blank template
          </button>
        </div>
      )}
    </Card>
  );
}
