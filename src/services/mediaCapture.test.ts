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
