import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import {
  CookingAssignmentSchema,
  RecipeSourceSchema,
  RecipeVersionSchema,
} from "@/domain/contracts";
import type { HouseholdActor } from "@/server/auth/policy";
import * as schema from "@/server/db/schema";
import type {
  ApplicationRepositories,
  AssignmentRepository,
  IdentityRepository,
  RecipeRepository,
} from "@/server/repositories/contracts";

type AppDatabase = BetterSQLite3Database<typeof schema>;

export class SqliteIdentityRepository implements IdentityRepository {
  constructor(private readonly database: AppDatabase) {}

  async findActor(userId: string, householdId: string): Promise<HouseholdActor | null> {
    const [membership] = await this.database
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.householdId, householdId),
          eq(schema.memberships.status, "active"),
        ),
      )
      .limit(1);

    return membership
      ? {
          userId: membership.userId,
          householdId: membership.householdId,
          membershipId: membership.id,
          role: membership.role,
        }
      : null;
  }
}

export class SqliteRecipeRepository implements RecipeRepository {
  constructor(private readonly database: AppDatabase) {}

  async findSource(sourceId: string) {
    const [source] = await this.database
      .select()
      .from(schema.recipeSources)
      .where(eq(schema.recipeSources.id, sourceId))
      .limit(1);
    return source ? RecipeSourceSchema.parse(source) : null;
  }

  async findVersion(versionId: string) {
    const [version] = await this.database
      .select()
      .from(schema.recipeVersions)
      .where(eq(schema.recipeVersions.id, versionId))
      .limit(1);
    if (!version) return null;

    const [ingredients, steps] = await Promise.all([
      this.database
        .select()
        .from(schema.recipeIngredients)
        .where(eq(schema.recipeIngredients.recipeVersionId, versionId))
        .orderBy(asc(schema.recipeIngredients.sortOrder)),
      this.database
        .select()
        .from(schema.recipeSteps)
        .where(eq(schema.recipeSteps.recipeVersionId, versionId))
        .orderBy(asc(schema.recipeSteps.sortOrder)),
    ]);

    return RecipeVersionSchema.parse({
      ...version,
      ingredients: ingredients.map((ingredient) => ({
        ...ingredient,
        order: ingredient.sortOrder,
      })),
      steps: steps.map((step) => ({
        ...step,
        order: step.sortOrder,
        ingredientIds: JSON.parse(step.ingredientIdsJson) as unknown,
      })),
    });
  }
}

export class SqliteAssignmentRepository implements AssignmentRepository {
  constructor(private readonly database: AppDatabase) {}

  async listVisibleTo(actor: HouseholdActor) {
    const conditions = [eq(schema.cookingAssignments.householdId, actor.householdId)];
    if (actor.role === "househelp") {
      conditions.push(eq(schema.cookingAssignments.assigneeId, actor.userId));
    }

    const rows = await this.database
      .select()
      .from(schema.cookingAssignments)
      .where(and(...conditions))
      .orderBy(asc(schema.cookingAssignments.scheduledDate));
    return rows.map((row) => CookingAssignmentSchema.parse(row));
  }
}

export function createSqliteRepositories(database: AppDatabase): ApplicationRepositories {
  return {
    identities: new SqliteIdentityRepository(database),
    recipes: new SqliteRecipeRepository(database),
    assignments: new SqliteAssignmentRepository(database),
  };
}
