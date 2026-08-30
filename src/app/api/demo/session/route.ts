import { NextResponse } from "next/server";

import { HouseholdRoleSchema } from "@/domain/contracts";
import { SESSION_COOKIE_NAME, createSessionToken } from "@/server/auth/session";
import { isDemoAuthEnabled } from "@/server/config/env";
import { DEMO_IDS } from "@/server/db/seed";

export async function POST(request: Request) {
  if (!isDemoAuthEnabled()) {
    return NextResponse.json({ error: "Demo authentication is disabled." }, { status: 404 });
  }

  const formData = await request.formData();
  const role = HouseholdRoleSchema.safeParse(formData.get("role"));
  if (!role.success) {
    return NextResponse.json({ error: "Invalid demo role." }, { status: 400 });
  }

  const isHomeowner = role.data === "homeowner";
  const token = createSessionToken({
    userId: isHomeowner ? DEMO_IDS.homeowner : DEMO_IDS.househelp,
    householdId: DEMO_IDS.household,
    membershipId: isHomeowner
      ? DEMO_IDS.homeownerMembership
      : DEMO_IDS.househelpMembership,
    role: role.data,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
  });

  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: "/workspace" },
  });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 8 * 60 * 60,
  });

  return response;
}
