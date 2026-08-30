import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/server/auth/session";

export async function POST() {
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: "/" },
  });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
