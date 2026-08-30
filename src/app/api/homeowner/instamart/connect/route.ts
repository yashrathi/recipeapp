import { NextResponse } from "next/server";

import { requireHomeownerActor } from "@/features/homeowner/server/auth";
import { instamartErrorResponse } from "@/features/instamart/server/http";
import { SwiggyOAuthService } from "@/features/instamart/server/oauth";
import { isDemoAuthEnabled } from "@/server/config/env";

function localCallbackUrl(request: Request): string {
  const requestUrl = new URL(request.url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(requestUrl.hostname)) {
    throw new Error("The Instamart price spike is restricted to localhost.");
  }
  return new URL("/api/homeowner/instamart/callback", requestUrl.origin).toString();
}

export async function POST(request: Request) {
  if (!isDemoAuthEnabled()) {
    return Response.json({ error: "The local Instamart price spike is disabled." }, { status: 404 });
  }
  try {
    const actor = await requireHomeownerActor();
    const authorizationUrl = await new SwiggyOAuthService().begin(actor, localCallbackUrl(request));
    return NextResponse.redirect(authorizationUrl, 303);
  } catch (error) {
    return instamartErrorResponse(error);
  }
}

