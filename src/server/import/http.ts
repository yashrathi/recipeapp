import type Database from "better-sqlite3";
import { z } from "zod";

import { ImportPipelineError } from "@/domain/import/types";
import { authorize, AuthorizationError, type HouseholdActor } from "@/server/auth/policy";
import { SESSION_COOKIE_NAME, readSessionToken } from "@/server/auth/session";
import { WebRecipeImportPipeline } from "@/server/import/pipeline";
import { ImportRepository } from "@/server/import/repository";
import { ImportService } from "@/server/import/service";

const ImportRequestSchema = z.object({
  url: z.string().min(1).max(4_096),
  idempotencyKey: z.string().min(1).max(200).optional(),
});

function jsonError(
  status: number,
  code: string,
  message: string,
  details?: { stage?: string; retryable?: boolean },
): Response {
  return Response.json(
    { error: { code, message, ...(details?.stage ? { stage: details.stage } : {}), ...(details?.retryable === undefined ? {} : { retryable: details.retryable }) } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function cookieValue(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function authenticate(request: Request, client: Database.Database): HouseholdActor | null {
  const token = cookieValue(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  const session = readSessionToken(token);
  if (!session) return null;
  const membership = client
    .prepare(
      `SELECT id, user_id, household_id, role FROM memberships
       WHERE id = ? AND user_id = ? AND household_id = ? AND role = ? AND status = 'active'`,
    )
    .get(
      session.membershipId,
      session.userId,
      session.householdId,
      session.role,
    ) as { id: string; user_id: string; household_id: string; role: "homeowner" | "househelp" } | undefined;
  return membership
    ? {
        membershipId: membership.id,
        userId: membership.user_id,
        householdId: membership.household_id,
        role: membership.role,
      }
    : null;
}

export function createImportHttpHandlers(
  client: Database.Database,
  service = new ImportService(new ImportRepository(client), new WebRecipeImportPipeline()),
) {
  return {
    async post(request: Request): Promise<Response> {
      const actor = authenticate(request, client);
      if (!actor) return jsonError(401, "AUTHENTICATION_REQUIRED", "Sign in to import a recipe.");
      try {
        authorize(actor, "recipe:import", { householdId: actor.householdId });
      } catch (error) {
        if (error instanceof AuthorizationError) {
          return jsonError(403, error.code, error.message);
        }
        throw error;
      }

      const contentLength = Number(request.headers.get("content-length") ?? 0);
      if (contentLength > 16 * 1024) {
        return jsonError(400, "REQUEST_INVALID", "The import request is invalid.");
      }
      let parsed: z.infer<typeof ImportRequestSchema>;
      try {
        const text = await request.text();
        if (Buffer.byteLength(text, "utf8") > 16 * 1024) throw new Error("Body too large");
        parsed = ImportRequestSchema.parse(JSON.parse(text));
      } catch {
        return jsonError(400, "REQUEST_INVALID", "The import request is invalid.");
      }
      const idempotencyKey = request.headers.get("idempotency-key") ?? parsed.idempotencyKey;
      if (!idempotencyKey || idempotencyKey.length > 200) {
        return jsonError(400, "IDEMPOTENCY_KEY_REQUIRED", "Provide an idempotency key for this import.");
      }

      try {
        const output = await service.start(
          actor,
          { url: parsed.url, idempotencyKey },
          request.signal,
        );
        return Response.json(
          { data: output.record, reused: output.reused },
          { status: output.reused ? 200 : 201, headers: { "Cache-Control": "no-store" } },
        );
      } catch (error) {
        if (error instanceof ImportPipelineError) {
          return jsonError(
            error.failure.code === "IDEMPOTENCY_CONFLICT" ? 409 : 400,
            error.failure.code,
            error.failure.message,
            { stage: error.failure.stage, retryable: error.failure.retryable },
          );
        }
        return jsonError(500, "IMPORT_INTERNAL_ERROR", "The recipe could not be imported because of an internal error.", {
          stage: "any",
          retryable: true,
        });
      }
    },

    async get(request: Request, id: string): Promise<Response> {
      const actor = authenticate(request, client);
      if (!actor) return jsonError(401, "AUTHENTICATION_REQUIRED", "Sign in to view this import.");
      try {
        authorize(actor, "recipe:import", { householdId: actor.householdId });
      } catch (error) {
        if (error instanceof AuthorizationError) return jsonError(403, error.code, error.message);
        throw error;
      }
      const record = service.get(actor, id);
      if (!record) return jsonError(404, "IMPORT_NOT_FOUND", "This import was not found in your household.");
      return Response.json(
        { data: record },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    },
  };
}
