import { getDatabaseHandle } from "@/server/db/client";
import { createImportHttpHandlers } from "@/server/import/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return createImportHttpHandlers(getDatabaseHandle().client).get(request, id);
}
