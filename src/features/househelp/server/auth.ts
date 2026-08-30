import { cookies } from "next/headers";

import type { HouseholdActor } from "@/server/auth/policy";
import { SESSION_COOKIE_NAME, readSessionToken } from "@/server/auth/session";
import { getDatabaseHandle } from "@/server/db/client";
import { createSqliteRepositories } from "@/server/repositories/sqlite";

import { HousehelpAccessError } from "./repository";

export async function getHousehelpActor(): Promise<HouseholdActor> {
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) throw new HousehelpAccessError(401, "Sign in is required.");

  const repositories = createSqliteRepositories(getDatabaseHandle().orm);
  const actor = await repositories.identities.findActor(session.userId, session.householdId);
  if (!actor || actor.membershipId !== session.membershipId || actor.role !== session.role) {
    throw new HousehelpAccessError(401, "The household session is no longer active.");
  }
  if (actor.role !== "househelp") {
    throw new HousehelpAccessError(403, "Househelp access required.");
  }
  return actor;
}
