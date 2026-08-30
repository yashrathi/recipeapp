import { NextResponse } from "next/server";

import { getHousehelpActor } from "@/features/househelp/server/auth";
import { HousehelpAdHocStartSchema } from "@/features/househelp/server/contracts";
import { househelpErrorResponse } from "@/features/househelp/server/http";
import { HousehelpRepository } from "@/features/househelp/server/repository";
import { getDatabaseHandle } from "@/server/db/client";

export async function POST(
  request: Request,
  context: { params: Promise<{ recipeVersionId: string }> },
) {
  try {
    const [{ recipeVersionId }, actor, payload] = await Promise.all([
      context.params,
      getHousehelpActor(),
      request.json().catch(() => null),
    ]);
    const input = HousehelpAdHocStartSchema.safeParse(payload);
    if (!input.success) {
      return NextResponse.json({ error: "Choose a supported spoken language." }, { status: 400 });
    }
    const repository = new HousehelpRepository(getDatabaseHandle().client);
    return NextResponse.json(
      repository.startAdHocCooking(actor, recipeVersionId, input.data.locale),
      { status: 201 },
    );
  } catch (error) {
    return househelpErrorResponse(error);
  }
}
