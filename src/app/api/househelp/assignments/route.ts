import { NextResponse } from "next/server";

import { getHousehelpActor } from "@/features/househelp/server/auth";
import { househelpErrorResponse } from "@/features/househelp/server/http";
import { HousehelpRepository } from "@/features/househelp/server/repository";
import { getDatabaseHandle } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await getHousehelpActor();
    const repository = new HousehelpRepository(getDatabaseHandle().client);
    return NextResponse.json({
      assignments: repository.listVisible(actor),
      recipes: repository.listCookableRecipes(actor),
    });
  } catch (error) {
    return househelpErrorResponse(error);
  }
}
