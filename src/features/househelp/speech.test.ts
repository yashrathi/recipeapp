import { describe, expect, it } from "vitest";

import { SerializedSpeechQueue, type SpeechAdapter } from "./speech";
import type { SpeechToken } from "./types";

const token: SpeechToken = {
  assignmentId: "assignment-1",
  recipeVersionId: "recipe-v1",
  locale: "en-IN",
  screenInstanceId: 2,
  generation: 3,
};

describe("serialized speech queue", () => {
  it("never overlaps ordinary utterances", async () => {
    let active = 0;
    let maximumActive = 0;
    const spoken: string[] = [];
    const adapter: SpeechAdapter = {
      cancel() {},
      probe: async () => true,
      alarm: async () => undefined,
      speak: async (text) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await Promise.resolve();
        spoken.push(text);
        active -= 1;
      },
    };
    const queue = new SerializedSpeechQueue(adapter);
    await expect(queue.play([
      { locale: "en-IN", text: "Next." },
      { locale: "en-IN", text: "Step two." },
    ], token, () => true)).resolves.toBe("completed");
    expect(spoken).toEqual(["Next.", "Step two."]);
    expect(maximumActive).toBe(1);
  });

  it("drops remaining segments when the generation token becomes stale", async () => {
    let current = true;
    const spoken: string[] = [];
    const adapter: SpeechAdapter = {
      cancel() {},
      probe: async () => true,
      alarm: async () => undefined,
      speak: async (text) => {
        spoken.push(text);
        current = false;
      },
    };
    const queue = new SerializedSpeechQueue(adapter);
    await expect(queue.play([
      { locale: "en-IN", text: "Old instruction." },
      { locale: "en-IN", text: "Deferred timer start." },
    ], token, () => current)).resolves.toBe("dropped");
    expect(spoken).toEqual(["Old instruction."]);
  });
});
