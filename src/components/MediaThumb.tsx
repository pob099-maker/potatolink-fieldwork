// A small look at something already stored on this device.
//
// The blob lives in IndexedDB, so the URL has to be made and given back. Not
// revoking it leaks the object for as long as the tab is open, which on a
// phone walking a trial is a whole afternoon of photographs.

import { useEffect, useState } from "react";
import { getMedia, isMediaPointer, mediaIdFromPointer } from "../services/media";

export function MediaThumb({ pointer }: { pointer: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [video, setVideo] = useState(false);

  useEffect(() => {
    // Once the blob has been uploaded the pointer is replaced by the public
    // URL, so a thumbnail that only understood "media:<id>" went blank the
    // moment the sync succeeded — which is to say, on every record that had
    // worked properly.
    // Checked before the pointer guard, which narrows its else branch to
    // never and would make this unreachable.
    if (pointer.startsWith("http")) {
      setUrl(pointer);
      setVideo(/\.(mp4|mov|webm|m4v)(\?|$)/i.test(pointer));
      return;
    }
    if (!isMediaPointer(pointer)) return;
    let live = true;
    let made: string | null = null;
    void getMedia(mediaIdFromPointer(pointer)).then((item) => {
      if (!live || !item) return;
      made = URL.createObjectURL(item.blob);
      setVideo(item.kind === "video");
      setUrl(made);
    });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [pointer]);

  if (!url) {
    return <span aria-hidden className="size-12 shrink-0 rounded bg-line" />;
  }

  return video ? (
    <video src={url} className="size-12 shrink-0 rounded object-cover" muted playsInline />
  ) : (
    <img src={url} alt="" className="size-12 shrink-0 rounded object-cover" />
  );
}
