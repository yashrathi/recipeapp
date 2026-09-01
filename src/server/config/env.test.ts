import { afterEach, describe, expect, it, vi } from "vitest";

import { getEnvironment, isDemoAuthEnabled, resetEnvironmentForTests } from "@/server/config/env";

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

  it("permits the seeded demo sessions for an explicitly enabled production preview", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PREVIEW_DEMO_AUTH", "true");
    resetEnvironmentForTests();
    expect(isDemoAuthEnabled()).toBe(true);
  });
});

describe("preview demo authentication environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvironmentForTests();
  });

  it.each([
    ["", false],
    ["false", false],
    [" TRUE ", true],
  ] as const)("parses %j as %s", (input, expected) => {
    vi.stubEnv("PREVIEW_DEMO_AUTH", input);
    resetEnvironmentForTests();
    expect(getEnvironment().PREVIEW_DEMO_AUTH).toBe(expected);
  });

  it("rejects ambiguous boolean values", () => {
    vi.stubEnv("PREVIEW_DEMO_AUTH", "yes");
    resetEnvironmentForTests();
    expect(() => getEnvironment()).toThrow();
  });
});
