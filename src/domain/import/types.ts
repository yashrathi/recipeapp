import { createHash } from "node:crypto";

export const IMPORT_CONTRACT_VERSION = "web-recipe-import/v1" as const;
export const IMPORT_EXTRACTOR_VERSION = "recipe-app-web-v1.0.0" as const;

export type ImportStage =
  | "validate_url"
  | "resolve"
  | "fetch"
  | "redirect"
  | "decode"
  | "extract"
  | "persist";

export type ImportFailureCode =
  | "URL_INVALID"
  | "SCHEME_UNSUPPORTED"
  | "URL_CREDENTIALS_FORBIDDEN"
  | "HOST_FORBIDDEN"
  | "PORT_FORBIDDEN"
  | "DNS_FAILED"
  | "ADDRESS_FORBIDDEN"
  | "DNS_MIXED_ADDRESS_SPACE"
  | "SSRF_BLOCKED_REDIRECT"
  | "INSECURE_REDIRECT"
  | "REDIRECT_LIMIT"
  | "FETCH_TIMEOUT"
  | "FETCH_RATE_LIMITED"
  | "FETCH_UPSTREAM_ERROR"
  | "FETCH_CLIENT_ERROR"
  | "HEADERS_TOO_LARGE"
  | "BODY_TOO_LARGE"
  | "CONTENT_TYPE_UNSUPPORTED"
  | "CONTENT_ENCODING_UNSUPPORTED"
  | "CHARSET_UNSUPPORTED"
  | "UNSUPPORTED_RECIPE_PAGE"
  | "FIRECRAWL_NOT_CONFIGURED"
  | "FIRECRAWL_AUTH_FAILED"
  | "FIRECRAWL_RATE_LIMITED"
  | "FIRECRAWL_UNAVAILABLE"
  | "FIRECRAWL_UNSUPPORTED_SOURCE"
  | "FIRECRAWL_RESPONSE_INVALID"
  | "FIRECRAWL_CONTENT_TOO_LARGE"
  | "IDEMPOTENCY_CONFLICT"
  | "IMPORT_INTERNAL_ERROR";

const failureMessages: Record<ImportFailureCode, string> = {
  URL_INVALID: "Enter a valid public webpage URL.",
  SCHEME_UNSUPPORTED: "Only HTTP and HTTPS webpage links are supported.",
  URL_CREDENTIALS_FORBIDDEN: "Links containing sign-in details are not supported.",
  HOST_FORBIDDEN: "This host is not eligible for public webpage import.",
  PORT_FORBIDDEN: "This link uses an unsupported network port.",
  DNS_FAILED: "The source host could not be reached. Try again later.",
  ADDRESS_FORBIDDEN: "This link does not resolve to an eligible public address.",
  DNS_MIXED_ADDRESS_SPACE: "This host returned an unsafe mixture of network addresses.",
  SSRF_BLOCKED_REDIRECT: "The source redirected to an ineligible network address.",
  INSECURE_REDIRECT: "The source redirected from HTTPS to an insecure link.",
  REDIRECT_LIMIT: "The source redirected too many times.",
  FETCH_TIMEOUT: "The source took too long to respond. Try again later.",
  FETCH_RATE_LIMITED: "The source is temporarily limiting requests. Try again later.",
  FETCH_UPSTREAM_ERROR: "The source is temporarily unavailable. Try again later.",
  FETCH_CLIENT_ERROR: "The source did not allow this page to be imported.",
  HEADERS_TOO_LARGE: "The source response headers exceeded safe limits.",
  BODY_TOO_LARGE: "The source page exceeded the import size limit.",
  CONTENT_TYPE_UNSUPPORTED: "This link is not a supported HTML webpage.",
  CONTENT_ENCODING_UNSUPPORTED: "The source used an unsupported content encoding.",
  CHARSET_UNSUPPORTED: "The source used an unsupported text encoding.",
  UNSUPPORTED_RECIPE_PAGE: "This page does not contain supported structured recipe data.",
  FIRECRAWL_NOT_CONFIGURED: "Automatic fallback is not configured for this source. Enter the recipe manually.",
  FIRECRAWL_AUTH_FAILED: "Automatic fallback is temporarily unavailable. Enter the recipe manually or try again later.",
  FIRECRAWL_RATE_LIMITED: "Automatic fallback is busy. Try again later or enter the recipe manually.",
  FIRECRAWL_UNAVAILABLE: "Automatic fallback could not read this source. Try again later or enter the recipe manually.",
  FIRECRAWL_UNSUPPORTED_SOURCE: "This source does not permit automatic import. Enter the recipe manually.",
  FIRECRAWL_RESPONSE_INVALID: "Automatic fallback returned no usable recipe page. Enter the recipe manually.",
  FIRECRAWL_CONTENT_TOO_LARGE: "The fallback recipe page exceeded the import size limit. Enter the recipe manually.",
  IDEMPOTENCY_CONFLICT: "This import request key was already used for a different link.",
  IMPORT_INTERNAL_ERROR: "The recipe could not be imported because of an internal error.",
};

