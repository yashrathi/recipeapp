# Recipe webpage import contract

Status: Milestone 1 deterministic contract, extended by the approved Milestone 2 webpage-retrieval fallback

Scope: public, unauthenticated recipe webpages only

Contract version: `web-recipe-import/v1`

This document defines the security and extraction boundary between an import job and a recipe draft. Implementations may choose different libraries, but must produce the same observable decisions and normalized result for the fixtures in `test/fixtures/recipe-import`.

## 1. Non-goals

The direct importer does not use a browser, execute page JavaScript, sign in, accept cookies, bypass a paywall, download images, or follow links other than bounded HTTP redirects. After public-address approval, a configured Firecrawl adapter may return rendered raw HTML/markdown. Deterministic Schema.org extraction remains first. When deterministic extraction is unusable, one bounded OpenAI Responses call may prepare an evidence-checked draft from Firecrawl markdown. Public YouTube watch, share, and Shorts links use Firecrawl transcript markdown followed by the same evidence-checked extraction. The importer never invents a missing quantity, unit, ingredient, step, time, serving count, author, image, nutrition, or allergen.

## 2. Pipeline and trust boundaries

Run these stages in order:

1. `validate_url`: parse and normalize the submitted URL.
2. `resolve`: resolve the hostname and approve every returned address.
3. `fetch`: make one bounded GET while connecting only to an approved address.
4. `redirect`: repeat validation and resolution for each redirect target.
5. `decode`: enforce media type, byte limits, and character decoding.
6. `extract`: parse Recipe JSON-LD first; use scoped Recipe microdata only when JSON-LD has no eligible candidate.
7. `normalize`: preserve source strings and conservatively parse quantities, units, and steps.
8. `classify`: return `success`, `partial_success`, or `failure`; every non-failure result is a draft in `needs_review`.

If direct retrieval fails with an eligible fetch/decode error, or deterministic extraction finds no supported recipe, the pipeline may make one bounded Firecrawl scrape request and then repeat the same extraction and classification stages over returned raw HTML. URL-policy failures and unsafe redirects never cross the provider boundary.

For an approved YouTube single-video URL, canonicalize the video ID to `https://www.youtube.com/watch?v=…`, request Firecrawl once, and isolate only a non-empty `## Transcript` section. Preserve timestamps only when they are explicit in provider text. No YouTube Data API key, audio/video download, `yt-dlp`, browser cookies, or Pick-a-Recipe code is used. Missing transcript evidence returns `TRANSCRIPT_UNAVAILABLE`.

Untrusted input includes the submitted URL, DNS answers, redirect targets, headers, body bytes, HTML, metadata URLs, and all extracted text. Never place extracted markup into the UI without normal escaping. Network policy must also be enforced at the deployment/egress layer; application checks are defense in depth, not a substitute.

## 3. URL and fetch policy

### 3.1 Initial URL validation

Use a standards-compliant WHATWG URL parser and then apply all checks below. Reject rather than repair an ambiguous URL.

- Permit only `http:` and `https:`. Prefer HTTPS; record a `SOURCE_USES_HTTP` warning for an initial HTTP URL.
- Reject user names, passwords, missing hostnames, URL parse errors, control characters, and a non-HTTP(S) scheme.
- Permit only the default port for the scheme (`80` for HTTP, `443` for HTTPS), whether explicit or implicit.
- Convert internationalized hostnames to their ASCII IDNA form before policy checks. Reject invalid IDNA.
- Reject a single-label hostname and `localhost`, any subdomain of `.localhost`, and names ending in `.local`, `.internal`, `.home`, `.lan`, or `.onion`.
- Normalize IPv4 using the URL parser before classification. This is required to catch integer, hexadecimal, octal, shortened, and IPv4-mapped IPv6 spellings.
- Remove the fragment, lowercase the scheme and ASCII hostname, remove a default port, preserve path and query semantics, and serialize with the URL parser. Do not reorder or delete query parameters.
- A URL being syntactically acceptable does not make it fetchable; DNS/address approval is mandatory.

