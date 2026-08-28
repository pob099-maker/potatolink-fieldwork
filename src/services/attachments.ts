// A photograph nobody planned for.
//
// Media has always been a *field*: the trial designer decides in advance that
// this form wants a photo, and the grower is asked for one. That is right for
// the photograph you know you want — the plot overview, the grading sample.
//
// It is no use at all for the other kind. Standing in a paddock, the thing
// worth photographing is precisely the thing nobody anticipated: an odd patch,
// a machine fault, damage that arrived overnight. If the form did not ask,
// there was nowhere to put it, and the observation left the paddock as a
// sentence in a notes field.
//
// So an entry can carry attachments as well as answers. They are metrics like
// everything else — which means the export, the report and the sync already
// handle them — but under a reserved name, so they are never confused with a
// field the form asked for.
//
// The reserved name is load-bearing. updateEntry deletes any metric whose name
// the form no longer asks for, which is right for a question that was removed
// and catastrophic for a photograph nobody asked for in the first place: the
// first person to fix a typo would silently delete the evidence.

import type { Metric } from "../types";

/**
 * The prefix that marks a metric as an attachment rather than an answer.
 *
 * A colon because no generated field name can contain one — they are built
 * from labels by lowercasing and replacing anything non-alphanumeric, so a
 * collision with a real field is impossible rather than merely unlikely.
 */
export const ATTACHMENT_PREFIX = "extra:";

export const isAttachmentName = (metricName: string): boolean =>
  metricName.startsWith(ATTACHMENT_PREFIX);

export const isAttachment = (metric: Pick<Metric, "metricName">): boolean =>
  isAttachmentName(metric.metricName);

/**
 * A name for the next attachment on an entry.
 *
 * Numbered from what is already there rather than from a count, so removing
 * the second of three and adding another cannot reuse a name still in use.
 */
export function nextAttachmentName(existing: Pick<Metric, "metricName">[]): string {
  const used = new Set(existing.filter(isAttachment).map((m) => m.metricName));
  let index = 1;
  while (used.has(`${ATTACHMENT_PREFIX}${index}`)) index += 1;
  return `${ATTACHMENT_PREFIX}${index}`;
}

/** What to call one on screen. "extra:2" is not a caption. */
export function attachmentLabel(metricName: string, position: number): string {
  return isAttachmentName(metricName) ? `Attachment ${position}` : metricName;
}
