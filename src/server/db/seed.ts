import type Database from "better-sqlite3";

import { seedHousehelpDemoData } from "@/features/househelp/server/demo-seed";

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
  audioReadiness: "demo-audio-readiness-en-IN",
} as const;

const SEEDED_AT = "2026-08-30T06:00:00.000Z";
const GUIDANCE_CONTENT_HASH = "139c8ed9b7487651eda0d4bf0ae2a87d4442095b27fdec936012bfc853f4d3c1";
const VISUAL_CONTENT_HASH = "0433411e244c9497a5cd23101ae2349581298b28a5d6a964418473bda140f3cc";
const SNAPSHOT_CONTENT_HASH = "b669a094fc9a87583a9fc1ba0820d0ea2b2e971daca238fd257a3ae0e27f5524";

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
        (id, recipe_version_id, display_line, original_text, display_text, ingredient_text,
         canonical_name, quantity_json, unit_json, quantity, unit, preparation_note,
         optional, sort_order, confidence, evidence_json, evidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         display_line = excluded.display_line,
         original_text = excluded.original_text,
         display_text = excluded.display_text,
         ingredient_text = excluded.ingredient_text,
         canonical_name = excluded.canonical_name,
         quantity_json = excluded.quantity_json,
         unit_json = excluded.unit_json,
         quantity = excluded.quantity,
         unit = excluded.unit,
         preparation_note = excluded.preparation_note,
         optional = excluded.optional,
         sort_order = excluded.sort_order,
         confidence = excluded.confidence,
         evidence_json = excluded.evidence_json,
         evidence = excluded.evidence`,
    );
    ingredientStatement.run(
      DEMO_IDS.ingredientSpinach,
      DEMO_IDS.recipeVersion,
      "1/2 cup spinach, washed",
      "1/2 cup spinach, washed",
      "1/2 cup spinach, washed",
      "spinach",
      "spinach",
      JSON.stringify({
        kind: "exact",
        numerator: 1,
        denominator: 2,
        sourceText: "1/2",
        confidence: 1,
      }),
      JSON.stringify({ canonical: "cup", sourceText: "cup", confidence: 1 }),
      null,
      null,
      "washed",
      0,
      1,
      1,
      "[]",
      null,
    );
    ingredientStatement.run(
      DEMO_IDS.ingredientOil,
      DEMO_IDS.recipeVersion,
      "1 teaspoon cooking oil",
      "1 teaspoon cooking oil",
      "1 teaspoon cooking oil",
      "cooking oil",
      "cooking oil",
      JSON.stringify({ kind: "exact", decimal: "1", sourceText: "1", confidence: 1 }),
      JSON.stringify({ canonical: "teaspoon", sourceText: "teaspoon", confidence: 1 }),
      null,
      null,
      null,
      0,
      2,
      1,
      "[]",
      null,
    );

    const stepStatement = client.prepare(
      `INSERT INTO recipe_steps
        (id, recipe_version_id, sort_order, section, original_text, display_text, short_text,
         detailed_text, action, duration_seconds, temperature_celsius, ingredient_ids_json,
         confidence, evidence_json, evidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         sort_order = excluded.sort_order,
         section = excluded.section,
         original_text = excluded.original_text,
         display_text = excluded.display_text,
         short_text = excluded.short_text,
         detailed_text = excluded.detailed_text,
         action = excluded.action,
         duration_seconds = excluded.duration_seconds,
         temperature_celsius = excluded.temperature_celsius,
         ingredient_ids_json = excluded.ingredient_ids_json,
         confidence = excluded.confidence,
         evidence_json = excluded.evidence_json,
         evidence = excluded.evidence`,
    );
    stepStatement.run(
      DEMO_IDS.stepHeat,
      DEMO_IDS.recipeVersion,
      1,
      null,
      "Heat the oil.",
      "Heat the oil.",
      "Heat the oil.",
      "Heat one teaspoon of cooking oil over medium heat.",
      "heat",
      60,
      null,
      JSON.stringify([DEMO_IDS.ingredientOil]),
      1,
      "[]",
      null,
    );
    stepStatement.run(
      DEMO_IDS.stepAdd,
      DEMO_IDS.recipeVersion,
      2,
      null,
      "Now add half a cup of washed spinach and stir for two minutes.",
      "Now add half a cup of washed spinach and stir for two minutes.",
      "Add the spinach.",
      "Now add half a cup of washed spinach and stir for two minutes.",
      "add",
      120,
      null,
      JSON.stringify([DEMO_IDS.ingredientSpinach]),
      1,
      "[]",
      null,
    );

    client.prepare("DELETE FROM spoken_guidance WHERE recipe_version_id = ?")
      .run(DEMO_IDS.recipeVersion);
    const guidanceStatement = client.prepare(
      `INSERT INTO spoken_guidance
        (id, recipe_version_id, guidance_key, step_id, interface_key, locale, speakable_text,
         content_hash, voice_version, review_status, audio_asset_id, cache_status,
         generation_status, cache_key, reviewed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         guidance_key = excluded.guidance_key,
         speakable_text = excluded.speakable_text,
         content_hash = excluded.content_hash,
         voice_version = excluded.voice_version,
         review_status = excluded.review_status,
         audio_asset_id = excluded.audio_asset_id,
         cache_status = excluded.cache_status,
         generation_status = excluded.generation_status,
         cache_key = excluded.cache_key,
         reviewed = excluded.reviewed`,
    );
    const guidanceRows = [
      ["recipe.dish", null, "en-IN", "Simple spinach"],
      ["recipe.dish", null, "hi-IN", "सादा पालक"],
      [`ingredient.${DEMO_IDS.ingredientSpinach}`, null, "en-IN", "half a cup of washed spinach"],
      [`ingredient.${DEMO_IDS.ingredientSpinach}`, null, "hi-IN", "आधा कप धुला हुआ पालक"],
      [`ingredient.${DEMO_IDS.ingredientOil}`, null, "en-IN", "one teaspoon of cooking oil"],
      [`ingredient.${DEMO_IDS.ingredientOil}`, null, "hi-IN", "एक छोटा चम्मच खाना पकाने का तेल"],
      [`cook.step.${DEMO_IDS.stepHeat}`, DEMO_IDS.stepHeat, "en-IN", "Heat one teaspoon of cooking oil over medium heat."],
      [`cook.step.${DEMO_IDS.stepHeat}`, DEMO_IDS.stepHeat, "hi-IN", "मध्यम आँच पर एक छोटा चम्मच तेल गरम करें।"],
      [`cook.step.${DEMO_IDS.stepAdd}`, DEMO_IDS.stepAdd, "en-IN", "Add half a cup of washed spinach and stir for two minutes."],
      [`cook.step.${DEMO_IDS.stepAdd}`, DEMO_IDS.stepAdd, "hi-IN", "आधा कप धुला पालक डालें और दो मिनट चलाएँ।"],
    ] as const;
    for (const [guidanceKey, stepId, locale, speakableText] of guidanceRows) {
      const identity = `${guidanceKey}:${locale}`;
      const isCachedDemoGuidance = guidanceKey === `cook.step.${DEMO_IDS.stepAdd}` && locale === "en-IN";
      const contentHash = isCachedDemoGuidance ? GUIDANCE_CONTENT_HASH : `demo-${identity}`;
      guidanceStatement.run(
        isCachedDemoGuidance ? DEMO_IDS.guidance : `demo-guidance-${identity.replaceAll(".", "-")}`,
        DEMO_IDS.recipeVersion,
        guidanceKey,
        stepId,
        null,
        locale,
        speakableText,
        contentHash,
        "fixture-v1",
        "reviewed",
        isCachedDemoGuidance ? "demo-audio-step-add" : null,
        isCachedDemoGuidance ? "cached" : "not_cached",
        "ready",
        isCachedDemoGuidance ? `demo/en-IN/${contentHash}/fixture-v1` : null,
        1,
      );
    }

    client.prepare(
      `INSERT INTO visual_assets
        (id, kind, purpose, type, source_url, owner, attribution, verification, rights,
         content_hash, asset_version, accessible_name_message_id, spoken_description_message_id,
         rights_status, alt_text, spoken_description, verification_status, reviewed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         kind = excluded.kind,
         purpose = excluded.purpose,
         type = excluded.type,
         source_url = excluded.source_url,
         owner = excluded.owner,
         attribution = excluded.attribution,
         verification = excluded.verification,
         rights = excluded.rights,
         content_hash = excluded.content_hash,
         asset_version = excluded.asset_version,
         accessible_name_message_id = excluded.accessible_name_message_id,
         spoken_description_message_id = excluded.spoken_description_message_id,
         rights_status = excluded.rights_status,
         alt_text = excluded.alt_text,
         spoken_description = excluded.spoken_description,
         verification_status = excluded.verification_status,
         reviewed_by = excluded.reviewed_by`,
    ).run(
      DEMO_IDS.visual,
      "state_icon",
      "show_state",
      "icon",
      null,
      "Recipe App",
      "Local demo icon; no external media",
      "approved",
      "bundled",
      VISUAL_CONTENT_HASH,
      "fixture-v1",
      "visual.spinach.name",
      "visual.spinach.description",
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
      "identify_ingredient",
      1,
    );

    client.prepare(
      `INSERT INTO cooking_assignments
        (id, household_id, recipe_version_id, assignee_id, created_by, scheduled_date,
         meal_slot, target_time, target_servings, selected_locale, notes, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         recipe_version_id = excluded.recipe_version_id,
         assignee_id = excluded.assignee_id,
         scheduled_date = excluded.scheduled_date,
         meal_slot = excluded.meal_slot,
         target_time = excluded.target_time,
         target_servings = excluded.target_servings,
         selected_locale = excluded.selected_locale,
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
      "en-IN",
      "Foundation fixture only",
      "scheduled",
      SEEDED_AT,
      SEEDED_AT,
    );

    client.prepare(
      `INSERT INTO audio_readiness
        (id, assignment_id, recipe_version_id, locale, snapshot_content_hash, status,
         required_guidance_count, cached_audio_count, compatible_device_voice,
         reviewed_text_stored, recipe_snapshot_stored, visual_metadata_stored,
         checked_at, failure_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         recipe_version_id = excluded.recipe_version_id,
         snapshot_content_hash = excluded.snapshot_content_hash,
         status = excluded.status,
         required_guidance_count = excluded.required_guidance_count,
         cached_audio_count = excluded.cached_audio_count,
         compatible_device_voice = excluded.compatible_device_voice,
         reviewed_text_stored = excluded.reviewed_text_stored,
         recipe_snapshot_stored = excluded.recipe_snapshot_stored,
         visual_metadata_stored = excluded.visual_metadata_stored,
         checked_at = excluded.checked_at,
         failure_reason = excluded.failure_reason`,
    ).run(
      DEMO_IDS.audioReadiness,
      DEMO_IDS.assignment,
      DEMO_IDS.recipeVersion,
      "en-IN",
      SNAPSHOT_CONTENT_HASH,
      "ready_cached_audio",
      1,
      1,
      0,
      1,
      1,
      1,
      SEEDED_AT,
      null,
    );

    seedHousehelpDemoData(client, {
      assignment: DEMO_IDS.assignment,
      househelp: DEMO_IDS.househelp,
      recipeVersion: DEMO_IDS.recipeVersion,
    });
  })();
}
