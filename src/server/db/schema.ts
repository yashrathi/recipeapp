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
  contractVersion: text("contract_version", { enum: ["web-recipe-import/v1"] }).notNull(),
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
  originalText: text("original_text").notNull(),
  displayText: text("display_text").notNull(),
  ingredientText: text("ingredient_text").notNull(),
  canonicalName: text("canonical_name"),
  quantityJson: text("quantity_json"),
  unitJson: text("unit_json"),
  // Upgrade compatibility only; normalized source data lives in validated JSON above.
  legacyQuantity: real("quantity"),
  legacyUnit: text("unit"),
  preparationNote: text("preparation_note"),
  optional: integer("optional", { mode: "boolean" }).notNull(),
  sortOrder: integer("sort_order").notNull(),
  confidence: real("confidence").notNull(),
  evidenceJson: text("evidence_json").notNull(),
  legacyEvidence: text("evidence"),
});

export const recipeSteps = sqliteTable("recipe_steps", {
  id: text("id").primaryKey(),
  recipeVersionId: text("recipe_version_id").notNull().references(() => recipeVersions.id),
  sortOrder: integer("sort_order").notNull(),
  section: text("section"),
  originalText: text("original_text").notNull(),
  displayText: text("display_text").notNull(),
  shortText: text("short_text").notNull(),
  detailedText: text("detailed_text").notNull(),
  action: text("action"),
  durationSeconds: integer("duration_seconds"),
  temperatureCelsius: integer("temperature_celsius"),
  ingredientIdsJson: text("ingredient_ids_json").notNull(),
  confidence: real("confidence").notNull(),
  evidenceJson: text("evidence_json").notNull(),
  legacyEvidence: text("evidence"),
});

export const spokenGuidance = sqliteTable(
  "spoken_guidance",
  {
    id: text("id").primaryKey(),
    recipeVersionId: text("recipe_version_id").notNull().references(() => recipeVersions.id),
    guidanceKey: text("guidance_key").notNull(),
    stepId: text("step_id").references(() => recipeSteps.id),
    interfaceKey: text("interface_key"),
    locale: text("locale").notNull(),
    speakableText: text("speakable_text").notNull(),
    contentHash: text("content_hash").notNull(),
    voiceVersion: text("voice_version").notNull(),
    reviewStatus: text("review_status", { enum: ["unreviewed", "reviewed"] }).notNull(),
    audioAssetId: text("audio_asset_id"),
    cacheStatus: text("cache_status", {
      enum: ["not_cached", "cached", "failed"],
    }).notNull(),
    // Upgrade compatibility for the pre-contract foundation migration.
    generationStatus: text("generation_status").notNull(),
    cacheKey: text("cache_key"),
    reviewed: integer("reviewed", { mode: "boolean" }).notNull(),
  },
  (table) => [
    uniqueIndex("spoken_guidance_content_identity_unique").on(
      table.recipeVersionId,
      table.guidanceKey,
      table.locale,
      table.contentHash,
      table.voiceVersion,
    ),
  ],
);

export const visualAssets = sqliteTable("visual_assets", {
  id: text("id").primaryKey(),
  kind: text("kind", {
    enum: ["ingredient_photo", "step_image", "action_icon", "state_icon"],
  }).notNull(),
  purpose: text("purpose", {
    enum: ["identify_ingredient", "show_result", "show_action", "show_state"],
  }).notNull(),
  type: text("type").notNull(),
  sourceUrl: text("source_url"),
  owner: text("owner").notNull(),
  attribution: text("attribution").notNull(),
  verification: text("verification", {
    enum: ["approved", "unreviewed", "expired", "rejected"],
  }).notNull(),
  rights: text("rights", {
    enum: [
      "bundled",
      "licensed",
      "user_owned_confirmed",
      "source_embed_allowed",
      "unknown",
      "prohibited",
      "expired",
    ],
  }).notNull(),
  contentHash: text("content_hash").notNull(),
  assetVersion: text("asset_version").notNull(),
  accessibleNameMessageId: text("accessible_name_message_id"),
  spokenDescriptionMessageId: text("spoken_description_message_id"),
  // Upgrade compatibility for the pre-contract foundation migration.
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
  selectedLocale: text("selected_locale", { enum: ["en-IN", "hi-IN"] }).notNull(),
  notes: text("notes"),
  origin: text("origin", { enum: ["scheduled", "ad_hoc"] }).notNull().default("scheduled"),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const audioReadiness = sqliteTable(
  "audio_readiness",
  {
    id: text("id").primaryKey(),
    assignmentId: text("assignment_id").notNull().references(() => cookingAssignments.id),
    recipeVersionId: text("recipe_version_id").notNull().references(() => recipeVersions.id),
    locale: text("locale").notNull(),
    snapshotContentHash: text("snapshot_content_hash").notNull(),
    status: text("status", {
      enum: ["checking", "ready_cached_audio", "ready_device_tts", "not_ready"],
    }).notNull(),
    requiredGuidanceCount: integer("required_guidance_count").notNull(),
    cachedAudioCount: integer("cached_audio_count").notNull(),
    compatibleDeviceVoice: integer("compatible_device_voice", { mode: "boolean" }).notNull(),
    reviewedTextStored: integer("reviewed_text_stored", { mode: "boolean" }).notNull(),
    recipeSnapshotStored: integer("recipe_snapshot_stored", { mode: "boolean" }).notNull(),
    visualMetadataStored: integer("visual_metadata_stored", { mode: "boolean" }).notNull(),
    checkedAt: text("checked_at").notNull(),
    failureReason: text("failure_reason"),
  },
  (table) => [
    uniqueIndex("audio_readiness_assignment_locale_unique").on(table.assignmentId, table.locale),
  ],
);
