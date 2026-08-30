import { ImportPipelineError, sha256 } from "@/domain/import/types";
import { getEnvironment } from "@/server/config/env";
import { approveImportUrl, type DnsResolver } from "@/server/import/url-policy";
import { SystemDnsResolver, type FetchedPage } from "@/server/import/fetch";

export const FIRECRAWL_LIMITS = {
  timeoutMs: 30_000,
  responseBytes: 8 * 1024 * 1024,
  rawHtmlBytes: 5 * 1024 * 1024,
  markdownBytes: 2 * 1024 * 1024,
} as const;

type FetchTransport = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface FirecrawlOptions {
  apiKey?: string;
  endpoint?: string;
  resolver?: DnsResolver;
  transport?: FetchTransport;
  now?: () => number;
  timeoutMs?: number;
  zeroDataRetention?: boolean;
}

interface FirecrawlPayload {
  success?: unknown;
  error?: unknown;
  data?: {
    rawHtml?: unknown;
    markdown?: unknown;
    metadata?: {
      sourceURL?: unknown;
      url?: unknown;
      title?: unknown;
      language?: unknown;
    };
  };
}

export interface FirecrawlScrapeResult {
  requestedUrl: string;
  finalUrl: string;
  redirectCount: number;
  fetchedAt: string;
  contentSha256: string;
  attemptCount: number;
  rawHtml: string | null;
  markdown: string | null;
  metadata: {
    sourceUrl: string;
    title: string | null;
    language: string | null;
  };
}

export interface FirecrawlFetchedPage extends FetchedPage {
  markdown: string | null;
  metadata: FirecrawlScrapeResult["metadata"];
}

