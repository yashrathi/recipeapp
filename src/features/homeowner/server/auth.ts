import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { HouseholdActor } from "@/server/auth/policy";
import { assertHomeowner } from "@/features/homeowner/server/authorization";
import { SESSION_COOKIE_NAME, readSessionToken } from "@/server/auth/session";
import { getDatabaseHandle } from "@/server/db/client";
import { createSqliteRepositories } from "@/server/repositories/sqlite";

export class AuthenticationError extends Error {
  readonly code = "UNAUTHENTICATED";

  constructor() {
    super("Sign in to continue.");
    this.name = "AuthenticationError";
  }
}

export async function getAuthenticatedActor(): Promise<HouseholdActor> {
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) throw new AuthenticationError();

  const repositories = createSqliteRepositories(getDatabaseHandle().orm);
  const actor = await repositories.identities.findActor(session.userId, session.householdId);
  if (!actor || actor.membershipId !== session.membershipId || actor.role !== session.role) {
    throw new AuthenticationError();
  }
  return actor;
}

export async function requireHomeownerActor(): Promise<HouseholdActor & { role: "homeowner" }> {
  const actor = await getAuthenticatedActor();
  assertHomeowner(actor);
  return actor;
}

export async function requireHomeownerPage(): Promise<HouseholdActor & { role: "homeowner" }> {
  try {
    return await requireHomeownerActor();
  } catch {
    redirect("/");
  }
}
