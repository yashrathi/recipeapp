import {
  IMPORT_CONTRACT_VERSION,
  IMPORT_EXTRACTOR_VERSION,
  createWarning,
  importFailureResult,
  sha256,
  type DurationField,
  type ExactQuantity,
  type ExtractionEvidence,
  type ImportResult,
  type ImportWarning,
  type NormalizedIngredient,
  type NormalizedRecipe,
  type NormalizedStep,
  type NormalizedUnit,
  type Quantity,
  type TextField,
} from "@/domain/import/types";
import {
  attributeTokens,
  elementText,
  htmlValueToText,
  parseHtml,
  walkElements,
  type HtmlElement,
} from "@/server/import/html";
import { validateImportUrl } from "@/server/import/url-policy";

interface RawValue {
  value: string;
  locator: string;
}

interface RawStep extends RawValue {
  section: string | null;
  duration: RawValue | null;
}

interface RawCandidate {
  method: "json_ld" | "microdata";
  confidence: 0.95 | 0.75;
  order: number;
  name: RawValue | null;
  recipeYield: RawValue | null;
  prepTime: RawValue | null;
  cookTime: RawValue | null;
  totalTime: RawValue | null;
  ingredients: RawValue[];
  steps: RawStep[];
  author: RawValue | null;
  publisher: RawValue | null;
  image: RawValue | null;
  warnings: ImportWarning[];
}

export interface ExtractPageInput {
  requestedUrl: string;
  finalUrl: string;
  contentSha256: string;
  html: string;
  retrievalProvider?: "direct" | "firecrawl";
  initialWarnings?: ImportWarning[];
}

function normalizedDisplay(value: string): string {
  return value.normalize("NFKC").replace(/\u00a0/g, " ").replace(/\s+/gu, " ").trim();
}

function normalizedOriginal(value: string): string {
  return htmlValueToText(value).trim();
}

function cappedSourceText(value: string): string {
  return Array.from(value).slice(0, 240).join("");
}

function evidence(method: RawCandidate["method"], raw: RawValue): ExtractionEvidence {
  const original = normalizedOriginal(raw.value);
  return {
    method,
    locator: raw.locator,
    sourceText: cappedSourceText(original),
    sourceTextSha256: sha256(original),
  };
}

function textField(
  candidate: RawCandidate,
  raw: RawValue | null,
  limit: number,
  fieldPath: string,
  warnings: ImportWarning[],
): TextField | null {
  if (!raw) return null;
  const originalText = normalizedOriginal(raw.value);
  const displayText = normalizedDisplay(originalText);
  if (!displayText) return null;
  const itemEvidence = evidence(candidate.method, raw);
  if (Array.from(displayText).length > limit) {
    warnings.push(createWarning("TEXT_LIMIT_EXCEEDED", fieldPath, [itemEvidence]));
    return null;
  }
  return {
    originalText,
    displayText,
    confidence: candidate.confidence,
    evidence: [itemEvidence],
  };
}

function parseDurationSeconds(value: string): number | null {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!match || !match.slice(1).some((part) => part !== undefined)) return null;
  const [days, hours, minutes, seconds] = match.slice(1).map((part) => BigInt(part ?? 0));
  const total = days! * 86_400n + hours! * 3_600n + minutes! * 60n + seconds!;
  return total > 2_147_483_647n ? null : Number(total);
}

function durationField(
  candidate: RawCandidate,
  raw: RawValue | null,
  fieldPath: string,
  warnings: ImportWarning[],
): DurationField | null {
  if (!raw || typeof raw.value !== "string") return null;
  const sourceText = normalizedOriginal(raw.value);
  const itemEvidence = evidence(candidate.method, raw);
  const seconds = parseDurationSeconds(sourceText);
  if (seconds === null) {
    warnings.push(createWarning("DURATION_UNPARSED", fieldPath, [itemEvidence]));
    return null;
  }
  return { sourceText, seconds, confidence: candidate.confidence, evidence: [itemEvidence] };
}