### 3.2 Address approval and DNS rebinding protection

Resolve both A and AAAA records with the system's trusted resolver. The request is allowed only when there is at least one answer and **every** answer is globally routable. Fail closed on lookup errors or mixed public/private answers.

Treat every non-global or special-purpose address in the current IANA IPv4 and IPv6 special-purpose registries as blocked. This includes loopback, unspecified, private/unique-local, link-local, carrier-grade NAT, benchmarking, documentation, protocol-assignment, multicast, reserved, and IPv4-mapped forms. Classify an embedded IPv4 address before allowing an IPv4-mapped IPv6 value.

After approval, connect to one of the approved addresses while retaining the original hostname for the HTTP `Host` header and TLS SNI/certificate validation. Do not perform an unpinned second DNS lookup in the HTTP client. Disable environment-controlled proxies unless the deployment supplies a locked-down egress proxy that applies the same policy.

Re-run URL parsing, hostname policy, DNS resolution, and address approval for **every** redirect. Do not forward authorization, cookies, or other credentials (none should be present). A later DNS answer that differs is a new decision and must be re-approved and pinned.

### 3.3 Request limits

The fetch adapter must enforce all of these limits:

| Control | Milestone 1 value |
|---|---:|
| Method | `GET` only |
| Redirects | at most 5 |
| Connect timeout | 5 seconds per attempt |
| Inactivity timeout | 5 seconds |
| Total wall-clock time | 15 seconds including redirects |
| Response-header bytes | 64 KiB |
| Compressed/wire body | 2 MiB |
| Decompressed body | 5 MiB |
| Allowed response types | `text/html`, `application/xhtml+xml` |

- Reject HTTPS-to-HTTP redirects as `INSECURE_REDIRECT`.
- Abort the stream as soon as a limit is crossed. A misleading or absent `Content-Length` never disables streaming limits.
- Permit only `identity`, `gzip`, and `br` content encodings. Apply both wire and decoded limits to prevent decompression bombs.
- Require an allowed `Content-Type`, ignoring an optional `charset` parameter. Do not MIME-sniff an absent or unsupported type.
- Decode the declared supported charset. If none is declared, use HTML encoding detection with UTF-8 as the final default. Invalid byte sequences may be replaced, but add `CHARSET_REPLACEMENT`.
- Send a stable, truthful application user agent and `Accept: text/html, application/xhtml+xml`. Send no cookies, authorization, referer, client certificate, or user-specific headers.
- Treat `2xx` as a response, `3xx` only through this redirect policy, `408`, `425`, `429`, and `5xx` as retryable fetch failures, and other `4xx` as non-retryable.
- Make at most 3 attempts for a retryable import, with bounded exponential backoff and jitter. Honor `Retry-After` only up to 60 seconds. Re-run DNS/address approval on every attempt. Client cancellation stops pending retries.
- Log only normalized host, stage, status/size/timing, and redacted error codes. Do not log full query strings, response bodies, cookies, or extracted recipe text.

The source-policy layer may reject a site before fetching based on documented product/legal policy. A robots check, if implemented, uses the identical safe-fetch policy. Never treat `robots.txt` as permission to bypass other restrictions.

### 3.4 Firecrawl fallback

