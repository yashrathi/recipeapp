import { z } from "zod";

import { requireHomeownerActor } from "@/features/homeowner/server/auth";
import { instamartErrorResponse, noStoreJson } from "@/features/instamart/server/http";
import { InstamartPriceService } from "@/features/instamart/server/service";
import { isDemoAuthEnabled } from "@/server/config/env";

const PageSchema = z.coerce.number().int().positive().max(100).default(1);

export async function GET(request: Request) {
  if (!isDemoAuthEnabled()) {
    return noStoreJson({ error: "The local Instamart price spike is disabled." }, { status: 404 });
  }
  try {
    const actor = await requireHomeownerActor();
    const page = PageSchema.parse(new URL(request.url).searchParams.get("page") ?? undefined);
    return noStoreJson(await new InstamartPriceService().listAddresses(actor, page));
  } catch (error) {
    return instamartErrorResponse(error);
  }
}

