import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE_NAME, readSessionToken } from "@/server/auth/session";
import { getDatabaseHandle } from "@/server/db/client";
import { createSqliteRepositories } from "@/server/repositories/sqlite";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) redirect("/");

  const repositories = createSqliteRepositories(getDatabaseHandle().orm);
  const actor = await repositories.identities.findActor(session.userId, session.householdId);
  if (!actor || actor.membershipId !== session.membershipId || actor.role !== session.role) {
    redirect("/");
  }
  redirect(actor.role === "homeowner" ? "/homeowner" : "/househelp");
}
