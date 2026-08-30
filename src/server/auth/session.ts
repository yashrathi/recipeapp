import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { HouseholdRoleSchema, IdentifierSchema } from "@/domain/contracts";
import { getSessionSecret } from "@/server/config/env";

export const SESSION_COOKIE_NAME = "recipe_app_session";

const SessionPayloadSchema = z.object({
  userId: IdentifierSchema,
  householdId: IdentifierSchema,
  membershipId: IdentifierSchema,
  role: HouseholdRoleSchema,
  expiresAt: z.number().int().positive(),
});

export type SessionPayload = z.infer<typeof SessionPayloadSchema>;

function sign(value: string): string {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

export function createSessionToken(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(SessionPayloadSchema.parse(payload))).toString(
    "base64url",
  );
  return `${encoded}.${sign(encoded)}`;
}

export function readSessionToken(token: string | undefined, now = Date.now()): SessionPayload | null {
  if (!token) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;

  const expected = Buffer.from(sign(encoded));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const payload = SessionPayloadSchema.parse(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    );
    return payload.expiresAt > now ? payload : null;
  } catch {
    return null;
  }
}
