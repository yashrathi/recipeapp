import { describe, expect, it } from "vitest";
import { isolateTranscript } from "@/server/import/transcript";

describe("isolateTranscript", () => {
  it("isolates transcript and preserves real timestamps", () => {
    const result = isolateTranscript("# Video\n\n## Transcript\n[00:12] Add two eggs.\n01:03 Mix well.\n\n## Links\nnope");
    expect(result).toMatchObject({
      hasTimestamps: true,
      lines: [
        { locator: "transcript:line:1", text: "Add two eggs.", startSeconds: 12 },
        { locator: "transcript:line:2", text: "Mix well.", startSeconds: 63 },
      ],
    });
  });

  it("keeps untimed transcript lines untimed", () => {
    expect(isolateTranscript("## Transcript\nAdd salt.\nStir."))?.toMatchObject({ hasTimestamps: false });
    expect(isolateTranscript("## Transcript\nAdd salt.")?.lines[0]).not.toHaveProperty("startSeconds");
  });

  it("rejects missing or empty transcript evidence", () => {
    expect(isolateTranscript("# Video\nNo captions")).toBeNull();
    expect(isolateTranscript("## Transcript\n\n## Links")).toBeNull();
  });
});
