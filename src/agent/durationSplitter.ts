export interface DurationSegment {
  index: number;
  start: number;
  end: number;
  duration: number;
  timeRange: string;
}

export interface TimelineItem extends DurationSegment {
  heading: string;
  body: string;
}

interface ParsedTimelineLine {
  start: number;
  end: number;
  heading: string;
  body: string;
}

const TIME_VALUE_PATTERN = String.raw`(?:(?:\d{1,2}:)?\d{1,2}:\d{2}|\d+(?:\.\d+)?\s*(?:秒|s|sec|second|seconds)?)`;
const SHOT_PREFIX_PATTERN = String.raw`(?:(?:镜头|分镜|场景|画面)\s*(?:第?\s*)?(?:\d+|[一二三四五六七八九十百]+)?|第\s*(?:\d+|[一二三四五六七八九十百]+)\s*(?:个?\s*)?(?:镜头|镜|分镜|场景|画面))`;
const TIMELINE_LINE_PATTERN = new RegExp(
  String.raw`^\s*(?<prefix>${SHOT_PREFIX_PATTERN})?\s*[（(【\[]?\s*` +
    String.raw`(?<start>${TIME_VALUE_PATTERN})\s*(?:[-–—~]|到|至)\s*(?<end>${TIME_VALUE_PATTERN})` +
    String.raw`\s*[）)】\]]?\s*(?<rest>.*)$`,
  "i"
);
const SECTION_BOUNDARY_PATTERN = /^(整体要求|总体要求|补充要求|画面要求|声音要求|负面约束)\s*[:：]?/;

export function parseDurationSeconds(text: string, fallback = 15): number {
  const timelineItems = extractTimelineItems(text);
  if (timelineItems.length > 0) {
    return Math.max(...timelineItems.map((item) => item.end));
  }

  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*(分钟|min|minute|minutes)/i);
  if (minuteMatch) return Math.max(1, Math.round(Number(minuteMatch[1]) * 60));

  const secondMatch = text.match(/(\d+(?:\.\d+)?)\s*(秒|s|sec|second|seconds)/i);
  if (secondMatch) return Math.max(1, Math.round(Number(secondMatch[1])));

  return fallback;
}

export function extractTimelineItems(text: string): TimelineItem[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const items: TimelineItem[] = [];
  let current: TimelineItem | null = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const parsed = parseTimelineLine(line);

    if (parsed) {
      if (current) items.push(normalizeTimelineItem(current));
      const fallbackHeading = `镜头 ${items.length + 1}`;
      const nextBody = parsed.body ? null : consumeNextDescriptionLine(lines, lineIndex);
      if (nextBody) lineIndex = nextBody.index;
      current = {
        index: items.length + 1,
        start: parsed.start,
        end: parsed.end,
        duration: Math.max(1, parsed.end - parsed.start),
        timeRange: `${formatSecondValue(parsed.start)}-${formatSecondValue(parsed.end)} 秒`,
        heading: parsed.heading || fallbackHeading,
        body: parsed.body || nextBody?.body || ""
      };
      continue;
    }

    if (current && SECTION_BOUNDARY_PATTERN.test(line.trim())) {
      items.push(normalizeTimelineItem(current));
      current = null;
      continue;
    }

    if (current && line.trim()) {
      current.body = [current.body, line.trim()].filter(Boolean).join("\n");
    }
  }

  if (current) items.push(normalizeTimelineItem(current));
  return items.map((item, index) => ({ ...item, index: index + 1 }));
}

function parseTimelineLine(line: string): ParsedTimelineLine | null {
  const match = line.match(TIMELINE_LINE_PATTERN);
  if (!match?.groups) return null;

  const start = parseTimeValue(match.groups.start);
  const end = parseTimeValue(match.groups.end);
  if (start === null || end === null || end <= start) return null;

  const prefix = normalizeShotPrefix(match.groups.prefix || "");
  if (!hasTimelineCue(prefix, match.groups.start, match.groups.end, match.groups.rest || "")) return null;

  const { heading, body } = splitTimelineRest(match.groups.rest || "");

  return {
    start,
    end,
    heading: heading || prefix,
    body
  };
}

