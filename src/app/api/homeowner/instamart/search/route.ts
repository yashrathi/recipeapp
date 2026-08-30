import { requireHomeownerActor } from "@/features/homeowner/server/auth";
import { instamartErrorResponse, noStoreJson } from "@/features/instamart/server/http";
import { InstamartPriceService } from "@/features/instamart/server/service";
import { isDemoAuthEnabled } from "@/server/config/env";

export async function POST(request: Request) {
  if (!isDemoAuthEnabled()) {
    return noStoreJson({ error: "The local Instamart price spike is disabled." }, { status: 404 });
  }
  try {
    const actor = await requireHomeownerActor();
    return noStoreJson(await new InstamartPriceService().search(actor, await request.json()));
  } catch (error) {
    return instamartErrorResponse(error);
  }
}