- Firecrawl is optional and server-only. Use `POST https://api.firecrawl.dev/v2/scrape` with bearer authentication; never expose the key through a `NEXT_PUBLIC_` variable.
- Before the provider call, repeat the submitted URL's syntax, DNS, and public-address approval. Never call Firecrawl for an explicitly rejected URL, address, mixed address space, downgrade, or unsafe redirect.
- Request both `rawHtml` and `markdown` with `storeInCache: false` and framework fetch caching disabled. Omit `zeroDataRetention` by default because standard paid plans may reject it. When the server-only `FIRECRAWL_ZERO_DATA_RETENTION` option is explicitly true, send `zeroDataRetention: true`; never retry or silently downgrade that request after a rejection. Standard-mode requests remain subject to Firecrawl's provider retention terms, while ZDR must be enabled on the provider account. The webpage extractor consumes only `rawHtml`; capped markdown plus title, language, and source URL metadata may be retained in memory for a source-specific adapter.
- Limit the provider call to 30 seconds, its JSON response to 8 MiB, raw HTML to 5 MiB, and markdown to 2 MiB. Enforce the response limit while streaming even if `Content-Length` is absent or misleading. Apply limits before hashing or extraction.
- Re-run URL and public-address approval for a provider-reported final/source URL. Reject an HTTPS-to-HTTP downgrade and never trust unsafe provider metadata.
- Do not persist raw provider error bodies. Map provider configuration, authentication, throttling, availability, unsupported-source, invalid-response, and size errors to the stable taxonomy below.
- Firecrawl is a retrieval fallback, not permission to bypass authentication, cookies, paywalls, source restrictions, or site/platform terms.

### 3.5 OpenAI evidence extraction

- Use the Responses API with a configurable model, strict `text.format` JSON Schema, `store: false`, bounded input/output, one call, and a 30-second timeout.
- Treat retrieved source text as untrusted data and explicitly instruct the model to ignore instructions inside it.
- Every accepted field requires an exact excerpt and locator. Verify the locator and excerpt programmatically against the supplied lines; omit mismatches and mark a usable affected draft `partial_success`.
- Unknown values remain null/empty. Do not infer nutrition, allergens, servings, quantities, or times without explicit evidence.
- Persist only normalized draft fields, review state, confidence, and bounded excerpts. Do not persist full markdown/transcripts or provider error bodies.
- `store: false` disables retrievable response storage; it is not a claim of zero retention. Deployment owners must evaluate OpenAI data controls and model cost.

## 4. Structured extraction

### 4.1 JSON-LD discovery

Inspect `<script type="application/ld+json">` elements in document order. Match the media type case-insensitively and allow parameters. Process at most 50 scripts, 512 KiB per script, 1 MiB total JSON-LD text, nesting depth 20, and 1,000 expanded nodes. Crossing a limit skips JSON-LD and adds `STRUCTURED_DATA_LIMIT_EXCEEDED`; it does not trigger relaxed parsing.

For each script:

1. Remove a Unicode BOM and surrounding whitespace only.
2. Parse strict JSON. Do not strip comments, trailing commas, JavaScript assignment wrappers, or otherwise repair it.
3. Traverse a root object/array and nested `@graph` arrays in document order.
4. An eligible node has `@type` equal to `Recipe` or an array containing `Recipe`. Also accept `https://schema.org/Recipe` and `http://schema.org/Recipe`. Do not interpret custom context aliases in v1.

A malformed block adds `JSON_LD_MALFORMED` with its script index, then discovery continues. Valid blocks are not discarded because another block is malformed.

### 4.2 Candidate selection

Score each eligible Recipe node without combining fields across nodes:

| Evidence | Points |
|---|---:|
| non-empty `recipeIngredient` list | 4 |
| at least one supported `recipeInstructions` step | 4 |
| non-empty `name` | 2 |
| non-empty `recipeYield` | 1 |
| any valid ISO-8601 `prepTime`, `cookTime`, or `totalTime` | 1 |
| non-empty `author` or `publisher` name | 1 |
| usable HTTP(S) `image` URL | 1 |

An eligible candidate needs a non-empty name plus at least one ingredient or one step. Select the highest score; break ties by script order, then node traversal order. Record `MULTIPLE_RECIPE_CANDIDATES` if more than one is eligible. Do not merge recipes, ratings, breadcrumbs, or unrelated `HowTo` nodes.

### 4.3 Supported fields