function hasTimelineCue(prefix: string, startText: string, endText: string, rest: string): boolean {
  return Boolean(
    prefix ||
      isTimecode(startText) ||
      isTimecode(endText) ||
      hasExplicitSecondUnit(startText) ||
      hasExplicitSecondUnit(endText) ||
      /^\s*[｜|:：\-—]/.test(rest)
  );
}

function isTimecode(value: string): boolean {
  return value.includes(":");
}

function hasExplicitSecondUnit(value: string): boolean {
  return /(?:秒|s|sec|second|seconds)/i.test(value);
}

function parseTimeValue(value: string): number | null {
  const cleanValue = value.toLowerCase().replace(/\s+/g, "");
  if (!cleanValue) return null;

  if (cleanValue.includes(":")) {
    const parts = cleanValue.split(":").map(Number);
    if (parts.some((part) => !Number.isFinite(part))) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }

  const secondMatch = cleanValue.match(/^(\d+(?:\.\d+)?)(?:秒|s|sec|second|seconds)?$/i);
  return secondMatch ? Number(secondMatch[1]) : null;
}

function splitTimelineRest(rest: string): { heading: string; body: string } {
  const cleanRest = cleanTimelineText(rest);
  if (!cleanRest) return { heading: "", body: "" };

  const parts = cleanRest.split(/[｜|]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      heading: parts[0],
      body: parts.slice(1).join("，")
    };
  }

  return {
    heading: "",
    body: cleanRest
  };
}

function consumeNextDescriptionLine(
  lines: string[],
  currentIndex: number
): { index: number; body: string } | null {
  for (let index = currentIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (SECTION_BOUNDARY_PATTERN.test(line) || parseTimelineLine(line)) return null;

    return {
      index,
      body: cleanDescriptionLine(line)
    };
  }

  return null;
}

function cleanDescriptionLine(line: string): string {
  return line.replace(/^(画面(?:内容|描述)?|镜头(?:内容|描述)?|场景(?:描述)?|内容)\s*[:：]\s*/, "").trim();
}

function normalizeShotPrefix(prefix: string): string {
  return prefix.replace(/\s+/g, " ").trim();
}

function cleanTimelineText(text: string): string {
  return text.replace(/^[\s｜|:：\-—]+/, "").trim();
}

function formatSecondValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function normalizeTimelineItem(item: TimelineItem): TimelineItem {
  return {
    ...item,
    heading: item.heading.trim(),
    body: item.body.trim()
  };
}

export function splitDuration(totalSeconds: number, maxSegmentSeconds = 15): DurationSegment[] {
  const safeTotal = Math.max(1, Math.min(120, Math.round(totalSeconds)));
  const segments: DurationSegment[] = [];

  for (let start = 0, index = 1; start < safeTotal; start += maxSegmentSeconds, index += 1) {
    const end = Math.min(start + maxSegmentSeconds, safeTotal);
    segments.push({
      index,
      start,
      end,
      duration: end - start,
      timeRange: `${start}-${end} 秒`
    });
  }

  return segments;
}

export function buildShotIntervals(duration: number): DurationSegment[] {
  if (duration <= 6) {
    return [
      { index: 1, start: 0, end: duration, duration, timeRange: `0-${duration} 秒` }
    ];
  }

  const shotLength = duration <= 10 ? 2 : 3;
  const shots: DurationSegment[] = [];
  for (let start = 0, index = 1; start < duration; start += shotLength, index += 1) {
    const end = Math.min(start + shotLength, duration);
    shots.push({
      index,
      start,
      end,
      duration: end - start,
      timeRange: `${start}-${end} 秒`
    });
  }

  return shots;
}
