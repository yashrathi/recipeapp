import { ImportPipelineError } from "@/domain/import/types";
import { validateImportUrl } from "@/server/import/url-policy";

export type PublicImportSource =
  | { type: "web"; normalizedUrl: string }
  | { type: "youtube"; normalizedUrl: string; videoId: string };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function parsePublicImportSource(input: string): PublicImportSource {
  const url = validateImportUrl(input);

  const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const isYoutube = host === "youtube.com" || host === "youtu.be";
  if (!isYoutube) return { type: "web", normalizedUrl: url.href };

  let videoId: string | null = null;
  if (host === "youtu.be") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 1) videoId = parts[0]!;
  } else if (url.pathname === "/watch") {
    const ids = url.searchParams.getAll("v");
    if (ids.length === 1 && !url.searchParams.has("list")) videoId = ids[0]!;
  } else {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 2 && parts[0] === "shorts") videoId = parts[1]!;
  }

  if (!videoId || !VIDEO_ID.test(videoId)) {
    throw new ImportPipelineError("YOUTUBE_URL_UNSUPPORTED", "validate_url", false);
  }
  return {
    type: "youtube",
    videoId,
    normalizedUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}