- `name`: string only.
- `recipeYield`: first non-empty scalar string or number; preserve it as display text. Parse a servings count only for `N`, `N serving(s)`, `serves N`, or `makes N`, case-insensitively. Do not parse ranges.
- `prepTime`, `cookTime`, `totalTime`: accept the case-sensitive subset `^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$`, with at least one captured component. Reject years, calendar months, weeks, signs, fractions, and an empty `P`/`PT`. Preserve source text and expose checked integer seconds; reject values whose total exceeds `2,147,483,647` seconds. Invalid values are preserved as evidence but return no duration and add `DURATION_UNPARSED`.
- `recipeIngredient`: array of strings. Ignore non-string members with `INGREDIENT_ENTRY_UNSUPPORTED`.
- `recipeInstructions`: accept a string; an array of strings; `HowToStep` objects with string `text`; `HowToSection` objects with a string `name` and supported `itemListElement`; or an `ItemList`/plain object with supported `itemListElement`. Preserve section names. For a plain string, split only on two or more non-empty newline-separated lines; otherwise retain one step. Never split sentences heuristically.
- `author`/`publisher`: a string, an object with string `name`, or an array from which the first supported name is used.
- `image`: a URL string, an object with string `url` or `contentUrl`, or an array from which the first usable URL is used. Resolve relative URLs against the final response URL. A usable value passes the syntactic URL/host/port checks in section 3.1; it is still unapproved network input. Record it for source review only. Do not fetch it, render it directly from a client, proxy it, cache it, or approve it as an instructional visual until a separate media pipeline has repeated the address checks and established rights.
- HTML in a supported text value is converted to text with HTML parsing, then normalized as below. Scripts/styles are discarded.

### 4.4 Conservative HTML fallback

Fallback is allowed only when no eligible JSON-LD candidate exists. It must use schema.org Recipe microdata, never visual layout or arbitrary prose:

1. Find elements with both `itemscope` and an `itemtype` token of `https://schema.org/Recipe` or `http://schema.org/Recipe`.
2. Treat nested Recipe scopes separately. Select using the JSON-LD score and document-order tie break.
3. Read only descendants belonging to that scope with exact `itemprop` tokens: `name`, `recipeYield`, `prepTime`, `cookTime`, `totalTime`, `recipeIngredient`, `recipeInstructions`, `author`, `publisher`, and `image`.
4. Get a value from `content`, then the applicable `datetime`, `href`, or `src`, then rendered text content. Do not include properties inside a nested `itemscope` unless it is the property value being read.
5. Each `recipeInstructions` element is one step. If only one instruction element exists, apply the same newline-only splitting rule as JSON-LD.

Microdata confidence is lower than JSON-LD. Class names, headings, Open Graph, DOM proximity, regular expressions over the page, and paragraph/list guessing are explicitly out of scope. If scoped microdata is absent or ineligible, fail as unsupported.

## 5. Normalization

### 5.1 Text

For every extracted string retain:

- `originalText`: decoded text after markup-to-text conversion and outer trim; internal spacing is otherwise untouched.
- `displayText`: Unicode NFKC, non-breaking spaces changed to spaces, runs of whitespace collapsed to one space, and outer trim.

Reject an empty display value. Limit title/author/section names to 300 Unicode scalar values, each ingredient to 1,000, and each step to 5,000. Exceeding a limit does not silently truncate: omit that value and add `TEXT_LIMIT_EXCEEDED`. Limit the normalized recipe to 500 ingredients and 500 steps.

### 5.2 Ingredients

Always preserve `originalText` and `displayText`. Parse only a leading quantity and immediately following allowlisted unit. Never convert units or infer a quantity.

Accepted leading quantities are:

- integer or ASCII decimal (`2`, `1.5`);
- simple fraction (`1/2`) with a non-zero denominator;
- mixed number separated by whitespace (`1 1/2`);
- one Unicode vulgar fraction (`½`, `⅓`, `⅔`, `¼`, `¾`, `⅛`, `⅜`, `⅝`, `⅞`), optionally after an integer;
- a range of two supported quantities separated by `-`, `–`, or the word `to`.

Store numeric values as canonical decimal strings without floating-point conversion; repeating fractions use the original rational form in `sourceText` and a canonical `numerator`/`denominator` pair. A range stores `min` and `max`. Reject a reversed range.