function supportedType(value: unknown, expected: string): boolean {
  const types = Array.isArray(value) ? value : [value];
  return types.some(
    (type) =>
      type === expected ||
      type === `https://schema.org/${expected}` ||
      type === `http://schema.org/${expected}`,
  );
}

function scalar(value: unknown, locator: string): RawValue | null {
  if (typeof value === "string") return { value, locator };
  if (typeof value === "number" && Number.isFinite(value)) return { value: String(value), locator };
  return null;
}

function firstScalar(value: unknown, locator: string): RawValue | null {
  if (!Array.isArray(value)) {
    const found = scalar(value, locator);
    return found && normalizedDisplay(normalizedOriginal(found.value)) ? found : null;
  }
  for (let index = 0; index < value.length; index += 1) {
    const found = scalar(value[index], `${locator}/${index}`);
    if (found && normalizedDisplay(normalizedOriginal(found.value))) return found;
  }
  return null;
}

function namedValue(value: unknown, locator: string): RawValue | null {
  if (typeof value === "string") return { value, locator };
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = namedValue(value[index], `${locator}/${index}`);
      if (found) return found;
    }
  }
  if (value && typeof value === "object" && typeof (value as Record<string, unknown>).name === "string") {
    return { value: (value as Record<string, string>).name!, locator: `${locator}/name` };
  }
  return null;
}

function imageValue(value: unknown, locator: string): RawValue | null {
  if (typeof value === "string") return { value, locator };
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = imageValue(value[index], `${locator}/${index}`);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (typeof object.url === "string") return { value: object.url, locator: `${locator}/url` };
    if (typeof object.contentUrl === "string") {
      return { value: object.contentUrl, locator: `${locator}/contentUrl` };
    }
  }
  return null;
}

function splitInstructionString(value: string, locator: string, section: string | null): RawStep[] {
  const lines = value.split(/\r?\n/).filter((line) => normalizedDisplay(line));
  if (lines.length < 2) return [{ value, locator, section, duration: null }];
  return lines.map((line, index) => ({
    value: line,
    locator: `${locator}#line/${index}`.replace("##", "#"),
    section,
    duration: null,
  }));
}

function jsonSteps(value: unknown, locator: string, section: string | null = null): RawStep[] {
  if (typeof value === "string") return splitInstructionString(value, locator, section);
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => jsonSteps(entry, `${locator}/${index}`, section));
  }
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  if (supportedType(object["@type"], "HowToStep")) {
    if (typeof object.text !== "string") return [];
    const duration = typeof object.duration === "string" ? { value: object.duration, locator: `${locator}/duration` } : null;
    return [{ value: object.text, locator: `${locator}/text`, section, duration }];
  }
  if (supportedType(object["@type"], "HowToSection")) {
    const sectionName = typeof object.name === "string" ? object.name : null;
    return jsonSteps(object.itemListElement, `${locator}/itemListElement`, sectionName);
  }
  if ("itemListElement" in object) {
    return jsonSteps(object.itemListElement, `${locator}/itemListElement`, section);
  }
  return [];
}

function usableImage(raw: RawValue | null, finalUrl: string): RawValue | null {
  if (!raw) return null;
  try {
    const resolved = new URL(raw.value, finalUrl);
    validateImportUrl(resolved.href);
    return { ...raw, value: resolved.href };
  } catch {
    return null;
  }
}

function candidateScore(candidate: RawCandidate, finalUrl: string): number {
  let score = 0;
  if (candidate.ingredients.length > 0) score += 4;
  if (candidate.steps.length > 0) score += 4;
  if (candidate.name && normalizedDisplay(normalizedOriginal(candidate.name.value))) score += 2;
  if (candidate.recipeYield && normalizedDisplay(normalizedOriginal(candidate.recipeYield.value))) score += 1;
  if ([candidate.prepTime, candidate.cookTime, candidate.totalTime].some((time) => time && parseDurationSeconds(time.value) !== null)) score += 1;
  if (candidate.author || candidate.publisher) score += 1;
  if (usableImage(candidate.image, finalUrl)) score += 1;
  return score;
}

