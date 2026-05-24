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

export function parseDurationSeconds(text: string, fallback = 15): number {
  const timelineItems = extractTimelineItems(text);
  if (timelineItems.length >= 2) {
    return Math.max(...timelineItems.map((item) => item.end));
  }

  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*(分钟|min|minute|minutes)/i);
  if (minuteMatch) return Math.max(1, Math.round(Number(minuteMatch[1]) * 60));

  const rangeMatches = Array.from(
    text.matchAll(/(\d{1,3})\s*[-–—到至]\s*(\d{1,3})\s*(?:秒|s|sec|second|seconds)/gi)
  );
  if (rangeMatches.length > 0) {
    return Math.max(...rangeMatches.map((match) => Number(match[2])));
  }

  const secondMatch = text.match(/(\d+(?:\.\d+)?)\s*(秒|s|sec|second|seconds)/i);
  if (secondMatch) return Math.max(1, Math.round(Number(secondMatch[1])));

  return fallback;
}

export function extractTimelineItems(text: string): TimelineItem[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const items: TimelineItem[] = [];
  let current: TimelineItem | null = null;

  for (const line of lines) {
    const match = line.match(
      /^\s*(\d{1,3})\s*[-–—到至]\s*(\d{1,3})\s*(?:秒|s|sec|second|seconds)\s*([｜|:：\-—]?.*)$/i
    );

    if (match) {
      if (current) items.push(normalizeTimelineItem(current));
      const start = Number(match[1]);
      const end = Number(match[2]);
      const rest = cleanTimelineText(match[3] || "");
      const parts = rest.split(/[｜|]/).map((part) => part.trim()).filter(Boolean);
      current = {
        index: items.length + 1,
        start,
        end,
        duration: Math.max(1, end - start),
        timeRange: `${start}-${end} 秒`,
        heading: parts[0] || `镜头 ${items.length + 1}`,
        body: parts.slice(1).join("，")
      };
      continue;
    }

    if (current && /^(整体要求|总体要求|补充要求|画面要求|声音要求|负面约束)\s*[:：]?/.test(line.trim())) {
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

function cleanTimelineText(text: string): string {
  return text.replace(/^[\s｜|:：\-—]+/, "").trim();
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
