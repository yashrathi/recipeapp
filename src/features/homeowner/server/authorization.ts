import { AuthorizationError, type HouseholdActor } from "@/server/auth/policy";

export function assertHomeowner(
  actor: HouseholdActor,
): asserts actor is HouseholdActor & { role: "homeowner" } {
  if (actor.role !== "homeowner") {
    throw new AuthorizationError("Only a homeowner can use the recipe planning workspace.");
  }
}
