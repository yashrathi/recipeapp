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
  const assignments = await repositories.assignments.listVisibleTo(actor);
  const isHomeowner = actor.role === "homeowner";

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Demo household</p>
          <h1>{isHomeowner ? "Homeowner workspace" : "Househelp workspace"}</h1>
        </div>
        <form action="/api/session/logout" method="post">
          <button className="secondary-button" type="submit">Exit demo</button>
        </form>
      </header>

      <section className="status-panel" aria-labelledby="status-heading">
        <span className="status-dot" aria-hidden="true" />
        <div>
          <h2 id="status-heading">Role boundary active</h2>
          <p>
            Your signed session was checked against an active household membership on the server.
          </p>
        </div>
      </section>

      <section className="workspace-grid" aria-label="Foundation capabilities">
        <article className="workspace-card">
          <p className="card-kicker">Visible assignments</p>
          <p className="metric">{assignments.length}</p>
          <p>
            {isHomeowner
              ? "Homeowners may view household assignments."
              : "Househelp may view only work assigned directly to them."}
          </p>
        </article>
        <article className="workspace-card">
          <p className="card-kicker">Current scope</p>
          <h2>Foundation only</h2>
          <p>
            The import, review and audio-first cooking interfaces are intentionally reserved for
            their feature slices.
          </p>
        </article>
      </section>
    </main>
  );
}
