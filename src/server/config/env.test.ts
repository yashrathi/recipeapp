import { afterEach, describe, expect, it, vi } from "vitest";

import { getEnvironment, resetEnvironmentForTests } from "@/server/config/env";

describe("Firecrawl retention environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvironmentForTests();
  });

  it.each([
    ["", false],
    ["false", false],
    [" FALSE ", false],
    ["true", true],
    [" TRUE ", true],
  ] as const)("parses %j as %s", (input, expected) => {
    vi.stubEnv("FIRECRAWL_ZERO_DATA_RETENTION", input);
    resetEnvironmentForTests();
    expect(getEnvironment().FIRECRAWL_ZERO_DATA_RETENTION).toBe(expected);
  });

  it("rejects ambiguous boolean values", () => {
    vi.stubEnv("FIRECRAWL_ZERO_DATA_RETENTION", "yes");
    resetEnvironmentForTests();
    expect(() => getEnvironment()).toThrow();
  });
});
