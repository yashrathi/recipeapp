import { NextResponse } from "next/server";

import { getHousehelpActor } from "@/features/househelp/server/auth";
import { HousehelpMutationSchema } from "@/features/househelp/server/contracts";
import { househelpErrorResponse } from "@/features/househelp/server/http";
import { HousehelpRepository } from "@/features/househelp/server/repository";
import { getDatabaseHandle } from "@/server/db/client";

export async function POST(
  request: Request,
  context: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const [{ assignmentId }, actor, payload] = await Promise.all([
      context.params,
      getHousehelpActor(),
      request.json().catch(() => null),
    ]);
    const mutation = HousehelpMutationSchema.safeParse(payload);
    if (!mutation.success) {
      return NextResponse.json(
        { error: "Invalid cooking progress update.", details: mutation.error.issues },
        { status: 400 },
      );
    }
    const repository = new HousehelpRepository(getDatabaseHandle().client);
    return NextResponse.json(repository.mutate(actor, assignmentId, mutation.data));
  } catch (error) {
    return househelpErrorResponse(error);
  }
}