function eligible(candidate: RawCandidate): boolean {
  return Boolean(
    candidate.name &&
      normalizedDisplay(normalizedOriginal(candidate.name.value)) &&
      (candidate.ingredients.length > 0 || candidate.steps.length > 0),
  );
}

function countJson(value: unknown, depth = 0): { nodes: number; tooDeep: boolean } {
  if (depth > 20) return { nodes: 0, tooDeep: true };
  if (!value || typeof value !== "object") return { nodes: 0, tooDeep: false };
  let nodes = 1;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const measured = countJson(child, depth + 1);
    nodes += measured.nodes;
    if (measured.tooDeep || nodes > 1_000) return { nodes, tooDeep: measured.tooDeep };
  }
  return { nodes, tooDeep: false };
}

function jsonCandidates(
  document: HtmlElement,
): { candidates: RawCandidate[]; warnings: ImportWarning[] } {
  const warnings: ImportWarning[] = [];
  const scripts = walkElements(document).filter((element) => {
    if (element.tagName !== "script") return false;
    return element.attributes.type?.split(";", 1)[0]?.trim().toLowerCase() === "application/ld+json";
  });
  if (scripts.length > 50) {
    return {
      candidates: [],
      warnings: [createWarning("STRUCTURED_DATA_LIMIT_EXCEEDED", "/source/structuredData")],
    };
  }
  let totalBytes = 0;
  let expandedNodes = 0;
  const parsed: { value: unknown; scriptIndex: number }[] = [];
  for (let scriptIndex = 0; scriptIndex < scripts.length; scriptIndex += 1) {
    const scriptText = scripts[scriptIndex]!.children
      .filter((node) => node.type === "text")
      .map((node) => node.value)
      .join("");
    const byteLength = Buffer.byteLength(scriptText, "utf8");
    totalBytes += byteLength;
    if (byteLength > 512 * 1024 || totalBytes > 1024 * 1024) {
      return {
        candidates: [],
        warnings: [...warnings, createWarning("STRUCTURED_DATA_LIMIT_EXCEEDED", "/source/structuredData")],
      };
    }
    const strictText = scriptText.replace(/^\ufeff/, "").trim();
    try {
      const value: unknown = JSON.parse(strictText);
      const measured = countJson(value);
      expandedNodes += measured.nodes;
      if (measured.tooDeep || expandedNodes > 1_000) {
        return {
          candidates: [],
          warnings: [...warnings, createWarning("STRUCTURED_DATA_LIMIT_EXCEEDED", "/source/structuredData")],
        };
      }
      parsed.push({ value, scriptIndex });
    } catch {
      const raw = { value: scriptText, locator: `script[${scriptIndex}]` };
      warnings.push(createWarning("JSON_LD_MALFORMED", "/source/structuredData", [evidence("json_ld", raw)]));
    }
  }

  const candidates: RawCandidate[] = [];
  const visit = (value: unknown, scriptIndex: number, path: string) => {
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, scriptIndex, `${path}/${index}`));
      return;
    }
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    if (supportedType(object["@type"], "Recipe")) {
      const prefix = `script[${scriptIndex}]#${path}`;
      const ingredientWarnings: ImportWarning[] = [];
      const ingredients: RawValue[] = [];
      if (Array.isArray(object.recipeIngredient)) {
        object.recipeIngredient.forEach((entry, index) => {
          const locator = `${prefix}/recipeIngredient/${index}`;
          if (typeof entry === "string") ingredients.push({ value: entry, locator });
          else ingredientWarnings.push(createWarning("INGREDIENT_ENTRY_UNSUPPORTED", `/recipe/ingredients/${index}`, []));
        });
      }
      candidates.push({
        method: "json_ld",
        confidence: 0.95,
        order: candidates.length,
        name: typeof object.name === "string" ? { value: object.name, locator: `${prefix}/name` } : null,
        recipeYield: firstScalar(object.recipeYield, `${prefix}/recipeYield`),
        prepTime: typeof object.prepTime === "string" ? { value: object.prepTime, locator: `${prefix}/prepTime` } : null,
        cookTime: typeof object.cookTime === "string" ? { value: object.cookTime, locator: `${prefix}/cookTime` } : null,
        totalTime: typeof object.totalTime === "string" ? { value: object.totalTime, locator: `${prefix}/totalTime` } : null,
        ingredients,
        steps: jsonSteps(object.recipeInstructions, `${prefix}/recipeInstructions`),
        author: namedValue(object.author, `${prefix}/author`),
        publisher: namedValue(object.publisher, `${prefix}/publisher`),
        image: imageValue(object.image, `${prefix}/image`),
        warnings: ingredientWarnings,
      });
    }
    if (Array.isArray(object["@graph"])) {
      object["@graph"].forEach((child, index) => visit(child, scriptIndex, `${path}/@graph/${index}`));
    }
  };
  parsed.forEach(({ value, scriptIndex }) => visit(value, scriptIndex, ""));
  return { candidates: candidates.filter(eligible), warnings };
}

