import { NextResponse } from "next/server";

import { requireHomeownerActor } from "@/features/homeowner/server/auth";
import { InstamartReadOnlyClient } from "@/features/instamart/server/client";
import { instamartErrorResponse } from "@/features/instamart/server/http";
import { isDemoAuthEnabled } from "@/server/config/env";

export async function POST(request: Request) {
  if (!isDemoAuthEnabled()) {
    return Response.json({ error: "The local Instamart price spike is disabled." }, { status: 404 });
  }
  try {
    const actor = await requireHomeownerActor();
    await new InstamartReadOnlyClient().disconnect(actor);
    return NextResponse.redirect(new URL("/homeowner/instamart-prices", request.url), 303);
  } catch (error) {
    return instamartErrorResponse(error);
  }
}

