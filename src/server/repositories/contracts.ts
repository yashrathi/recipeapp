import type {
  CookingAssignment,
  RecipeSource,
  RecipeVersion,
} from "@/domain/contracts";
import type { HouseholdActor } from "@/server/auth/policy";

export interface IdentityRepository {
  findActor(userId: string, householdId: string): Promise<HouseholdActor | null>;
}

export interface RecipeRepository {
  findSource(sourceId: string): Promise<RecipeSource | null>;
  findVersion(versionId: string): Promise<RecipeVersion | null>;
}

export interface AssignmentRepository {
  listVisibleTo(actor: HouseholdActor): Promise<CookingAssignment[]>;
}

export interface ApplicationRepositories {
  identities: IdentityRepository;
  recipes: RecipeRepository;
  assignments: AssignmentRepository;
}