const microdataProperties = new Set([
  "name",
  "recipeYield",
  "prepTime",
  "cookTime",
  "totalTime",
  "recipeIngredient",
  "recipeInstructions",
  "author",
  "publisher",
  "image",
]);

function isRecipeScope(element: HtmlElement): boolean {
  return (
    "itemscope" in element.attributes &&
    attributeTokens(element, "itemtype").some(
      (token) => token === "https://schema.org/Recipe" || token === "http://schema.org/Recipe",
    )
  );
}

function microdataValue(element: HtmlElement, property: string): string {
  if (element.attributes.content !== undefined) return element.attributes.content;
  if (["prepTime", "cookTime", "totalTime"].includes(property) && element.attributes.datetime !== undefined) {
    return element.attributes.datetime;
  }
  if (property === "image") {
    return element.attributes.href ?? element.attributes.src ?? elementText(element);
  }
  return elementText(element);
}

function microdataCandidates(document: HtmlElement): RawCandidate[] {
  const scopes = walkElements(document).filter(isRecipeScope);
  return scopes
    .map((scope, scopeIndex): RawCandidate => {
      const values = new Map<string, RawValue[]>();
      const ordinals = new Map<string, number>();
      const visit = (element: HtmlElement) => {
        if (element !== scope && isRecipeScope(element)) return;
        const properties = attributeTokens(element, "itemprop").filter((property) =>
          microdataProperties.has(property),
        );
        for (const property of properties) {
          const ordinal = ordinals.get(property) ?? 0;
          ordinals.set(property, ordinal + 1);
          const raw = {
            value: microdataValue(element, property),
            locator: `recipeScope[${scopeIndex}]/${property}[${ordinal}]`,
          };
          values.set(property, [...(values.get(property) ?? []), raw]);
        }
        if (element !== scope && "itemscope" in element.attributes) return;
        element.children.forEach((child) => {
          if (child.type === "element") visit(child);
        });
      };
      visit(scope);
      const one = (name: string) => values.get(name)?.[0] ?? null;
      const instructionValues = values.get("recipeInstructions") ?? [];
      const steps =
        instructionValues.length === 1
          ? splitInstructionString(instructionValues[0]!.value, instructionValues[0]!.locator, null)
          : instructionValues.map((raw) => ({ ...raw, section: null, duration: null }));
      return {
        method: "microdata",
        confidence: 0.75,
        order: scopeIndex,
        name: one("name"),
        recipeYield: one("recipeYield"),
        prepTime: one("prepTime"),
        cookTime: one("cookTime"),
        totalTime: one("totalTime"),
        ingredients: values.get("recipeIngredient") ?? [],
        steps,
        author: one("author"),
        publisher: one("publisher"),
        image: one("image"),
        warnings: [],
      };
    })
    .filter(eligible);
}

