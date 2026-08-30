import { requireHomeownerActor } from "@/features/homeowner/server/auth";
import { instamartErrorResponse, noStoreJson } from "@/features/instamart/server/http";
import { instamartRegistry } from "@/features/instamart/server/registry";
import { isDemoAuthEnabled } from "@/server/config/env";

export async function GET() {
  if (!isDemoAuthEnabled()) {
    return noStoreJson({ error: "The local Instamart price spike is disabled." }, { status: 404 });
  }
  try {
    const actor = await requireHomeownerActor();
    const token = instamartRegistry.getActiveToken(actor);
    return noStoreJson({ connected: Boolean(token), expiresAt: token?.expiresAt ?? null });
  } catch (error) {
    return instamartErrorResponse(error);
  }
}

