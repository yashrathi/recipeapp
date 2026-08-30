import Link from "next/link";

import { ImportProgress } from "@/features/homeowner/components/import-progress";
import { requireHomeownerPage } from "@/features/homeowner/server/auth";
import styles from "../../homeowner.module.css";

export default async function ImportProgressPage({ params }: { params: Promise<{ jobId: string }> }) {
  await requireHomeownerPage();
  const { jobId } = await params;
  return (
    <div className={styles.narrowPage}>
      <Link className={styles.breadcrumb} href="/homeowner">← Today</Link>
      <ImportProgress jobId={jobId} />
    </div>
  );
}