The v1 unit allowlist and canonical forms are:

| Canonical | Accepted tokens (case-insensitive; optional trailing period) |
|---|---|
| `teaspoon` | `tsp`, `teaspoon`, `teaspoons` |
| `tablespoon` | `tbsp`, `tablespoon`, `tablespoons` |
| `cup` | `cup`, `cups` |
| `milliliter` | `ml`, `milliliter`, `milliliters`, `millilitre`, `millilitres` |
| `liter` | `l`, `liter`, `liters`, `litre`, `litres` |
| `gram` | `g`, `gram`, `grams` |
| `kilogram` | `kg`, `kilogram`, `kilograms` |
| `ounce` | `oz`, `ounce`, `ounces` |
| `pound` | `lb`, `lbs`, `pound`, `pounds` |
| `piece` | `piece`, `pieces`, `pc`, `pcs` |
| `clove` | `clove`, `cloves` |
| `can` | `can`, `cans` |
| `pinch` | `pinch`, `pinches` |
| `bunch` | `bunch`, `bunches` |

After removing a parsed prefix, split the remaining text on its first comma. The portion before it is `ingredientText`; the trimmed portion after it is `preparationNote`. If the ingredient portion would be empty, undo the split and leave parsing absent. Do not map the ingredient to a canonical food database in this milestone.

An absent quantity adds `QUANTITY_MISSING`. After a quantity, the exact case-insensitive tokens `tspn`, `tbs`, `tblsp`, `gm`, `gms`, `kgs`, `mls`, `ltr`, and `ltrs` are treated as unit-like but unsupported: leave the whole remainder as `ingredientText`, set `unit` null, and add `UNIT_UNRECOGNIZED`. Any other non-allowlisted token begins the ingredient name without a unit warning (`2 onions` is not a unit error). These warnings invite homeowner review; they do not fabricate data or necessarily make the whole import partial.

### 5.3 Steps

Preserve source order, original/display text, and section. Number normalized steps from 1. Do not summarize, reorder, combine, or derive ingredients/actions from prose. A valid ISO duration explicitly attached to a `HowToStep` may populate `duration`; times mentioned inside prose are not parsed in v1.

## 6. Evidence, confidence, and warnings

Every recipe-level scalar, ingredient, and step has one or more evidence entries:

```json
{
  "method": "json_ld",
  "locator": "script[0]#/@graph/1/recipeIngredient/0",
  "sourceText": "1 cup spinach",
  "sourceTextSha256": "lowercase-hex-sha256"
}
```

`sourceText` is capped at 240 Unicode scalar values for display; the hash is computed over the full UTF-8 original text. A locator is a JSON pointer-like path for JSON-LD or a stable element/property ordinal for microdata. Locators are diagnostic evidence, not CSS selectors to replay against a changed page.

Confidence is deterministic extraction confidence, not truth probability:

- direct supported JSON-LD scalar/list value: `0.95`;
- supported Recipe microdata value: `0.75`;
- parsed quantity or unit: source confidence minus `0.05`;
- unparsed optional field: `0.50` when source text exists, otherwise absent;
- recipe confidence: the minimum confidence of present title, ingredient-list, and step-list fields; for a missing core list use `0.00`.

Warnings have `{code, severity, fieldPath, message, evidence[]}`. `severity` is `info`, `warning`, or `error`. Messages are stable, plain-English UI defaults; product translations key off `code`, not message text. Sort warnings by discovery stage, then document position, then code. Preserve duplicates when separate fields have the same warning. Do not lower confidence ad hoc: use only the rules above.

The warning catalog is closed for v1:

