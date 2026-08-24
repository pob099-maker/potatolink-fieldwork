// Tidy-data export: turn a trial's records into a long-format CSV that drops
// straight into R, GenStat, ASReml or Excel — one row per observation, so a
// biometrician receives analysable data rather than a reconciliation job.

import type {
  Contact,
  FormTemplate,
  MeasurementEvent,
  Metric,
  PracticeArm,
  Site,
  Trial,
} from "../types";
import { eventsForTrial, templateForEvent } from "./events";
import { metricExportValues } from "./metricValue";

const COLUMNS = [
  "trial",
  "trial_id",
  "site",
  "site_id",
  // One fixed name whichever word the trial shows, so two trials still pool
  // into one data frame. "treatment" is the analysis convention, and matches
  // the fieldbook the layout exports.
  "treatment",
  "treatment_type",
  "arm_id",
  // The plot is what analysis keys on once a trial has a layout — it is the
  // one column that ties a row back to a square of ground. Empty for a trial
  // laid out on paper, or none at all.
  "plot",
  "replicate",
  "form",
  "event_type",
  "event_id",
  "event_date",
  "recorded_by",
  "sync_status",
  "metric_name",
  "value",
  "unit",
  "media_url",
] as const;

/** Quote a CSV cell only when it contains a comma, quote, or newline. */
function cell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * One row per metric across every record in the trial — field records and
 * staff records alike. An event with no metrics still yields a row so nothing
 * is dropped. A media metric puts its public URL in media_url.
 */
export function buildTrialCsv(
  trial: Trial,
  sites: Site[],
  arms: PracticeArm[],
  templates: FormTemplate[],
  events: MeasurementEvent[],
  metrics: Metric[],
  contacts: Contact[] = [],
): string {
  const trialEvents = eventsForTrial(events, trial.trialId, sites, arms);
  const siteName = (id: string | null) =>
    id ? (sites.find((site) => site.siteId === id)?.location ?? "") : "";
  const arm = (id: string | null) => (id ? arms.find((a) => a.armId === id) : undefined);
  // Whoever receives this file has no way to look a contact id up. Resolve it
  // to a name, and fall back to the raw value rather than losing it.
  const recordedBy = (id: string) =>
    contacts.find((contact) => contact.contactId === id)?.name ?? id;

  const rows: string[][] = [];
  for (const event of trialEvents) {
    const armRecord = arm(event.armId);
    const template = templateForEvent(event, templates);
    const base = [
      trial.name,
      trial.trialId,
      siteName(event.siteId),
      event.siteId ?? "",
      armRecord?.name ?? "",
      armRecord?.type ?? "",
      event.armId ?? "",
      event.plot === null ? "" : String(event.plot),
      event.replicate === null ? "" : String(event.replicate),
      template?.name ?? "",
      event.eventType,
      event.eventId,
      event.eventDate,
      recordedBy(event.enteredBy),
      event.syncStatus,
    ];
    const eventMetrics = metrics.filter((metric) => metric.eventId === event.eventId);
    if (eventMetrics.length === 0) {
      rows.push([...base, "", "", "", ""]);
      continue;
    }
    for (const metric of eventMetrics) {
      const isUrl = typeof metric.photoUrl === "string" && metric.photoUrl.startsWith("http");
      // A multi-choice answer yields one row per selection, so the export
      // stays long-format rather than hiding several observations in one cell.
      for (const value of metricExportValues(metric.value)) {
        rows.push([
          ...base,
          metric.metricName,
          value,
          metric.unit,
          isUrl ? (metric.photoUrl as string) : "",
        ]);
      }
    }
  }

  const lines = [COLUMNS.join(","), ...rows.map((row) => row.map(cell).join(","))];
  return lines.join("\r\n");
}

export function csvFileName(trial: Trial): string {
  const slug = trial.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  const date = new Date().toISOString().slice(0, 10);
  return `${slug || "trial"}-${date}.csv`;
}

/** Hand the CSV to the browser as a download. No-op outside a DOM. */
export function downloadCsv(fileName: string, csv: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
