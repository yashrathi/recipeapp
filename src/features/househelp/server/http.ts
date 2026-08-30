import { NextResponse } from "next/server";

import { HousehelpAccessError } from "./repository";

export function househelpErrorResponse(error: unknown): NextResponse {
  if (error instanceof HousehelpAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: "The cooking task could not be updated." }, { status: 500 });
}
