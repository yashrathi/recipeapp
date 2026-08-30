import { describe, expect, it } from "vitest";

import { ImportPipelineError } from "@/domain/import/types";
import { parsePublicImportSource } from "@/server/import/source";

describe("parsePublicImportSource", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?t=15",
    "https://youtube.com/shorts/dQw4w9WgXcQ",
  ])("canonicalizes one YouTube video: %s", (input) => {
    expect(parsePublicImportSource(input)).toEqual({
      type: "youtube",
      videoId: "dQw4w9WgXcQ",
      normalizedUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });

  it("keeps ordinary webpages on the web path", () => {
    expect(parsePublicImportSource("https://pinchofyum.com/recipe")).toEqual({
      type: "web",
      normalizedUrl: "https://pinchofyum.com/recipe",
    });
  });

  it.each([
    "https://youtube.com/watch?v=dQw4w9WgXcQ&list=playlist",
    "https://youtube.com/@channel",
    "https://youtu.be/not-an-id",
  ])("rejects unsupported YouTube URLs: %s", (input) => {
    expect(() => parsePublicImportSource(input)).toThrowError(ImportPipelineError);
    try { parsePublicImportSource(input); } catch (error) {
      expect((error as ImportPipelineError).failure.code).toBe("YOUTUBE_URL_UNSUPPORTED");
    }
  });
});