function selectCandidate(candidates: RawCandidate[], finalUrl: string): RawCandidate | null {
  return [...candidates].sort(
    (left, right) => candidateScore(right, finalUrl) - candidateScore(left, finalUrl) || left.order - right.order,
  )[0] ?? null;
}

const vulgarFractions: Record<string, [number, number]> = {
  "½": [1, 2],
  "⅓": [1, 3],
  "⅔": [2, 3],
  "¼": [1, 4],
  "¾": [3, 4],
  "⅛": [1, 8],
  "⅜": [3, 8],
  "⅝": [5, 8],
  "⅞": [7, 8],
};

interface ParsedExact {
  sourceText: string;
  end: number;
  value: { decimal: string } | { numerator: number; denominator: number };
  rational: [bigint, bigint];
}

function gcd(left: bigint, right: bigint): bigint {
  while (right) [left, right] = [right, left % right];
  return left;
}

function reducedFraction(numerator: bigint, denominator: bigint): [bigint, bigint] {
  const divisor = gcd(numerator, denominator);
  return [numerator / divisor, denominator / divisor];
}

function decimalDetails(source: string): { decimal: string; rational: [bigint, bigint] } {
  const [whole, fraction = ""] = source.split(".");
  const canonicalWhole = BigInt(whole!).toString();
  const trimmedFraction = fraction.replace(/0+$/, "");
  const decimal = trimmedFraction ? `${canonicalWhole}.${trimmedFraction}` : canonicalWhole;
  const denominator = 10n ** BigInt(fraction.length);
  return { decimal, rational: reducedFraction(BigInt(`${whole}${fraction}`), denominator) };
}

