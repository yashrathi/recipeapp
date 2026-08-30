import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { InstamartReadOnlyClient } from "@/features/instamart/server/client";
import { SESSION_COOKIE_NAME, readSessionToken } from "@/server/auth/session";

export async function POST() {
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (session) await new InstamartReadOnlyClient().disconnect(session);

  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: "/" },
  });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