export interface ImportFailure {
  code: ImportFailureCode;
  stage: ImportStage | "any";
  retryable: boolean;
  message: string;
}

export class ImportPipelineError extends Error {
  readonly failure: ImportFailure;
  attemptCount = 1;

  constructor(code: ImportFailureCode, stage: ImportStage | "any", retryable: boolean) {
    super(failureMessages[code]);
    this.name = "ImportPipelineError";
    this.failure = { code, stage, retryable, message: failureMessages[code] };
  }
}

export type ImportWarningCode =
  | "SOURCE_USES_HTTP"
  | "CHARSET_REPLACEMENT"
  | "STRUCTURED_DATA_LIMIT_EXCEEDED"
  | "JSON_LD_MALFORMED"
  | "MULTIPLE_RECIPE_CANDIDATES"
  | "INGREDIENT_ENTRY_UNSUPPORTED"
  | "DURATION_UNPARSED"
  | "TEXT_LIMIT_EXCEEDED"
  | "QUANTITY_MISSING"
  | "UNIT_UNRECOGNIZED"
  | "CORE_FIELD_MISSING"
  | "CANONICAL_URL_IGNORED";

const warningDefinitions: Record<
  ImportWarningCode,
  { severity: "info" | "warning" | "error"; message: string }
> = {
  SOURCE_USES_HTTP: {
    severity: "warning",
    message: "The source does not use a secure connection.",
  },
  CHARSET_REPLACEMENT: {
    severity: "warning",
    message: "Some source characters could not be decoded exactly.",
  },
  STRUCTURED_DATA_LIMIT_EXCEEDED: {
    severity: "warning",
    message: "The page's structured recipe data exceeded safe limits.",
  },
  JSON_LD_MALFORMED: {
    severity: "warning",
    message: "One structured-data block could not be read.",
  },
  MULTIPLE_RECIPE_CANDIDATES: {
    severity: "warning",
    message: "The page contains multiple recipes; the best-supported one was selected.",
  },
  INGREDIENT_ENTRY_UNSUPPORTED: {
    severity: "warning",
    message: "An ingredient entry used an unsupported format and was skipped.",
  },
  DURATION_UNPARSED: {
    severity: "warning",
    message: "A recipe time could not be read and needs review.",
  },
  TEXT_LIMIT_EXCEEDED: {
    severity: "error",
    message: "A recipe field exceeded the safe text limit and was skipped.",
  },
  QUANTITY_MISSING: {
    severity: "warning",
    message: "This ingredient has no extracted quantity.",
  },
  UNIT_UNRECOGNIZED: {
    severity: "warning",
    message: "This ingredient's unit was not recognized.",
  },
  CORE_FIELD_MISSING: {
    severity: "error",
    message: "The draft is missing ingredients or cooking steps.",
  },
  CANONICAL_URL_IGNORED: {
    severity: "info",
    message: "The page's preferred source URL was ignored because it was not eligible.",
  },
};

export interface ExtractionEvidence {
  method: "json_ld" | "microdata";
  locator: string;
  sourceText: string;
  sourceTextSha256: string;
}

