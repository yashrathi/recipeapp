import type { HouseholdRole } from "@/domain/contracts";

export const Capabilities = [
  "household:manage",
  "recipe:import",
  "recipe:review",
  "recipe:publish",
  "assignment:manage",
  "assignment:view",
  "cooking:progress",
  "issue:report",
  "shopping:manage",
] as const;

export type Capability = (typeof Capabilities)[number];

const roleCapabilities: Record<HouseholdRole, ReadonlySet<Capability>> = {
  homeowner: new Set(Capabilities),
  househelp: new Set(["assignment:view", "cooking:progress", "issue:report"]),
};

export interface HouseholdActor {
  userId: string;
  householdId: string;
  membershipId: string;
  role: HouseholdRole;
}

export interface AuthorizationResource {
  householdId: string;
  assigneeId?: string;
}

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";

  constructor(message = "This household role cannot perform that action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function can(
  actor: HouseholdActor,
  capability: Capability,
  resource: AuthorizationResource,
): boolean {
  if (actor.householdId !== resource.householdId) return false;
  if (!roleCapabilities[actor.role].has(capability)) return false;

  if (
    actor.role === "househelp" &&
    capability === "assignment:view" &&
    resource.assigneeId !== actor.userId
  ) {
    return false;
  }

  return true;
}

export function authorize(
  actor: HouseholdActor,
  capability: Capability,
  resource: AuthorizationResource,
): void {
  if (!can(actor, capability, resource)) throw new AuthorizationError();
}
