import { NextResponse } from "next/server";

import { getHousehelpActor } from "@/features/househelp/server/auth";
import { househelpErrorResponse } from "@/features/househelp/server/http";
import { HousehelpRepository } from "@/features/househelp/server/repository";
import { getDatabaseHandle } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const [{ assignmentId }, actor] = await Promise.all([context.params, getHousehelpActor()]);
    const repository = new HousehelpRepository(getDatabaseHandle().client);
    const data = repository.getVisible(actor, assignmentId);
    if (!data) return NextResponse.json({ error: "Cooking task not found." }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    return househelpErrorResponse(error);
  }
}
