import { getDatabaseHandle } from "@/server/db/client";
import { createImportHttpHandlers } from "@/server/import/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return createImportHttpHandlers(getDatabaseHandle().client).post(request);
}
