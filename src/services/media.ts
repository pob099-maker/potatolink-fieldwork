// On-device media handling. Captured photos and videos are stored as blobs
// in IndexedDB and referenced from metrics as "media:<id>" until the sync
// engine uploads them to Supabase Storage and swaps in the public URL.

import type { MediaItem, MediaKind, Result } from "../types";
import { newId, nowIso } from "../lib/id";
import { dbGet, dbPut } from "../lib/localdb";

export const MEDIA_POINTER_PREFIX = "media:";

const MAX_BYTES: Record<MediaKind, number> = {
  photo: 20 * 1024 * 1024, // 20 MB
  video: 100 * 1024 * 1024, // 100 MB — roughly 1–2 minutes of phone video
  file: 25 * 1024 * 1024, // 25 MB — system exports, PDFs, spreadsheets
};

const CAP_MESSAGES: Record<MediaKind, string> = {
  photo: "That photo is larger than 20 MB. Try again without RAW mode.",
  video: "That video is larger than 100 MB. Keep clips under about a minute.",
  file: "That file is larger than 25 MB. Export a smaller file and try again.",
};

export function isMediaPointer(value: string | null): value is string {
  return typeof value === "string" && value.startsWith(MEDIA_POINTER_PREFIX);
}

export function mediaIdFromPointer(pointer: string): string {
  return pointer.slice(MEDIA_POINTER_PREFIX.length);
}

/** Store a captured file on the device; returns a "media:<id>" pointer. */
export async function saveMedia(file: File, kind: MediaKind): Promise<Result<string>> {
  if (file.size === 0) {
    return { success: false, error: "That file appears to be empty." };
  }
  if (file.size > MAX_BYTES[kind]) {
    return { success: false, error: CAP_MESSAGES[kind] };
  }
  const item: MediaItem = {
    mediaId: newId(),
    kind,
    mimeType:
      file.type ||
      (kind === "video"
        ? "video/mp4"
        : kind === "photo"
          ? "image/jpeg"
          : "application/octet-stream"),
    blob: file,
    uploadedUrl: null,
    createdAt: nowIso(),
  };
  try {
    await dbPut("media", item);
  } catch {
    return { success: false, error: "Could not save the file on this device." };
  }
  return { success: true, data: `${MEDIA_POINTER_PREFIX}${item.mediaId}` };
}

export async function getMedia(mediaId: string): Promise<MediaItem | undefined> {
  return dbGet<MediaItem>("media", mediaId);
}

export async function markUploaded(item: MediaItem, url: string): Promise<void> {
  await dbPut("media", { ...item, uploadedUrl: url });
}

export function fileExtension(mimeType: string): string {
  const subtype = (mimeType.split("/")[1] ?? "bin").split(";")[0];
  return subtype === "octet-stream" ? "bin" : subtype;
}
