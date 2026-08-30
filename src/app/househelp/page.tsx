import { redirect } from "next/navigation";

import { HousehelpCookMode } from "@/features/househelp/HousehelpCookMode";
import { getHousehelpActor } from "@/features/househelp/server/auth";
import { HousehelpAccessError, HousehelpRepository } from "@/features/househelp/server/repository";
import { getDatabaseHandle } from "@/server/db/client";

import styles from "./househelp.module.css";

export const dynamic = "force-dynamic";

export default async function HousehelpPage() {
  try {
    const actor = await getHousehelpActor();
    const repository = new HousehelpRepository(getDatabaseHandle().client);
    const data = repository.getVisible(actor);
    if (!data) {
      return (
        <main className={styles.unavailable}>
          <div className={styles.unavailableMark} aria-hidden="true">✓</div>
          <h1>No cooking task now</h1>
          <p>आज अभी खाना बनाने का कोई काम नहीं है।</p>
        </main>
      );
    }
    return <HousehelpCookMode initialData={data} />;
  } catch (error) {
    if (error instanceof HousehelpAccessError && error.status === 401) redirect("/");
    if (error instanceof HousehelpAccessError && error.status === 403) redirect("/workspace");
    return (
      <main className={styles.unavailable}>
        <div className={styles.unavailableMark} aria-hidden="true">!</div>
        <h1>This cooking task is unavailable</h1>
        <p>मदद के लिए घर के मालिक से पूछें।</p>
      </main>
    );
  }
}
