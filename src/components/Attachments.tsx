// Adding a photograph to an entry that never asked for one.
//
// Offered after saving rather than during. Two reasons, and the second is the
// important one.
//
// The form is a sequence of questions with an end; bolting an open-ended "and
// anything else?" into the middle of it invites somebody to stop and think
// when they were nearly finished. Afterwards, the record exists, they can see
// what they wrote, and *then* remember the odd patch two rows over.
//
// And an attachment needs an entry to belong to. Saved first means it is
// written against a real record immediately, rather than held in a form's
// memory where a locked phone would lose it.

import { useRef, useState } from "react";
import { saveMedia } from "../services/media";
import { addAttachment, removeAttachment } from "../services/store";
import { attachmentLabel, isAttachment } from "../services/attachments";
import { MediaThumb } from "./MediaThumb";
import type { MeasurementEvent, Metric } from "../types";

export function Attachments({
  event,
  metrics,
}: {
  event: MeasurementEvent;
  metrics: Metric[];
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = metrics
    .filter((metric) => metric.eventId === event.eventId && isAttachment(metric))
    .sort((a, b) => a.metricName.localeCompare(b.metricName));

  async function attach(file: File, kind: "photo" | "video"): Promise<void> {
    setBusy(true);
    setError(null);
    const stored = await saveMedia(file, kind);
    if (!stored.success) {
      setBusy(false);
      setError(stored.error);
      return;
    }
    const result = await addAttachment(event.eventId, stored.data);
    setBusy(false);
    if (!result.success) setError(result.error);
  }

  return (
    <section className="mt-4 rounded-xl border border-line bg-surface p-4 text-left">
      <h2 className="font-semibold">Anything worth a picture?</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Add a photo or a video to this record — an odd patch, damage, a machine fault.
        Nothing the form asked for; just what you can see.
      </p>

      {mine.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {mine.map((metric, index) => (
            <li
              key={metric.metricId}
              className="flex items-center gap-3 rounded-lg bg-sunk p-2"
            >
              <MediaThumb pointer={metric.photoUrl ?? ""} />
              <span className="text-sm">{attachmentLabel(metric.metricName, index + 1)}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeAttachment(metric.metricId)}
                aria-label={`Remove attachment ${index + 1}`}
                className="ml-auto min-h-11 px-3 text-sm font-medium text-danger underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Two inputs rather than one: accept and capture differ, and a phone
          offers the right camera only when told which is wanted. */}
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event_) => {
          const file = event_.target.files?.[0];
          if (file) void attach(file, "photo");
          event_.target.value = "";
        }}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="sr-only"
        onChange={(event_) => {
          const file = event_.target.files?.[0];
          if (file) void attach(file, "video");
          event_.target.value = "";
        }}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => photoRef.current?.click()}
          className="min-h-11 flex-1 rounded-lg border border-dashed border-line-strong px-4 py-2.5 font-medium text-ink-soft disabled:opacity-60"
        >
          📷 {busy ? "Saving…" : "Add a photo"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => videoRef.current?.click()}
          className="min-h-11 flex-1 rounded-lg border border-dashed border-line-strong px-4 py-2.5 font-medium text-ink-soft disabled:opacity-60"
        >
          🎬 {busy ? "Saving…" : "Add a video"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
