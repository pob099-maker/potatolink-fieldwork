import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { getMedia, isMediaPointer, mediaIdFromPointer, saveMedia } from "./media";

function makeFile(bytes: number, name: string, type: string): File {
  return new File([new ArrayBuffer(bytes)], name, { type });
}

describe("saveMedia", () => {
  it("stores a photo and returns a media pointer", async () => {
    const result = await saveMedia(makeFile(1024, "run.jpg", "image/jpeg"), "photo");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(isMediaPointer(result.data)).toBe(true);

    const item = await getMedia(mediaIdFromPointer(result.data));
    expect(item?.kind).toBe("photo");
    expect(item?.mimeType).toBe("image/jpeg");
    expect(item?.uploadedUrl).toBeNull();
  });

  it("rejects an oversized photo with a plain-language message", async () => {
    const result = await saveMedia(
      makeFile(21 * 1024 * 1024, "huge.jpg", "image/jpeg"),
      "photo",
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("20 MB");
  });

  it("allows videos up to 100 MB but not beyond", async () => {
    const okay = await saveMedia(makeFile(5 * 1024 * 1024, "run.mp4", "video/mp4"), "video");
    expect(okay.success).toBe(true);

    const tooBig = await saveMedia(
      makeFile(101 * 1024 * 1024, "long.mp4", "video/mp4"),
      "video",
    );
    expect(tooBig.success).toBe(false);
  });

  it("allows attachments up to 25 MB but not beyond", async () => {
    const okay = await saveMedia(makeFile(1024, "export.csv", "text/csv"), "file");
    expect(okay.success).toBe(true);

    const tooBig = await saveMedia(makeFile(26 * 1024 * 1024, "big.csv", "text/csv"), "file");
    expect(tooBig.success).toBe(false);
    if (tooBig.success) return;
    expect(tooBig.error).toContain("25 MB");
  });

  it("rejects empty files", async () => {
    const result = await saveMedia(makeFile(0, "empty.jpg", "image/jpeg"), "photo");
    expect(result.success).toBe(false);
  });
});
