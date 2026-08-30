import { describe, expect, it } from "vitest";

import { createSessionToken, readSessionToken } from "./session";

const session = {
  userId: "homeowner-1",
  householdId: "household-1",
  membershipId: "membership-1",
  role: "homeowner" as const,
  expiresAt: 2_000,
};

describe("signed sessions", () => {
  it("round-trips an unexpired role-bound payload", () => {
    const token = createSessionToken(session);
    expect(readSessionToken(token, 1_000)).toEqual(session);
  });

  it("rejects expired sessions", () => {
    expect(readSessionToken(createSessionToken(session), 2_001)).toBeNull();
  });

  it("rejects tampered payloads and signatures", () => {
    const token = createSessionToken(session);
    const [payload, signature] = token.split(".");
    expect(readSessionToken(`${payload}x.${signature}`, 1_000)).toBeNull();
    expect(readSessionToken(`${payload}.${signature}x`, 1_000)).toBeNull();
  });
});
