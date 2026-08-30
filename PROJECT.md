# Household Recipe Assistant

## Product brief

A two-role web app that turns a public recipe webpage or YouTube cooking video into a clear, reviewable recipe. A homeowner can import, correct, schedule, assign, and shop for a recipe. A househelp can see assigned cooking work and follow ingredient and step-by-step instructions in a simple, mobile-friendly cooking mode.

## Implementation status

Milestone 1 is implemented and verified locally. It covers public webpage import plus manual fallback, English-first homeowner review with automatic Hindi translation, immutable bilingual assignment snapshots, and an English/Hindi audio-first househelp cook flow. YouTube import, shopping-list preparation, provider handoff, production identity, and production hosting remain later milestones.

## Users

- **Homeowner:** chooses recipes, reviews extracted content, manages assignments, and approves shopping or ordering.
- **Househelp:** prepares assigned dishes, follows instructions, marks progress, and reports missing ingredients or questions.

Both roles belong to a **household**. A person may belong to more than one household, and permissions are scoped to each membership.

## Core outcome

From a public recipe link, a homeowner can produce a trustworthy, assigned cooking task that the househelp can complete without watching or reading the original long-form source.

## Success criteria

- A homeowner can import, review, correct, and save a recipe.
- A reviewed recipe clearly separates ingredients from ordered steps.
- The homeowner can assign the recipe for a date/meal and optionally create a shopping list.
- The househelp can understand what to cook, what is needed, and what to do next on a phone.
- The househelp can complete the core flow by listening and tapping, without needing to read instructions.
- Extraction failures and uncertain fields are visible and recoverable.
- No purchase occurs without a homeowner's explicit review and confirmation.

## Product principles

1. Human review before trust: generated instructions remain a draft until reviewed.
2. Source-aware: preserve attribution and a link to the original source.
3. Audio-first kitchen clarity: one spoken action and one purposeful visual per step, large controls, and no reading dependency.
4. Safe delegation: permissions and ordering authority follow household roles.
5. Accessible and multilingual: spoken guidance, plain language, familiar units, and an easy language change.
6. Integration-independent: recipe extraction and cooking remain useful without a delivery partner.

## Phase-one boundaries

Included in the broader proposed first release roadmap:

- Public recipe webpage import; public YouTube URL import is the next proposed milestone.
- Extraction into title, servings, time, ingredients, and steps.
- Homeowner review/edit/publish.
- Seeded household membership, assignment, schedule, ingredient checklist, and cook mode are in Milestone 1.
- Shopping-list preparation and a provider-neutral order handoff remain proposed later milestones.

Not assumed for the first release:

- Scraping private, paywalled, or authenticated pages.
- Silent or autonomous purchasing.
- Guaranteed direct Swiggy cart/checkout access.
- Nutrition or medical advice.
- Pantry stock automation, price comparison, payments, or delivery tracking unless an official partner API supports them.
- Public recipe discovery/social features.

## Risks to validate

- YouTube transcript availability, language, and quality vary by video.
- Recipe sites differ widely; some prohibit scraping or lack structured recipe data.
- Swiggy or another provider may not expose public cart/checkout APIs.
- AI extraction can omit quantities, merge steps, or invent missing details.
- Allergens, doneness, storage, and substitutions can carry food-safety risk.