async function readBoundedText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > FIRECRAWL_LIMITS.responseBytes) {
    throw new ImportPipelineError("FIRECRAWL_CONTENT_TOO_LARGE", "fetch", false);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > FIRECRAWL_LIMITS.responseBytes) {
      await reader.cancel();
      throw new ImportPipelineError("FIRECRAWL_CONTENT_TOO_LARGE", "fetch", false);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function providerError(status: number, payload: FirecrawlPayload | null): ImportPipelineError {
  const detail = typeof payload?.error === "string" ? payload.error.toLowerCase() : "";
  if (/not supported|unsupported (?:site|source|website)|does not permit/.test(detail)) {
    return new ImportPipelineError("FIRECRAWL_UNSUPPORTED_SOURCE", "fetch", false);
  }
  if (status === 401 || status === 403) {
    return new ImportPipelineError("FIRECRAWL_AUTH_FAILED", "fetch", false);
  }
  if (status === 429) {
    return new ImportPipelineError("FIRECRAWL_RATE_LIMITED", "fetch", true);
  }
  if (status === 408 || status === 425 || status >= 500) {
    return new ImportPipelineError("FIRECRAWL_UNAVAILABLE", "fetch", true);
  }
  return new ImportPipelineError("FIRECRAWL_RESPONSE_INVALID", "fetch", false);
}

function parsePayload(text: string): FirecrawlPayload | null {
  try {
    const value = JSON.parse(text) as unknown;
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as FirecrawlPayload
      : null;
  } catch {
    return null;
  }
}

export class FirecrawlPageFetcher {
  private readonly apiKey: string | undefined;
  private readonly endpoint: string;
  private readonly resolver: DnsResolver;
  private readonly transport: FetchTransport;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly zeroDataRetention: boolean;

  constructor(options: FirecrawlOptions = {}) {
    const environment = getEnvironment();
    this.apiKey = options.apiKey ?? environment.FIRECRAWL_API_KEY;
    this.endpoint = options.endpoint ?? environment.FIRECRAWL_API_URL;
    this.resolver = options.resolver ?? new SystemDnsResolver();
    this.transport = options.transport ?? fetch;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? FIRECRAWL_LIMITS.timeoutMs;
    this.zeroDataRetention = options.zeroDataRetention ?? environment.FIRECRAWL_ZERO_DATA_RETENTION;
  }

  async scrape(requestedUrl: string, cancellation?: AbortSignal): Promise<FirecrawlScrapeResult> {
    if (!this.apiKey) {
      throw new ImportPipelineError("FIRECRAWL_NOT_CONFIGURED", "fetch", false);
    }
    let endpoint: URL;
    try {
      endpoint = new URL(this.endpoint);
    } catch {
      throw new ImportPipelineError("FIRECRAWL_NOT_CONFIGURED", "fetch", false);
    }
    if (endpoint.protocol !== "https:") {
      throw new ImportPipelineError("FIRECRAWL_NOT_CONFIGURED", "fetch", false);
    }

    const approved = await approveImportUrl(requestedUrl, this.resolver);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const cancel = () => controller.abort(cancellation?.reason);
    cancellation?.addEventListener("abort", cancel, { once: true });

    try {
      let response: Response;
      try {
        response = await this.transport(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: approved.normalizedUrl,
            formats: ["rawHtml", "markdown"],
            onlyMainContent: true,
            storeInCache: false,
            ...(this.zeroDataRetention ? { zeroDataRetention: true } : {}),
          }),
          cache: "no-store",
          signal: controller.signal,
        });
      } catch {
        if (cancellation?.aborted) throw cancellation.reason;
        throw new ImportPipelineError("FIRECRAWL_UNAVAILABLE", "fetch", true);
      }

      let responseText: string;
      try {
        responseText = await readBoundedText(response);
      } catch (error) {
        if (error instanceof ImportPipelineError) throw error;
        if (cancellation?.aborted) throw cancellation.reason;
        throw new ImportPipelineError("FIRECRAWL_UNAVAILABLE", "fetch", true);
      }
      const payload = parsePayload(responseText);
      if (!response.ok || payload?.success !== true) {
        throw providerError(response.status, payload);
      }

      const rawHtml = payload.data?.rawHtml;
      const markdown = payload.data?.markdown;
      if (
        (typeof rawHtml !== "string" || !rawHtml.trim())
        && (typeof markdown !== "string" || !markdown.trim())
      ) {
        throw new ImportPipelineError("FIRECRAWL_RESPONSE_INVALID", "fetch", false);
      }
      if (typeof rawHtml === "string" && Buffer.byteLength(rawHtml, "utf8") > FIRECRAWL_LIMITS.rawHtmlBytes) {
        throw new ImportPipelineError("FIRECRAWL_CONTENT_TOO_LARGE", "fetch", false);
      }
      if (
        typeof markdown === "string"
        && Buffer.byteLength(markdown, "utf8") > FIRECRAWL_LIMITS.markdownBytes
      ) {
        throw new ImportPipelineError("FIRECRAWL_CONTENT_TOO_LARGE", "fetch", false);
      }

      const reportedUrl = payload.data?.metadata?.sourceURL ?? payload.data?.metadata?.url;
      const finalUrl = typeof reportedUrl === "string" && reportedUrl.trim()
        ? reportedUrl
        : approved.normalizedUrl;
      let approvedFinal;
      try {
        approvedFinal = await approveImportUrl(finalUrl, this.resolver);
      } catch {
        throw new ImportPipelineError("FIRECRAWL_RESPONSE_INVALID", "fetch", false);
      }
      if (approved.url.protocol === "https:" && approvedFinal.url.protocol !== "https:") {
        throw new ImportPipelineError("FIRECRAWL_RESPONSE_INVALID", "fetch", false);
      }

      const providerTitle = payload.data?.metadata?.title;
      const providerLanguage = payload.data?.metadata?.language;

      return {
        requestedUrl,
        finalUrl: approvedFinal.normalizedUrl,
        redirectCount: approved.normalizedUrl === approvedFinal.normalizedUrl ? 0 : 1,
        fetchedAt: new Date(this.now()).toISOString(),
        contentSha256: sha256([
          typeof rawHtml === "string" ? `${Buffer.byteLength(rawHtml, "utf8")}:${rawHtml}` : "0:",
          typeof markdown === "string" ? `${Buffer.byteLength(markdown, "utf8")}:${markdown}` : "0:",
        ].join("\n")),
        attemptCount: 1,
        rawHtml: typeof rawHtml === "string" && rawHtml.trim() ? rawHtml : null,
        markdown: typeof markdown === "string" ? markdown : null,
        metadata: {
          sourceUrl: approvedFinal.normalizedUrl,
          title: typeof providerTitle === "string" ? providerTitle.slice(0, 500) : null,
          language: typeof providerLanguage === "string" ? providerLanguage.slice(0, 100) : null,
        },
      };
    } finally {
      clearTimeout(timeout);
      cancellation?.removeEventListener("abort", cancel);
    }
  }

  async fetch(requestedUrl: string, cancellation?: AbortSignal): Promise<FirecrawlFetchedPage> {
    const scraped = await this.scrape(requestedUrl, cancellation);
    if (!scraped.rawHtml) {
      throw new ImportPipelineError("FIRECRAWL_RESPONSE_INVALID", "fetch", false);
    }
    return {
      requestedUrl: scraped.requestedUrl,
      finalUrl: scraped.finalUrl,
      redirectCount: scraped.redirectCount,
      responseMediaType: "text/html",
      fetchedAt: scraped.fetchedAt,
      contentSha256: scraped.contentSha256,
      html: scraped.rawHtml,
      charsetReplacement: false,
      attemptCount: scraped.attemptCount,
      markdown: scraped.markdown,
      metadata: scraped.metadata,
    };
  }
}
