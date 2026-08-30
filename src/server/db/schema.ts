import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  locale: text("locale").notNull(),
  spokenLocale: text("spoken_locale").notNull(),
  timezone: text("timezone").notNull(),
  status: text("status", { enum: ["active", "disabled"] }).notNull(),
  createdAt: text("created_at").notNull(),
});

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull(),
  defaultUnits: text("default_units", { enum: ["metric", "imperial"] }).notNull(),
  createdAt: text("created_at").notNull(),
});

export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    householdId: text("household_id").notNull().references(() => households.id),
    role: text("role", { enum: ["homeowner", "househelp"] }).notNull(),
    status: text("status", { enum: ["active", "invited", "revoked"] }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("memberships_user_household_unique").on(table.userId, table.householdId)],
);

export const recipeSources = sqliteTable("recipe_sources", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  type: text("type", { enum: ["web", "youtube", "manual"] }).notNull(),
  canonicalUrl: text("canonical_url"),
  title: text("title"),
  author: text("author"),
  attribution: text("attribution").notNull(),
  fetchedAt: text("fetched_at"),
});

export const importJobs = sqliteTable("import_jobs", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  createdBy: text("created_by").notNull().references(() => users.id),
  sourceId: text("source_id").notNull().references(() => recipeSources.id),
  stage: text("stage").notNull(),
  status: text("status").notNull(),
  attemptCount: integer("attempt_count").notNull(),
  errorCode: text("error_code"),
  warningsJson: text("warnings_json").notNull(),
  extractorVersion: text("extractor_version").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const recipes = sqliteTable("recipes", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  sourceId: text("source_id").notNull().references(() => recipeSources.id),
  currentVersionId: text("current_version_id"),
  status: text("status", { enum: ["draft", "published", "archived"] }).notNull(),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
});

export const recipeVersions = sqliteTable(
  "recipe_versions",
  {
    id: text("id").primaryKey(),
    recipeId: text("recipe_id").notNull().references(() => recipes.id),
    sourceId: text("source_id").notNull().references(() => recipeSources.id),
    householdId: text("household_id").notNull().references(() => households.id),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    servings: real("servings"),
    prepMinutes: integer("prep_minutes"),
    cookMinutes: integer("cook_minutes"),
    language: text("language").notNull(),
    reviewStatus: text("review_status").notNull(),
    reviewedBy: text("reviewed_by").references(() => users.id),
    publishedAt: text("published_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("recipe_versions_recipe_version_unique").on(table.recipeId, table.version)],
);

export const recipeIngredients = sqliteTable("recipe_ingredients", {
  id: text("id").primaryKey(),
  recipeVersionId: text("recipe_version_id").notNull().references(() => recipeVersions.id),
  displayLine: text("display_line").notNull(),
  canonicalName: text("canonical_name"),
  quantity: real("quantity"),
  unit: text("unit"),
  preparationNote: text("preparation_note"),
  optional: integer("optional", { mode: "boolean" }).notNull(),
  sortOrder: integer("sort_order").notNull(),
  confidence: real("confidence").notNull(),
  evidence: text("evidence"),
});

export const recipeSteps = sqliteTable("recipe_steps", {
  id: text("id").primaryKey(),
  recipeVersionId: text("recipe_version_id").notNull().references(() => recipeVersions.id),
  sortOrder: integer("sort_order").notNull(),
  shortText: text("short_text").notNull(),
  detailedText: text("detailed_text").notNull(),
  action: text("action"),
  durationSeconds: integer("duration_seconds"),
  temperatureCelsius: integer("temperature_celsius"),
  ingredientIdsJson: text("ingredient_ids_json").notNull(),
  confidence: real("confidence").notNull(),
  evidence: text("evidence"),
});

export const spokenGuidance = sqliteTable("spoken_guidance", {
  id: text("id").primaryKey(),
  recipeVersionId: text("recipe_version_id").notNull().references(() => recipeVersions.id),
  stepId: text("step_id").references(() => recipeSteps.id),
  interfaceKey: text("interface_key"),
  locale: text("locale").notNull(),
  speakableText: text("speakable_text").notNull(),
  voiceVersion: text("voice_version").notNull(),
  generationStatus: text("generation_status").notNull(),
  cacheKey: text("cache_key"),
  reviewed: integer("reviewed", { mode: "boolean" }).notNull(),
});

export const visualAssets = sqliteTable("visual_assets", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  sourceUrl: text("source_url"),
  owner: text("owner").notNull(),
  attribution: text("attribution").notNull(),
  rightsStatus: text("rights_status").notNull(),
  altText: text("alt_text").notNull(),
  spokenDescription: text("spoken_description").notNull(),
  verificationStatus: text("verification_status").notNull(),
  reviewedBy: text("reviewed_by").references(() => users.id),
});

export const recipeVisuals = sqliteTable("recipe_visuals", {
  id: text("id").primaryKey(),
  recipeVersionId: text("recipe_version_id").notNull().references(() => recipeVersions.id),
  ingredientId: text("ingredient_id").references(() => recipeIngredients.id),
  stepId: text("step_id").references(() => recipeSteps.id),
  visualAssetId: text("visual_asset_id").notNull().references(() => visualAssets.id),
  purpose: text("purpose").notNull(),
  approved: integer("approved", { mode: "boolean" }).notNull(),
});

export const cookingAssignments = sqliteTable("cooking_assignments", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  recipeVersionId: text("recipe_version_id").notNull().references(() => recipeVersions.id),
  assigneeId: text("assignee_id").notNull().references(() => users.id),
  createdBy: text("created_by").notNull().references(() => users.id),
  scheduledDate: text("scheduled_date").notNull(),
  mealSlot: text("meal_slot").notNull(),
  targetTime: text("target_time"),
  targetServings: real("target_servings").notNull(),
  notes: text("notes"),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