export interface ImportWarning {
  code: ImportWarningCode;
  severity: "info" | "warning" | "error";
  fieldPath: string;
  message: string;
  evidence: ExtractionEvidence[];
}

export function createWarning(
  code: ImportWarningCode,
  fieldPath: string,
  evidence: ExtractionEvidence[] = [],
): ImportWarning {
  return { code, fieldPath, evidence, ...warningDefinitions[code] };
}

export interface TextField {
  originalText: string;
  displayText: string;
  confidence: number;
  evidence: ExtractionEvidence[];
}

export interface DurationField {
  sourceText: string;
  seconds: number;
  confidence: number;
  evidence: ExtractionEvidence[];
}

export type ExactQuantity =
  | {
      kind: "exact";
      decimal: string;
      sourceText: string;
      confidence: number;
    }
  | {
      kind: "exact";
      numerator: number;
      denominator: number;
      sourceText: string;
      confidence: number;
    };

export type Quantity =
  | ExactQuantity
  | {
      kind: "range";
      min: { decimal: string } | { numerator: number; denominator: number };
      max: { decimal: string } | { numerator: number; denominator: number };
      sourceText: string;
      confidence: number;
    };

export interface NormalizedUnit {
  canonical:
    | "teaspoon"
    | "tablespoon"
    | "cup"
    | "milliliter"
    | "liter"
    | "gram"
    | "kilogram"
    | "ounce"
    | "pound"
    | "piece"
    | "clove"
    | "can"
    | "pinch"
    | "bunch";
  sourceText: string;
  confidence: number;
}

export interface NormalizedIngredient {
  order: number;
  originalText: string;
  displayText: string;
  quantity: Quantity | null;
  unit: NormalizedUnit | null;
  ingredientText: string;
  preparationNote: string | null;
  confidence: number;
  evidence: ExtractionEvidence[];
}

export interface NormalizedStep {
  order: number;
  section: string | null;
  originalText: string;
  displayText: string;
  duration: DurationField | null;
  confidence: number;
  evidence: ExtractionEvidence[];
}

export interface NormalizedRecipe {
  title: TextField;
  yield: TextField | null;
  servings: number | null;
  prepTime: DurationField | null;
  cookTime: DurationField | null;
  totalTime: DurationField | null;
  ingredients: NormalizedIngredient[];
  steps: NormalizedStep[];
}

export interface ImportSource {
  requestedUrl: string;
  finalUrl: string;
  canonicalUrl: string;
  title: TextField | null;
  author: TextField | null;
  publisher: TextField | null;
  imageUrl: string | null;
  method: "json_ld" | "microdata" | null;
  retrievalProvider: "direct" | "firecrawl";
  contentSha256: string | null;
}

export interface ImportResult {
  contractVersion: typeof IMPORT_CONTRACT_VERSION;
  extractorVersion: typeof IMPORT_EXTRACTOR_VERSION;
  status: "success" | "partial_success" | "failure";
  reviewState: "needs_review" | "not_created";
  source: ImportSource;
  recipe: NormalizedRecipe | null;
  confidence: number;
  warnings: ImportWarning[];
  failure: ImportFailure | null;
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

export function importFailureResult(
  requestedUrl: string,
  failure: ImportFailure,
  source?: Partial<ImportSource>,
  warnings: ImportWarning[] = [],
): ImportResult {
  return {
    contractVersion: IMPORT_CONTRACT_VERSION,
    extractorVersion: IMPORT_EXTRACTOR_VERSION,
    status: "failure",
    reviewState: "not_created",
    source: {
      requestedUrl,
      finalUrl: source?.finalUrl ?? requestedUrl,
      canonicalUrl: source?.canonicalUrl ?? source?.finalUrl ?? requestedUrl,
      title: source?.title ?? null,
      author: source?.author ?? null,
      publisher: source?.publisher ?? null,
      imageUrl: source?.imageUrl ?? null,
      method: source?.method ?? null,
      retrievalProvider: source?.retrievalProvider ?? "direct",
      contentSha256: source?.contentSha256 ?? null,
    },
    recipe: null,
    confidence: 0,
    warnings,
    failure,
  };
}
