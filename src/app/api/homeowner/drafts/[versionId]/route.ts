import { requireHomeownerActor } from "@/features/homeowner/server/auth";
import { homeownerErrorResponse } from "@/features/homeowner/server/http";
import { HomeownerStore } from "@/features/homeowner/server/store";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const [actor, { versionId }, input] = await Promise.all([
      requireHomeownerActor(),
      params,
      request.json(),
    ]);
    await new HomeownerStore().updateDraft(actor, versionId, input);
    return Response.json({ saved: true });
  } catch (error) {
    return homeownerErrorResponse(error);
  }
}
