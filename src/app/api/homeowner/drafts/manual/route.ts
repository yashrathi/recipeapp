import { HomeownerStore } from "@/features/homeowner/server/store";
import { requireHomeownerActor } from "@/features/homeowner/server/auth";
import { homeownerErrorResponse } from "@/features/homeowner/server/http";

export async function POST(request: Request) {
  try {
    const actor = await requireHomeownerActor();
    const versionId = await new HomeownerStore().createManualDraft(actor, await request.json());
    return Response.json({ versionId }, { status: 201 });
  } catch (error) {
    return homeownerErrorResponse(error);
  }
}
