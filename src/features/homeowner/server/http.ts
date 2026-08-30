import { ZodError } from "zod";

import { AuthorizationError } from "@/server/auth/policy";
import { AuthenticationError } from "@/features/homeowner/server/auth";
import { HomeownerValidationError } from "@/features/homeowner/server/store";

export function homeownerErrorResponse(error: unknown): Response {
  if (error instanceof AuthenticationError) {
    return Response.json({ error: error.message, code: error.code }, { status: 401 });
  }
  if (error instanceof AuthorizationError) {
    return Response.json({ error: error.message, code: error.code }, { status: 403 });
  }
  if (error instanceof HomeownerValidationError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: error.issues[0]?.message ?? "Check the submitted fields.", code: "INVALID_INPUT" },
      { status: 400 },
    );
  }
  console.error("Homeowner request failed", error);
  return Response.json(
    { error: "The request could not be completed. Try again.", code: "HOMEOWNER_REQUEST_FAILED" },
    { status: 500 },
  );
}