| Code | Severity | Stable default message |
|---|---|---|
| `SOURCE_USES_HTTP` | warning | `The source does not use a secure connection.` |
| `CHARSET_REPLACEMENT` | warning | `Some source characters could not be decoded exactly.` |
| `STRUCTURED_DATA_LIMIT_EXCEEDED` | warning | `The page's structured recipe data exceeded safe limits.` |
| `JSON_LD_MALFORMED` | warning | `One structured-data block could not be read.` |
| `MULTIPLE_RECIPE_CANDIDATES` | warning | `The page contains multiple recipes; the best-supported one was selected.` |
| `INGREDIENT_ENTRY_UNSUPPORTED` | warning | `An ingredient entry used an unsupported format and was skipped.` |
| `DURATION_UNPARSED` | warning | `A recipe time could not be read and needs review.` |
| `TEXT_LIMIT_EXCEEDED` | error | `A recipe field exceeded the safe text limit and was skipped.` |
| `QUANTITY_MISSING` | warning | `This ingredient has no extracted quantity.` |
| `UNIT_UNRECOGNIZED` | warning | `This ingredient's unit was not recognized.` |
| `CORE_FIELD_MISSING` | error | `The draft is missing ingredients or cooking steps.` |
| `CANONICAL_URL_IGNORED` | info | `The page's preferred source URL was ignored because it was not eligible.` |

Use the narrowest JSON-style `fieldPath`: for example `/recipe/ingredients/1/quantity`, `/recipe/steps`, or `/source/canonicalUrl`. Implementations may add a code only by updating this contract and its fixtures.

## 7. Result envelope and classification

The fetch envelope stores provider (`direct` or `firecrawl`), `requestedUrl`, normalized `finalUrl`, redirect count, response media type, fetch timestamp, and SHA-256 of decoded body bytes. The deterministic extraction result excludes job IDs and timestamps and has this logical shape:

```text
contractVersion, extractorVersion
status: success | partial_success | failure
reviewState: needs_review | not_created
source: requestedUrl, finalUrl, canonicalUrl, title, author, publisher,
        imageUrl, method, retrievalProvider, contentSha256
recipe: title, yield, servings, prepTime, cookTime, totalTime, ingredients[], steps[]
confidence: 0..1
warnings[]
failure: null | { code, stage, retryable, message }
```

Within that shape:

- recipe `title`/`yield` and source `title`/`author`/`publisher` are text fields shaped `{originalText, displayText, confidence, evidence[]}`;
- each recipe time is null or `{sourceText, seconds, confidence, evidence[]}`;
- each ingredient is `{order, originalText, displayText, quantity, unit, ingredientText, preparationNote, confidence, evidence[]}`;
- an exact decimal quantity is `{kind:"exact", decimal, sourceText, confidence}` and an exact fraction is `{kind:"exact", numerator, denominator, sourceText, confidence}`; mixed numbers are reduced to one fraction;
- a range is `{kind:"range", min:<exact quantity without kind/sourceText/confidence>, max:<same>, sourceText, confidence}`;
- a unit is `{canonical, sourceText, confidence}`;
- each step is `{order, section, originalText, displayText, duration, confidence, evidence[]}`, where `duration` uses the recipe-time shape;
- absent optional scalar values are `null`, absent lists are `[]`, and no property is silently omitted from the persisted normalized result;
- `source.method` is `json_ld` or `microdata`; `source.retrievalProvider` is `direct` or `firecrawl`; `failure` is null on both non-failure statuses;
- `extractorVersion` is an immutable deployed parser identifier supplied by the implementation, not a floating package version.

Fixture `.expected.json` files use a test projection: `match` means recursive subset matching, `warningCodes` is the ordered warning-code list (including duplicates), and `evidenceLocator` matches the single required evidence entry's locator. Production results use the full structures above.

`canonicalUrl` defaults to `finalUrl`. A page `<link rel="canonical">` may replace it only when it resolves to HTTP(S), has no credentials, and has the same ASCII hostname as `finalUrl`; it is never fetched. Otherwise add `CANONICAL_URL_IGNORED`. Preserve final URL, page title/recipe name, author/publisher, extraction method, and body hash for attribution. The homeowner UI must show a link to the source and label the result as an unreviewed draft.

Classify deterministically:

