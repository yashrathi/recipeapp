export interface SourceLine {
  locator: string;
  text: string;
  startSeconds?: number;
}

export interface TranscriptEvidence {
  text: string;
  lines: SourceLine[];
  hasTimestamps: boolean;
}

function secondsFromTimestamp(value: string): number | null {
  const parts = value.split(":").map(Number);
  if (parts.some((part) => !Number.isInteger(part)) || parts.length < 2 || parts.length > 3) return null;
  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, parts[0]!, parts[1]!];
  if (minutes! > 59 || seconds! > 59) return null;
  return hours! * 3600 + minutes! * 60 + seconds!;
}

export function isolateTranscript(markdown: string): TranscriptEvidence | null {
  const source = markdown.replace(/\r\n?/g, "\n");
  const match = /^##\s+Transcript\s*$/im.exec(source);
  if (!match) return null;
  const after = source.slice(match.index + match[0].length).replace(/^\n+/, "");
  const nextHeading = /^##\s+/m.exec(after);
  const section = (nextHeading ? after.slice(0, nextHeading.index) : after).trim();
  if (!section) return null;

  const lines: SourceLine[] = [];
  section.split("\n").forEach((raw, index) => {
    let text = raw.trim();
    if (!text) return;
    const timed = /^(?:[-*]\s*)?(?:\[)?((?:\d{1,2}:)?\d{1,2}:\d{2})(?:\])?\s*(?:[-–—]\s*)?(.*)$/.exec(text);
    const startSeconds = timed ? secondsFromTimestamp(timed[1]!) : null;
    if (timed && startSeconds !== null && timed[2]!.trim()) text = timed[2]!.trim();
    const line: SourceLine = { locator: `transcript:line:${index + 1}`, text };
    if (startSeconds !== null) line.startSeconds = startSeconds;
    lines.push(line);
  });
  if (!lines.length) return null;
  return {
    text: lines.map((line) => `${line.locator} ${line.text}`).join("\n"),
    lines,
    hasTimestamps: lines.some((line) => line.startSeconds !== undefined),
  };
}
