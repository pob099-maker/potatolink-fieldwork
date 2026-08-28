import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_PREFIX,
  attachmentLabel,
  isAttachment,
  isAttachmentName,
  nextAttachmentName,
} from "./attachments";
import { makeFieldName } from "./templates";

// The reserved name is load-bearing. updateEntry deletes any metric whose name
// the form no longer asks for — right for a question that was removed, and
// catastrophic for a photograph nobody asked for in the first place.

const named = (metricName: string) => ({ metricName });

describe("telling an attachment from an answer", () => {
  it("recognises one", () => {
    expect(isAttachmentName("extra:1")).toBe(true);
    expect(isAttachment(named("extra:12"))).toBe(true);
  });

  it("does not mistake a field for one", () => {
    expect(isAttachmentName("harvestedWeight")).toBe(false);
    expect(isAttachmentName("extraNotes")).toBe(false);
  });

  it("cannot collide with a generated field name", () => {
    // Field names come from labels via makeFieldName, which strips anything
    // that is not alphanumeric — so a colon can never appear in one, and the
    // prefix is impossible to hit by accident rather than merely unlikely.
    for (const label of ["extra: one", "Extra:1", "extra 1", "EXTRA:1", "extra:1"]) {
      expect(makeFieldName(label, []).startsWith(ATTACHMENT_PREFIX)).toBe(false);
    }
  });
});

describe("naming the next one", () => {
  it("starts at one", () => {
    expect(nextAttachmentName([])).toBe("extra:1");
  });

  it("counts past what is there", () => {
    expect(nextAttachmentName([named("extra:1"), named("extra:2")])).toBe("extra:3");
  });

  it("ignores the form's own answers", () => {
    expect(nextAttachmentName([named("weight"), named("notes")])).toBe("extra:1");
  });

  it("fills a gap rather than reusing a name still in use", () => {
    // Remove the second of three, add another: reusing "extra:2" is correct
    // and reusing "extra:3" would collide.
    expect(nextAttachmentName([named("extra:1"), named("extra:3")])).toBe("extra:2");
  });
});

describe("what it is called on screen", () => {
  it("does not show the internal name", () => {
    // "extra:2" is not a caption.
    expect(attachmentLabel("extra:2", 2)).toBe("Attachment 2");
  });

  it("leaves a real field name alone", () => {
    expect(attachmentLabel("harvestedWeight", 1)).toBe("harvestedWeight");
  });
});
