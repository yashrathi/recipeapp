import { requireHomeownerActor } from "@/features/homeowner/server/auth";
import { homeownerErrorResponse } from "@/features/homeowner/server/http";
import { HomeownerStore } from "@/features/homeowner/server/store";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const [actor, { versionId }, body] = await Promise.all([
      requireHomeownerActor(),
      params,
      request.json() as Promise<{ confirmed?: unknown }>,
    ]);
    await new HomeownerStore().publishDraft(actor, versionId, body.confirmed === true);
    return Response.json({ published: true, versionId });
  } catch (error) {
    return homeownerErrorResponse(error);
  }
}