- `success`: title, at least one valid ingredient, and at least one valid step are present. Missing yield, times, images, and some ingredient quantities remain warnings.
- `partial_success`: an eligible candidate has a title and exactly one of the two core lists (ingredients or steps). Create a `needs_review` draft and add `CORE_FIELD_MISSING` for the absent list. Never assign or publish it without homeowner correction.
- `failure`: unsafe/fetch/content failure, or no eligible candidate. `recipe` is null, `reviewState` is `not_created`, and no inferred content is returned.

If both core lists are missing, fail `UNSUPPORTED_RECIPE_PAGE` even when a title is present. An unexpected internal exception returns `IMPORT_INTERNAL_ERROR` without leaking details.

### Failure taxonomy

| Code | Stage | Retryable | Stable default message |
|---|---|---:|---|
| `URL_INVALID` | validate_url | no | `Enter a valid public webpage URL.` |
| `SCHEME_UNSUPPORTED` | validate_url | no | `Only HTTP and HTTPS webpage links are supported.` |
| `URL_CREDENTIALS_FORBIDDEN` | validate_url | no | `Links containing sign-in details are not supported.` |
| `HOST_FORBIDDEN` | validate_url | no | `This host is not eligible for public webpage import.` |
| `PORT_FORBIDDEN` | validate_url | no | `This link uses an unsupported network port.` |
| `DNS_FAILED` | resolve | yes | `The source host could not be reached. Try again later.` |
| `ADDRESS_FORBIDDEN` | resolve | no | `This link does not resolve to an eligible public address.` |
| `DNS_MIXED_ADDRESS_SPACE` | resolve | no | `This host returned an unsafe mixture of network addresses.` |
| `SSRF_BLOCKED_REDIRECT` | redirect | no | `The source redirected to an ineligible network address.` |
| `INSECURE_REDIRECT` | redirect | no | `The source redirected from HTTPS to an insecure link.` |
| `REDIRECT_LIMIT` | redirect | no | `The source redirected too many times.` |
| `FETCH_TIMEOUT` | fetch | yes | `The source took too long to respond. Try again later.` |
| `FETCH_RATE_LIMITED` | fetch | yes | `The source is temporarily limiting requests. Try again later.` |
| `FETCH_UPSTREAM_ERROR` | fetch | yes | `The source is temporarily unavailable. Try again later.` |
| `FETCH_CLIENT_ERROR` | fetch | no | `The source did not allow this page to be imported.` |
| `HEADERS_TOO_LARGE` | fetch | no | `The source response headers exceeded safe limits.` |
| `BODY_TOO_LARGE` | fetch | no | `The source page exceeded the import size limit.` |
| `CONTENT_TYPE_UNSUPPORTED` | decode | no | `This link is not a supported HTML webpage.` |
| `CONTENT_ENCODING_UNSUPPORTED` | decode | no | `The source used an unsupported content encoding.` |
| `CHARSET_UNSUPPORTED` | decode | no | `The source used an unsupported text encoding.` |
| `UNSUPPORTED_RECIPE_PAGE` | extract | no | `This page does not contain supported structured recipe data.` |
| `FIRECRAWL_NOT_CONFIGURED` | fetch | no | `Automatic fallback is not configured for this source. Enter the recipe manually.` |
| `FIRECRAWL_AUTH_FAILED` | fetch | no | `Automatic fallback is temporarily unavailable. Enter the recipe manually or try again later.` |
| `FIRECRAWL_RATE_LIMITED` | fetch | yes | `Automatic fallback is busy. Try again later or enter the recipe manually.` |
| `FIRECRAWL_UNAVAILABLE` | fetch | yes | `Automatic fallback could not read this source. Try again later or enter the recipe manually.` |
| `FIRECRAWL_UNSUPPORTED_SOURCE` | fetch | no | `This source does not permit automatic import. Enter the recipe manually.` |
| `FIRECRAWL_RESPONSE_INVALID` | fetch or extract | no | `Automatic fallback returned no usable recipe page. Enter the recipe manually.` |
| `FIRECRAWL_CONTENT_TOO_LARGE` | fetch | no | `The fallback recipe page exceeded the import size limit. Enter the recipe manually.` |
| `YOUTUBE_URL_UNSUPPORTED` | validate_url | no | `Enter one public YouTube video link (watch, share, or Shorts).` |
| `TRANSCRIPT_UNAVAILABLE` | extract | no | `This video has no usable transcript. Enter the recipe manually.` |
| `OPENAI_NOT_CONFIGURED` | extract | no | `AI-assisted extraction is not configured. Enter the recipe manually.` |
| `OPENAI_AUTH_FAILED` | extract | no | `AI-assisted extraction is temporarily unavailable. Enter the recipe manually.` |
| `OPENAI_RATE_LIMITED` | extract | yes | `AI-assisted extraction is busy. Try again later or enter the recipe manually.` |
| `OPENAI_TIMEOUT` | extract | yes | `AI-assisted extraction took too long. Try again or enter the recipe manually.` |
| `OPENAI_UNAVAILABLE` | extract | yes | `AI-assisted extraction is temporarily unavailable. Try again or enter the recipe manually.` |
| `OPENAI_RESPONSE_INVALID` | extract | no | `AI-assisted extraction returned no supported recipe evidence. Enter the recipe manually.` |
| `OPENAI_INPUT_TOO_LARGE` | extract | no | `This source is too long for AI-assisted extraction. Enter the recipe manually.` |
| `IDEMPOTENCY_CONFLICT` | persist | no | `This import request key was already used for a different link.` |
| `IMPORT_INTERNAL_ERROR` | any | yes | `The recipe could not be imported because of an internal error.` |

