import Link from "next/link";

import { requireHomeownerPage } from "@/features/homeowner/server/auth";
import { HomeownerStore } from "@/features/homeowner/server/store";
import styles from "./homeowner.module.css";

function mealLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default async function HomeownerDashboardPage() {
  const actor = await requireHomeownerPage();
  const dashboard = await new HomeownerStore().getDashboard(actor);

  return (
    <>
      <section className={styles.dashboardHero} aria-labelledby="homeowner-heading">
        <div>
          <p className={styles.eyebrow}>{dashboard.householdName} · homeowner</p>
          <h1 id="homeowner-heading">Good day, {dashboard.homeownerName.split(" ")[0]}</h1>
          <p>Turn a public source into one reviewed, spoken-ready cooking plan.</p>
        </div>
        <Link className={styles.primaryLink} href="/homeowner/recipes/new">Add a recipe</Link>
      </section>

      <section className={styles.metricsGrid} aria-label="Household overview">
        <article className={styles.metricCard}><strong>{dashboard.assignments.length}</strong><span>planned meals</span></article>
        <article className={styles.metricCard}><strong>{dashboard.imports.length}</strong><span>recent imports</span></article>
        <article className={styles.metricCard}><strong>{dashboard.issues.length}</strong><span>items needing attention</span></article>
      </section>

      <div className={styles.contentGrid}>
        <section className={styles.panel} aria-labelledby="today-heading">
          <div className={styles.sectionTitleRow}>
            <div><p className={styles.eyebrow}>Household plan</p><h2 id="today-heading">Current assignments</h2></div>
          </div>
          {dashboard.assignments.length ? (
            <div className={styles.cardStack}>
              {dashboard.assignments.map((assignment) => (
                <article className={styles.assignmentCard} key={assignment.id}>
                  <div>
                    <p className={styles.cardKicker}>{assignment.scheduledDate} · {mealLabel(assignment.mealSlot)}{assignment.targetTime ? ` · ${assignment.targetTime}` : ""}</p>
                    <h3>{assignment.title}</h3>
                    <p>{assignment.assigneeName} · {assignment.targetServings} servings · {assignment.selectedLocale}</p>
                  </div>
                  <span className={styles.statusBadge}>{assignment.status.replaceAll("_", " ")}</span>
                </article>
              ))}
            </div>
          ) : <p className={styles.emptyState}>No meals assigned yet. Publish a recipe to schedule the first one.</p>}
        </section>

        <aside className={styles.sideStack}>
          <section className={styles.panel} aria-labelledby="issues-heading">
            <p className={styles.eyebrow}>Review queue</p>
            <h2 id="issues-heading">Issues</h2>
            {dashboard.issues.length ? (
              <ul className={styles.issueList}>
                {dashboard.issues.map((issue) => (
                  <li key={issue.id}>
                    <strong>{issue.title}</strong><span>{issue.detail}</span>
                    {issue.href ? <Link href={issue.href}>Review</Link> : null}
                  </li>
                ))}
              </ul>
            ) : <p className={styles.emptyState}>No blocked work or import warnings.</p>}
          </section>

          <section className={styles.inviteCard} aria-labelledby="invite-heading">
            <p className={styles.eyebrow}>Household access</p>
            <h2 id="invite-heading">Shared-device invite</h2>
            {dashboard.househelp[0] ? (
              <>
                <p><strong>{dashboard.househelp[0].name}</strong> · {dashboard.househelp[0].spokenLocale}</p>
                <div className={styles.pinRow}><span>Demo PIN</span><code>2468</code></div>
                <p className={styles.safeNote}>This deterministic local PIN demonstrates the role-bound device flow. It is not a production OTP or identity service.</p>
              </>
            ) : <p>No househelp member has been added.</p>}
          </section>
        </aside>
      </div>

      <section className={styles.panel} aria-labelledby="imports-heading">
        <div className={styles.sectionTitleRow}>
          <div><p className={styles.eyebrow}>Source activity</p><h2 id="imports-heading">Recent imports</h2></div>
          <Link className={styles.textLink} href="/homeowner/recipes/new">Import another</Link>
        </div>
        {dashboard.imports.length ? (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Source</th><th>Stage</th><th>Review state</th><th><span className={styles.srOnly}>Action</span></th></tr></thead>
              <tbody>
                {dashboard.imports.map((item) => (
                  <tr key={item.id}>
                    <td>{item.sourceTitle}</td>
                    <td>{item.stage.replaceAll("_", " ")}</td>
                    <td>{item.status === "failed" ? item.errorCode ?? "Failed safely" : `${item.warningCount} warnings`}</td>
                    <td>{item.versionId ? (
                      item.reviewStatus === "published"
                        ? <Link href={`/homeowner/recipes/${item.versionId}`}>Open recipe</Link>
                        : <Link href={`/homeowner/recipes/${item.versionId}/review`}>Open draft</Link>
                    ) : <Link href={`/homeowner/imports/${item.id}`}>View import</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className={styles.emptyState}>No webpage imports yet. Manual recipes remain available if a source fails.</p>}
      </section>
    </>
  );
}