function parsedFraction(sourceText: string, whole: string | undefined, numerator: string, denominator: string, end: number): ParsedExact | null {
  const bottom = BigInt(denominator);
  if (bottom === 0n) return null;
  const top = BigInt(whole ?? 0) * bottom + BigInt(numerator);
  const [reducedTop, reducedBottom] = reducedFraction(top, bottom);
  if (reducedTop <= 0n || reducedTop > BigInt(Number.MAX_SAFE_INTEGER) || reducedBottom > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return {
    sourceText,
    end,
    value: { numerator: Number(reducedTop), denominator: Number(reducedBottom) },
    rational: [reducedTop, reducedBottom],
  };
}

function exactPrefix(input: string): ParsedExact | null {
  const mixed = /^(\d+)\s+(\d+)\/(\d+)/.exec(input);
  if (mixed) return parsedFraction(mixed[0], mixed[1], mixed[2]!, mixed[3]!, mixed[0].length);
  const integerVulgar = /^(\d+)?([½⅓⅔¼¾⅛⅜⅝⅞])/.exec(input);
  if (integerVulgar) {
    const [top, bottom] = vulgarFractions[integerVulgar[2]!]!;
    return parsedFraction(integerVulgar[0], integerVulgar[1], String(top), String(bottom), integerVulgar[0].length);
  }
  const fraction = /^(\d+)\/(\d+)/.exec(input);
  if (fraction) return parsedFraction(fraction[0], undefined, fraction[1]!, fraction[2]!, fraction[0].length);
  const decimal = /^\d+(?:\.\d+)?/.exec(input);
  if (!decimal) return null;
  const details = decimalDetails(decimal[0]);
  if (details.rational[0] <= 0n) return null;
  return { sourceText: decimal[0], end: decimal[0].length, value: { decimal: details.decimal }, rational: details.rational };
}

function compareExact(left: ParsedExact, right: ParsedExact): number {
  const comparison = left.rational[0] * right.rational[1] - right.rational[0] * left.rational[1];
  return comparison < 0n ? -1 : comparison > 0n ? 1 : 0;
}

function quantityPrefix(input: string, confidence: number): { quantity: Quantity; end: number } | null {
  const first = exactPrefix(input);
  if (!first) return null;
  const separator = /^(\s*(?:-|–)\s*|\s+to\s+)/i.exec(input.slice(first.end));
  if (separator) {
    const second = exactPrefix(input.slice(first.end + separator[0].length));
    if (!second || compareExact(first, second) > 0) return null;
    const end = first.end + separator[0].length + second.end;
    return {
      quantity: {
        kind: "range",
        min: first.value,
        max: second.value,
        sourceText: input.slice(0, end),
        confidence,
      },
      end,
    };
  }
  const next = input[first.end];
  if (next && !/\s/.test(next)) return null;
  const quantity: ExactQuantity = {
    kind: "exact",
    ...first.value,
    sourceText: first.sourceText,
    confidence,
  } as ExactQuantity;
  return { quantity, end: first.end };
}

const units: [NormalizedUnit["canonical"], string[]][] = [
  ["teaspoon", ["teaspoons", "teaspoon", "tsp"]],
  ["tablespoon", ["tablespoons", "tablespoon", "tbsp"]],
  ["milliliter", ["milliliters", "millilitres", "milliliter", "millilitre", "ml"]],
  ["kilogram", ["kilograms", "kilogram", "kg"]],
  ["ounce", ["ounces", "ounce", "oz"]],
  ["pound", ["pounds", "pound", "lbs", "lb"]],
  ["piece", ["pieces", "piece", "pcs", "pc"]],
  ["clove", ["cloves", "clove"]],
  ["pinch", ["pinches", "pinch"]],
  ["bunch", ["bunches", "bunch"]],
  ["liter", ["liters", "litres", "liter", "litre", "l"]],
  ["gram", ["grams", "gram", "g"]],
  ["cup", ["cups", "cup"]],
  ["can", ["cans", "can"]],
];

function parsedUnit(input: string, confidence: number): { unit: NormalizedUnit; end: number } | null {
  for (const [canonical, tokens] of units) {
    for (const token of tokens) {
      const match = new RegExp(`^(${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.?)(?=\\s|$)`, "i").exec(input);
      if (match) return { unit: { canonical, sourceText: match[1]!, confidence }, end: match[0].length };
    }
  }
  return null;
}

function normalizeIngredient(
  candidate: RawCandidate,
  raw: RawValue,
  outputOrder: number,
  warnings: ImportWarning[],
): NormalizedIngredient | null {
  const originalText = normalizedOriginal(raw.value);
  const displayText = normalizedDisplay(originalText);
  const itemEvidence = evidence(candidate.method, raw);
  if (!displayText) return null;
  if (Array.from(displayText).length > 1_000) {
    warnings.push(createWarning("TEXT_LIMIT_EXCEEDED", `/recipe/ingredients/${outputOrder - 1}`, [itemEvidence]));
    return null;
  }
  const quantityInput = originalText.replace(/\u00a0/g, " ").replace(/\s+/gu, " ").trim();
  const parsedConfidence = Number((candidate.confidence - 0.05).toFixed(2));
  const parsedQuantity = quantityPrefix(quantityInput, parsedConfidence);
  let quantity = parsedQuantity?.quantity ?? null;
  let unit: NormalizedUnit | null = null;
  let remainder = quantityInput;
  if (parsedQuantity) {
    remainder = quantityInput.slice(parsedQuantity.end).trimStart();
    const foundUnit = parsedUnit(remainder, parsedConfidence);
    if (foundUnit) {
      unit = foundUnit.unit;
      remainder = remainder.slice(foundUnit.end).trimStart();
    } else {
      const firstToken = /^([^\s.,]+)/.exec(remainder)?.[1]?.replace(/\.$/, "").toLowerCase();
      if (firstToken && new Set(["tspn", "tbs", "tblsp", "gm", "gms", "kgs", "mls", "ltr", "ltrs"]).has(firstToken)) {
        warnings.push(createWarning("UNIT_UNRECOGNIZED", `/recipe/ingredients/${outputOrder - 1}/unit`, [itemEvidence]));
      }
    }
  } else {
    warnings.push(createWarning("QUANTITY_MISSING", `/recipe/ingredients/${outputOrder - 1}/quantity`, [itemEvidence]));
  }

  const comma = remainder.indexOf(",");
  let ingredientText = normalizedDisplay(comma >= 0 ? remainder.slice(0, comma) : remainder);
  let preparationNote = comma >= 0 ? normalizedDisplay(remainder.slice(comma + 1)) || null : null;
  if (!ingredientText) {
    quantity = null;
    unit = null;
    ingredientText = displayText;
    preparationNote = null;
    if (parsedQuantity) warnings.push(createWarning("QUANTITY_MISSING", `/recipe/ingredients/${outputOrder - 1}/quantity`, [itemEvidence]));
  }
  return {
    order: outputOrder,
    originalText,
    displayText,
    quantity,
    unit,
    ingredientText,
    preparationNote,
    confidence: candidate.confidence,
    evidence: [itemEvidence],
  };
}

function normalizeStep(
  candidate: RawCandidate,
  raw: RawStep,
  outputOrder: number,
  warnings: ImportWarning[],
): NormalizedStep | null {
  const originalText = normalizedOriginal(raw.value);
  const displayText = normalizedDisplay(originalText);
  const itemEvidence = evidence(candidate.method, raw);
  if (!displayText) return null;
  if (Array.from(displayText).length > 5_000) {
    warnings.push(createWarning("TEXT_LIMIT_EXCEEDED", `/recipe/steps/${outputOrder - 1}`, [itemEvidence]));
    return null;
  }
  let section = raw.section ? normalizedDisplay(normalizedOriginal(raw.section)) : null;
  if (section && Array.from(section).length > 300) {
    warnings.push(createWarning("TEXT_LIMIT_EXCEEDED", `/recipe/steps/${outputOrder - 1}/section`, [itemEvidence]));
    section = null;
  }
  return {
    order: outputOrder,
    section,
    originalText,
    displayText,
    duration: durationField(candidate, raw.duration, `/recipe/steps/${outputOrder - 1}/duration`, warnings),
    confidence: candidate.confidence,
    evidence: [itemEvidence],
  };
}

function parseServings(value: string | null): number | null {
  if (!value) return null;
  const match = /^(?:([1-9]\d*)|([1-9]\d*)\s+servings?|serves\s+([1-9]\d*)|makes\s+([1-9]\d*))$/i.exec(value.trim());
  return match ? Number(match.slice(1).find(Boolean)) : null;
}

function pageCanonical(document: HtmlElement, finalUrl: string, warnings: ImportWarning[]): string {
  const canonical = walkElements(document).find(
    (element) => element.tagName === "link" && attributeTokens(element, "rel").some((token) => token.toLowerCase() === "canonical"),
  )?.attributes.href;
  if (!canonical) return finalUrl;
  try {
    const resolved = validateImportUrl(new URL(canonical, finalUrl).href);
    const final = new URL(finalUrl);
    if (resolved.hostname !== final.hostname) throw new Error("Cross-host canonical");
    return resolved.href;
  } catch {
    warnings.push(createWarning("CANONICAL_URL_IGNORED", "/source/canonicalUrl"));
    return finalUrl;
  }
}

export function extractRecipePage(input: ExtractPageInput): ImportResult {
  const document = parseHtml(input.html);
  const warnings = [...(input.initialWarnings ?? [])];
  const json = jsonCandidates(document);
  warnings.push(...json.warnings);
  let candidates = json.candidates;
  let candidate = selectCandidate(candidates, input.finalUrl);
  if (!candidate) {
    candidates = microdataCandidates(document);
    candidate = selectCandidate(candidates, input.finalUrl);
  }
  if (!candidate) {
    return importFailureResult(
      input.requestedUrl,
      {
        code: "UNSUPPORTED_RECIPE_PAGE",
        stage: "extract",
        retryable: false,
        message: "This page does not contain supported structured recipe data.",
      },
      {
        finalUrl: input.finalUrl,
        canonicalUrl: pageCanonical(document, input.finalUrl, warnings),
        retrievalProvider: input.retrievalProvider ?? "direct",
        contentSha256: input.contentSha256,
      },
      warnings,
    );
  }
  if (candidates.length > 1) warnings.push(createWarning("MULTIPLE_RECIPE_CANDIDATES", "/recipe"));
  warnings.push(...candidate.warnings);
  const canonicalUrl = pageCanonical(document, input.finalUrl, warnings);

  const title = textField(candidate, candidate.name, 300, "/recipe/title", warnings);
  const recipeYield = textField(candidate, candidate.recipeYield, 300, "/recipe/yield", warnings);
  const author = textField(candidate, candidate.author, 300, "/source/author", warnings);
  const publisher = textField(candidate, candidate.publisher, 300, "/source/publisher", warnings);
  const prepTime = durationField(candidate, candidate.prepTime, "/recipe/prepTime", warnings);
  const cookTime = durationField(candidate, candidate.cookTime, "/recipe/cookTime", warnings);
  const totalTime = durationField(candidate, candidate.totalTime, "/recipe/totalTime", warnings);
  const ingredients = candidate.ingredients
    .slice(0, 500)
    .map((raw, index) => normalizeIngredient(candidate!, raw, index + 1, warnings))
    .filter((value): value is NormalizedIngredient => value !== null)
    .map((ingredient, index) => ({ ...ingredient, order: index + 1 }));
  if (candidate.ingredients.length > 500) warnings.push(createWarning("TEXT_LIMIT_EXCEEDED", "/recipe/ingredients"));
  const steps = candidate.steps
    .slice(0, 500)
    .map((raw, index) => normalizeStep(candidate!, raw, index + 1, warnings))
    .filter((value): value is NormalizedStep => value !== null)
    .map((step, index) => ({ ...step, order: index + 1 }));
  if (candidate.steps.length > 500) warnings.push(createWarning("TEXT_LIMIT_EXCEEDED", "/recipe/steps"));

  if (!title || (ingredients.length === 0 && steps.length === 0)) {
    return importFailureResult(
      input.requestedUrl,
      {
        code: "UNSUPPORTED_RECIPE_PAGE",
        stage: "extract",
        retryable: false,
        message: "This page does not contain supported structured recipe data.",
      },
      {
        finalUrl: input.finalUrl,
        canonicalUrl,
        title,
        author,
        publisher,
        method: candidate.method,
        retrievalProvider: input.retrievalProvider ?? "direct",
        contentSha256: input.contentSha256,
      },
      warnings,
    );
  }

  if (ingredients.length === 0 || steps.length === 0) {
    warnings.push(createWarning("CORE_FIELD_MISSING", ingredients.length === 0 ? "/recipe/ingredients" : "/recipe/steps"));
  }
  const recipe: NormalizedRecipe = {
    title,
    yield: recipeYield,
    servings: parseServings(recipeYield?.displayText ?? null),
    prepTime,
    cookTime,
    totalTime,
    ingredients,
    steps,
  };
  const status = ingredients.length > 0 && steps.length > 0 ? "success" : "partial_success";
  const image = usableImage(candidate.image, input.finalUrl);
  const result: ImportResult = {
    contractVersion: IMPORT_CONTRACT_VERSION,
    extractorVersion: IMPORT_EXTRACTOR_VERSION,
    status,
    reviewState: "needs_review",
    source: {
      sourceType: "web",
      requestedUrl: input.requestedUrl,
      finalUrl: input.finalUrl,
      canonicalUrl,
      title,
      author,
      publisher,
      imageUrl: image?.value ?? null,
      method: candidate.method,
      retrievalProvider: input.retrievalProvider ?? "direct",
      extractionProvider: "deterministic",
      videoId: null,
      transcriptLanguage: null,
      transcriptHasTimestamps: null,
      contentSha256: input.contentSha256,
    },
    recipe,
    confidence: Math.min(title.confidence, ingredients.length ? candidate.confidence : 0, steps.length ? candidate.confidence : 0),
    warnings,
    failure: null,
  };
  return result;
}
