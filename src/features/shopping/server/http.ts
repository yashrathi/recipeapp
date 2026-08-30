import { ZodError } from "zod";

import { AuthenticationError } from "@/features/homeowner/server/auth";
import { ShoppingListError } from "@/features/shopping/server/errors";
import { AuthorizationError } from "@/server/auth/policy";

export function shoppingListErrorResponse(error: unknown): Response {
  if (error instanceof AuthenticationError) {
    return Response.json({ error: error.message, code: error.code }, { status: 401 });
  }
  if (error instanceof AuthorizationError) {
    return Response.json({ error: error.message, code: error.code }, { status: 403 });
  }
  if (error instanceof ShoppingListError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: error.issues[0]?.message ?? "Check the submitted fields.", code: "INVALID_INPUT" },
      { status: 400 },
    );
  }
  console.error("Shopping list request failed", error instanceof Error ? error.name : typeof error);
  return Response.json(
    { error: "The shopping list request could not be completed.", code: "SHOPPING_LIST_FAILED" },
    { status: 500 },
  );
}

export function noStoreShoppingJson(body: unknown, init?: ResponseInit): Response {
  const response = Response.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
