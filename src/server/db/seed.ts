import type Database from "better-sqlite3";

export const DEMO_IDS = {
  household: "demo-household",
  homeowner: "demo-homeowner",
  househelp: "demo-househelp",
  homeownerMembership: "demo-membership-homeowner",
  househelpMembership: "demo-membership-househelp",
  source: "demo-source",
  recipe: "demo-recipe",
  recipeVersion: "demo-recipe-v1",
  ingredientSpinach: "demo-ingredient-spinach",
  ingredientOil: "demo-ingredient-oil",
  stepHeat: "demo-step-heat",
  stepAdd: "demo-step-add",
  guidance: "demo-guidance-add",
  visual: "demo-visual-spinach-icon",
  recipeVisual: "demo-recipe-visual-spinach",
  assignment: "demo-assignment",
} as const;

const SEEDED_AT = "2026-08-30T06:00:00.000Z";

export function seedDemoData(client: Database.Database): void {
  client.transaction(() => {
    client.prepare(
      `INSERT INTO households (id, name, timezone, default_units, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         timezone = excluded.timezone,
         default_units = excluded.default_units,
         created_at = excluded.created_at`,
    ).run(DEMO_IDS.household, "Demo household", "Asia/Kolkata", "metric", SEEDED_AT);

    const userStatement = client.prepare(
      `INSERT INTO users (id, name, locale, spoken_locale, timezone, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         locale = excluded.locale,
         spoken_locale = excluded.spoken_locale,
         timezone = excluded.timezone,
         status = excluded.status,
         created_at = excluded.created_at`,
    );
    userStatement.run(
      DEMO_IDS.homeowner,
      "Asha Homeowner",
      "en-IN",
      "en-IN",
      "Asia/Kolkata",
      "active",
      SEEDED_AT,
    );
    userStatement.run(
      DEMO_IDS.househelp,
      "Meena Househelp",
      "hi-IN",
      "hi-IN",
      "Asia/Kolkata",
      "active",
      SEEDED_AT,
    );

    const membershipStatement = client.prepare(
      `INSERT INTO memberships (id, user_id, household_id, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         user_id = excluded.user_id,
         household_id = excluded.household_id,
         role = excluded.role,
         status = excluded.status,
         created_at = excluded.created_at`,
    );
    membershipStatement.run(
      DEMO_IDS.homeownerMembership,
      DEMO_IDS.homeowner,
      DEMO_IDS.household,
      "homeowner",
      "active",
      SEEDED_AT,
    );
    membershipStatement.run(
      DEMO_IDS.househelpMembership,
      DEMO_IDS.househelp,
      DEMO_IDS.household,
      "househelp",
      "active",
      SEEDED_AT,
    );

    client.prepare(
      `INSERT INTO recipe_sources
        (id, household_id, type, canonical_url, title, author, attribution, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         canonical_url = excluded.canonical_url,
         title = excluded.title,
         author = excluded.author,
         attribution = excluded.attribution,
         fetched_at = excluded.fetched_at`,
    ).run(
      DEMO_IDS.source,
      DEMO_IDS.household,
      "manual",
      null,
      "Simple spinach",
      "Recipe App demo",
      "Deterministic local demo fixture",
      SEEDED_AT,
    );

    client.prepare(
      `INSERT INTO recipes
        (id, household_id, source_id, current_version_id, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         current_version_id = excluded.current_version_id,
         status = excluded.status`,
    ).run(
      DEMO_IDS.recipe,
      DEMO_IDS.household,
      DEMO_IDS.source,
      DEMO_IDS.recipeVersion,
      "published",
      DEMO_IDS.homeowner,
      SEEDED_AT,
    );

    client.prepare(
      `INSERT INTO recipe_versions
        (id, recipe_id, source_id, household_id, version, title, servings, prep_minutes,
         cook_minutes, language, review_status, reviewed_by, published_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         servings = excluded.servings,
         prep_minutes = excluded.prep_minutes,
         cook_minutes = excluded.cook_minutes,
         language = excluded.language,
         review_status = excluded.review_status,
         reviewed_by = excluded.reviewed_by,
         published_at = excluded.published_at`,
    ).run(
      DEMO_IDS.recipeVersion,
      DEMO_IDS.recipe,
      DEMO_IDS.source,
      DEMO_IDS.household,
      1,
      "Simple spinach",
      2,
      5,
      8,
      "en-IN",
      "published",
      DEMO_IDS.homeowner,
      SEEDED_AT,
      SEEDED_AT,
    );

    const ingredientStatement = client.prepare(
      `INSERT INTO recipe_ingredients
        (id, recipe_version_id, display_line, canonical_name, quantity, unit, preparation_note,
         optional, sort_order, confidence, evidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         display_line = excluded.display_line,
         canonical_name = excluded.canonical_name,
         quantity = excluded.quantity,
         unit = excluded.unit,
         preparation_note = excluded.preparation_note,
         optional = excluded.optional,
         sort_order = excluded.sort_order,
         confidence = excluded.confidence,
         evidence = excluded.evidence`,
    );
    ingredientStatement.run(
      DEMO_IDS.ingredientSpinach,
      DEMO_IDS.recipeVersion,
      "1 cup spinach, washed",
      "spinach",
      1,
      "cup",
      "washed",
      0,
      0,
      1,
      "Deterministic demo fixture",
    );
    ingredientStatement.run(
      DEMO_IDS.ingredientOil,
      DEMO_IDS.recipeVersion,
      "1 teaspoon cooking oil",
      "cooking oil",
      1,
      "teaspoon",
      null,
      0,
      1,
      1,
      "Deterministic demo fixture",
    );

    const stepStatement = client.prepare(
      `INSERT INTO recipe_steps
        (id, recipe_version_id, sort_order, short_text, detailed_text, action,
         duration_seconds, temperature_celsius, ingredient_ids_json, confidence, evidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         sort_order = excluded.sort_order,
         short_text = excluded.short_text,
         detailed_text = excluded.detailed_text,
         action = excluded.action,
         duration_seconds = excluded.duration_seconds,
         temperature_celsius = excluded.temperature_celsius,
         ingredient_ids_json = excluded.ingredient_ids_json,
         confidence = excluded.confidence,
         evidence = excluded.evidence`,
    );
    stepStatement.run(
      DEMO_IDS.stepHeat,
      DEMO_IDS.recipeVersion,
      0,
      "Heat the oil.",
      "Heat one teaspoon of cooking oil over medium heat.",
      "heat",
      60,
      null,
      JSON.stringify([DEMO_IDS.ingredientOil]),
      1,
      "Deterministic demo fixture",
    );
    stepStatement.run(
      DEMO_IDS.stepAdd,
      DEMO_IDS.recipeVersion,
      1,
      "Add the spinach.",
      "Now add one cup of washed spinach and stir for two minutes.",
      "add",
      120,
      null,
      JSON.stringify([DEMO_IDS.ingredientSpinach]),
      1,
      "Deterministic demo fixture",
    );

    client.prepare(
      `INSERT INTO spoken_guidance
        (id, recipe_version_id, step_id, interface_key, locale, speakable_text, voice_version,
         generation_status, cache_key, reviewed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         speakable_text = excluded.speakable_text,
         voice_version = excluded.voice_version,
         generation_status = excluded.generation_status,
         cache_key = excluded.cache_key,
         reviewed = excluded.reviewed`,
    ).run(
      DEMO_IDS.guidance,
      DEMO_IDS.recipeVersion,
      DEMO_IDS.stepAdd,
      null,
      "en-IN",
      "Now add one cup of spinach.",
      "fixture-v1",
      "ready",
      "demo/en-IN/step-add",
      1,
    );

    client.prepare(
      `INSERT INTO visual_assets
        (id, type, source_url, owner, attribution, rights_status, alt_text, spoken_description,
         verification_status, reviewed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         type = excluded.type,
         source_url = excluded.source_url,
         owner = excluded.owner,
         attribution = excluded.attribution,
         rights_status = excluded.rights_status,
         alt_text = excluded.alt_text,
         spoken_description = excluded.spoken_description,
         verification_status = excluded.verification_status,
         reviewed_by = excluded.reviewed_by`,
    ).run(
      DEMO_IDS.visual,
      "icon",
      null,
      "Recipe App",
      "Local demo icon; no external media",
      "verified",
      "Spinach leaf icon",
      "Spinach",
      "verified",
      DEMO_IDS.homeowner,
    );

    client.prepare(
      `INSERT INTO recipe_visuals
        (id, recipe_version_id, ingredient_id, step_id, visual_asset_id, purpose, approved)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         visual_asset_id = excluded.visual_asset_id,
         purpose = excluded.purpose,
         approved = excluded.approved`,
    ).run(
      DEMO_IDS.recipeVisual,
      DEMO_IDS.recipeVersion,
      DEMO_IDS.ingredientSpinach,
      null,
      DEMO_IDS.visual,
      "ingredient_identity",
      1,
    );

    client.prepare(
      `INSERT INTO cooking_assignments
        (id, household_id, recipe_version_id, assignee_id, created_by, scheduled_date,
         meal_slot, target_time, target_servings, notes, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         recipe_version_id = excluded.recipe_version_id,
         assignee_id = excluded.assignee_id,
         scheduled_date = excluded.scheduled_date,
         meal_slot = excluded.meal_slot,
         target_time = excluded.target_time,
         target_servings = excluded.target_servings,
         notes = excluded.notes,
         status = excluded.status,
         updated_at = excluded.updated_at`,
    ).run(
      DEMO_IDS.assignment,
      DEMO_IDS.household,
      DEMO_IDS.recipeVersion,
      DEMO_IDS.househelp,
      DEMO_IDS.homeowner,
      "2026-08-31",
      "lunch",
      "12:30",
      2,
      "Foundation fixture only",
      "scheduled",
      SEEDED_AT,
      SEEDED_AT,
    );
  })();
}
