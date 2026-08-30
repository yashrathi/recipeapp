import { NextResponse } from "next/server";

import { requireHomeownerActor } from "@/features/homeowner/server/auth";
import { SwiggyOAuthService } from "@/features/instamart/server/oauth";
import { isDemoAuthEnabled } from "@/server/config/env";

function pricePage(request: Request, result: "connected" | "failed"): URL {
  return new URL(`/homeowner/instamart-prices?connection=${result}`, request.url);
}

export async function GET(request: Request) {
  if (!isDemoAuthEnabled()) {
    return Response.json({ error: "The local Instamart price spike is disabled." }, { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  if (params.has("error") || !state || !code) {
    return NextResponse.redirect(pricePage(request, "failed"), 303);
  }

  try {
    const actor = await requireHomeownerActor();
    await new SwiggyOAuthService().complete(actor, state, code);
    return NextResponse.redirect(pricePage(request, "connected"), 303);
  } catch {
    return NextResponse.redirect(pricePage(request, "failed"), 303);
  }
}

