import { requireHomeownerActor } from "@/features/homeowner/server/auth";
import { homeownerErrorResponse } from "@/features/homeowner/server/http";
import { HomeownerStore } from "@/features/homeowner/server/store";

export async function POST(request: Request) {
  try {
    const actor = await requireHomeownerActor();
    const assignment = await new HomeownerStore().createAssignment(actor, await request.json());
    return Response.json(assignment, { status: 201 });
  } catch (error) {
    return homeownerErrorResponse(error);
  }
}