For a redirect, resolve the `Location` value against the current URL, then check URL validity, credentials, host and port, HTTPS downgrade, and finally DNS/address policy, in that order. If multiple rules apply, return the first failure in that sequence. A redirect to a private address over HTTPS is `SSRF_BLOCKED_REDIRECT` rather than the initial-request `ADDRESS_FORBIDDEN`.

## 8. Idempotency and persistence

- Accept a caller-generated idempotency key scoped to household and creator. Repeating the same key and same normalized request URL returns the same job/result; reusing it with different input is `IDEMPOTENCY_CONFLICT`.
- A fetch attempt identity is SHA-256 of `contractVersion + extractorVersion + normalizedFinalUrl + decodedBodySha256` using length-delimited UTF-8 components.
- Given identical identity and fixture configuration, extraction output must be byte-identical after canonical JSON serialization (UTF-8, object keys sorted, array order preserved, no insignificant whitespace). Fetch timestamps and operational IDs live outside that deterministic payload.
- Retries may replace a failed attempt but must not create duplicate recipe drafts, versions, warnings, notifications, or audit events. Persist a result and its draft linkage transactionally with a unique attempt identity.
- A later body hash is a new attempt. It may create a new draft only after explicit user import/retry; it never mutates a published recipe version.
- Store the minimal source artifact needed for review and debugging under the product retention policy. Never store credentials, cookies, or authenticated content. The normalized result, evidence hashes, attribution, and extractor/contract versions must outlive raw-body deletion.

## 9. Fixture conformance

`test/fixtures/recipe-import/manifest.json` is the index. HTML fixtures are synthetic and may be used freely in tests. Parser tests inject their bytes **after** the network boundary, so their reserved `.test` source URLs must not be fetched. URL-policy cases are evaluated before any network call; DNS and redirect cases use injected resolver/transport outcomes.

A conforming implementation must:

1. parse every JSON file;
2. produce the corresponding `.expected.json` status, selected values, warning codes, method, and evidence locators;
3. reject every URL-policy case at the stated stage/code or reach the stated injected decision;
4. perform no external network call in fixture tests;
5. prove repeated extraction of the same fixture is canonically byte-identical.

Expected files intentionally assert contract-relevant fields rather than database IDs or timestamps. Their `match` value means the implementation result must contain those values; additional fields are allowed only when this contract defines them.
