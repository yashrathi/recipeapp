import { isDemoAuthEnabled } from "@/server/config/env";

export default function HomePage() {
  const showDemoRoles = isDemoAuthEnabled();

  return (
    <main className="page-shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Milestone 1 foundation</p>
        <h1 id="page-title">Household Recipe Assistant</h1>
        <p className="lede">
          Import or enter a recipe, review exact bilingual cooking guidance, and assign an
          immutable version to the household cook mode with server-enforced role boundaries.
        </p>
      </section>

      {showDemoRoles ? <section className="role-grid" aria-labelledby="demo-heading">
        <div className="section-heading">
          <p className="eyebrow">Local demo</p>
          <h2 id="demo-heading">Check the role boundary</h2>
          <p>These deterministic demo sessions are available only outside production.</p>
        </div>

        <article className="role-card">
          <span className="role-mark" aria-hidden="true">H</span>
          <h3>Homeowner</h3>
          <p>Planning, review, publishing, assignment and household authority.</p>
          <form action="/api/demo/session" method="post">
            <input type="hidden" name="role" value="homeowner" />
            <button type="submit">Enter homeowner shell</button>
          </form>
        </article>

        <article className="role-card">
          <span className="role-mark role-mark-help" aria-hidden="true">A</span>
          <h3>Househelp</h3>
          <p>Only assigned cooking work, progress and issue reporting.</p>
          <form action="/api/demo/session" method="post">
            <input type="hidden" name="role" value="househelp" />
            <button type="submit">Enter househelp shell</button>
          </form>
        </article>
      </section> : null}
    </main>
  );
}
