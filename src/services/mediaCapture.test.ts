import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// The camera stays the phone's own — accept and capture hand off to it rather
// than opening a viewfinder in the page, because the native camera brings HDR,
// scene detection and autofocus that a raw getUserMedia frame does not, and a
// trial photograph is taken in harsh light on close detail where that shows.
//
// Which makes these two attributes the whole mechanism. Lose either and the
// button silently becomes a file browser: still clickable, still saves
// something, no longer offers the camera at all. Nothing else in the app would
// notice, so this checks the source directly.

const fields = readFileSync("src/components/fields.tsx", "utf-8");
const attachments = readFileSync("src/components/Attachments.tsx", "utf-8");

describe("the camera is offered, not a file browser", () => {
  it("asks a phone for the rear camera on the form's own media field", () => {
    expect(fields).toContain('capture={kind === "file" ? undefined : "environment"}');
  });

  it("narrows to images or video so the right camera opens", () => {
    expect(fields).toContain('accept={kind === "video" ? "video/*" : kind === "photo" ? "image/*" : undefined}');
  });

  it("does the same for an attachment added after saving", () => {
    // Two inputs on purpose: one accept and capture pair cannot serve both.
    expect(attachments).toContain('accept="image/*"');
    expect(attachments).toContain('accept="video/*"');
    expect(attachments.match(/capture="environment"/g)?.length).toBe(2);
  });

  it("leaves a plain file attachment without capture, so it browses", () => {
    // A soil report is a PDF on the phone, not something to photograph.
    expect(fields).toContain('kind === "file" ? undefined : "environment"');
  });

  it("keeps the visible control a button, with the input only reachable through it", () => {
    // The input is off-screen rather than display:none — hidden that way it
    // would not be clickable at all, and the button would do nothing.
    expect(fields).toContain('className="sr-only"');
    expect(attachments).toContain('className="sr-only"');
  });

  it("does not open a camera in the page", () => {
    // If this ever changes it should be a decision, not a drift.
    expect(fields).not.toContain("getUserMedia");
    expect(attachments).not.toContain("getUserMedia");
  });
});

describe("taking a photograph off again", () => {
  // Replace was the only way out, which is no way out at all for one taken by
  // accident in a pocket: the choice was another wrong photograph, or a wrong
  // one left in place. On an optional field there was no route back to empty.
  it("offers Remove on the form's own media field", () => {
    expect(fields).toContain('aria-label={`Remove this ${kind}`}');
  });

  it("only offers it once there is something to remove", () => {
    // Otherwise it sits on screen as a control with nothing to do.
    expect(fields).toContain("{hasMedia ? (");
  });

  it("clears the input's value as well as the answer", () => {
    // The input keeps the old filename otherwise, so choosing the same
    // picture again fires no change event and looks broken.
    expect(fields).toContain('if (fileRef.current) fileRef.current.value = "";');
  });

  it("revokes the preview URL rather than leaking it", () => {
    // A phone walking a trial is an afternoon of these.
    expect(fields).toContain("URL.revokeObjectURL(previewUrl)");
  });
});
