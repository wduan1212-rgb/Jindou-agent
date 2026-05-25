interface TimeRange {
  start: number;
  end: number;
}

interface TimedBlock extends TimeRange {
  text: string;
}

interface PromptParts {
  preamble: string;
  blocks: TimedBlock[];
  tail: string;
  fallback: string;
}

export interface FinalizedPromptText {
  text: string;
  duration: number;
  timeRange: string;
  warnings: string[];
}

const MAX_PROMPT_SECONDS = 15;

export function finalizePromptTexts(rawPrompts: string[]): FinalizedPromptText[] {
  const exploded = rawPrompts.flatMap((prompt) => splitOverlongPrompt(normalizePromptTimeText(prompt)));
  const merged = mergeShortTailPrompts(exploded);

  return merged.map((text) => {
    const constrainedText = enforceMaxPromptText(text);
    const timing = getPromptTiming(constrainedText);
    const safeDuration = Math.min(timing.duration || MAX_PROMPT_SECONDS, MAX_PROMPT_SECONDS);
    const normalizedText = enforceMaxPromptText(normalizeDeclaredDuration(constrainedText, safeDuration));
    const finalTiming = getPromptTiming(normalizedText);
    const finalDuration = Math.min(finalTiming.duration || safeDuration, MAX_PROMPT_SECONDS);
    const warnings = buildWarnings(normalizedText, finalDuration);
    return {
      text: normalizedText,
      duration: finalDuration,
      timeRange: finalTiming.label,
      warnings
    };
  });
}

function normalizeDeclaredDuration(text: string, duration: number): string {
  const safeDuration = Math.min(duration || MAX_PROMPT_SECONDS, MAX_PROMPT_SECONDS);
  return replaceStandaloneDuration(
    text.replace(/((?:总时长|时长|片长|持续时间)[：:\s]*)(\d+)\s*(?:秒|s)/gi, (_match, prefix: string) => `${prefix}${safeDuration}s`),
    safeDuration
  );
}

export function getPromptTiming(prompt: string): { label: string; duration: number } {
  const ranges = extractRanges(prompt);

  if (ranges.length > 0) {
    const start = Math.min(...ranges.map((range) => range.start));
    const end = Math.max(...ranges.map((range) => range.end));
    const duration = Math.max(1, end - start);
    return {
      label: `${start}-${end}s`,
      duration
    };
  }

  const explicitDurationMatch = prompt.match(/(?:总时长|时长)[：:\s]*(\d+)\s*(?:秒|s)/i);
  if (explicitDurationMatch) {
    const duration = Number(explicitDurationMatch[1]);
    return {
      label: `0-${Math.min(duration, MAX_PROMPT_SECONDS)}s`,
      duration: Math.min(duration, MAX_PROMPT_SECONDS)
    };
  }

  return {
    label: `0-${MAX_PROMPT_SECONDS}s`,
    duration: MAX_PROMPT_SECONDS
  };
}

function splitOverlongPrompt(prompt: string): string[] {
  const parts = decomposePrompt(prompt);
  const timing = getPromptTiming(prompt);

  if (timing.duration <= MAX_PROMPT_SECONDS) {
    return [normalizePromptToZero(prompt)];
  }

  if (parts.blocks.length === 0) {
    return [normalizePromptToZero(prompt)];
  }

  if (parts.blocks.length === 1) {
    const block = clampTimedBlock(shiftBlock(parts.blocks[0], -parts.blocks[0].start));
    return [
      composePromptParts({
        ...parts,
        blocks: [block]
      })
    ];
  }

  const chunks: TimedBlock[][] = [];
  let current: TimedBlock[] = [];
  let chunkBase = parts.blocks[0]?.start ?? 0;

  for (const sourceBlock of parts.blocks) {
    const block = clampTimedBlock(sourceBlock);
    const projectedEnd = block.end - chunkBase;
    if (current.length > 0 && projectedEnd > MAX_PROMPT_SECONDS) {
      chunks.push(current);
      current = [block];
      chunkBase = block.start;
      continue;
    }
    current.push(block);
  }
  if (current.length > 0) chunks.push(current);

  return chunks.map((blocks) => {
    const base = blocks[0]?.start ?? 0;
    return composePromptParts({
      ...parts,
      blocks: blocks.map((block) => shiftBlock(block, -base))
    });
  });
}

function mergeShortTailPrompts(prompts: string[]): string[] {
  const result = [...prompts];

  for (let index = result.length - 2; index >= 0; index -= 1) {
    const leftDuration = getPromptTiming(result[index]).duration;
    const rightDuration = getPromptTiming(result[index + 1]).duration;

    if (leftDuration + rightDuration <= MAX_PROMPT_SECONDS) {
      result[index] = mergeTwoPrompts(result[index], result[index + 1]);
      result.splice(index + 1, 1);
    }
  }

  return result;
}

function mergeTwoPrompts(left: string, right: string): string {
  const leftParts = decomposePrompt(normalizePromptToZero(left));
  const rightParts = decomposePrompt(normalizePromptToZero(right));
  const leftDuration = getPromptTiming(left).duration;
  const preamble = leftParts.preamble || rightParts.preamble;
  const blocks = [
    ...leftParts.blocks,
    ...rightParts.blocks.map((block) => shiftBlock(block, leftDuration))
  ];
  const tail = mergeTailText(leftParts.tail, rightParts.tail);

  return composePromptParts({
    preamble,
    blocks,
    tail,
    fallback: [left, right].join("\n\n")
  });
}

function normalizePromptToZero(prompt: string): string {
  const ranges = extractRanges(prompt);
  if (ranges.length === 0) return prompt.trim();
  const minStart = Math.min(...ranges.map((range) => range.start));
  if (minStart === 0) return prompt.trim();
  return shiftTimeRanges(prompt, -minStart).trim();
}

function normalizePromptTimeText(prompt: string): string {
  return prompt
    .replace(/镜头\s*\d*\s*[（(]\s*(\d+)\s*[-–—~至到]\s*(\d+)\s*(?:秒|s)\s*[）)]\s*[：:]?\s*/gi, "$1-$2s｜")
    .replace(/(\d+)\s*[-–—~至到]\s*(\d+)\s*秒/g, "$1-$2s")
    .trim();
}

function decomposePrompt(prompt: string): PromptParts {
  const normalized = normalizePromptTimeText(prompt);
  const tailIndex = findTailIndex(normalized);
  const timedText = tailIndex === -1 ? normalized : normalized.slice(0, tailIndex).trim();
  const tail = tailIndex === -1 ? "" : normalized.slice(tailIndex).trim();
  const matches = Array.from(timedText.matchAll(/(^|\n)\s*(\d{1,3})\s*[-–—~至到]\s*(\d{1,3})\s*(?:s|秒)\s*([｜|:：\-—]?.*)/gi));

  if (matches.length === 0) {
    return {
      preamble: "",
      blocks: [],
      tail,
      fallback: normalized
    };
  }

  const blocks: TimedBlock[] = [];
  const firstIndex = matches[0].index ?? 0;
  const preamble = timedText.slice(0, firstIndex).trim();

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const startIndex = match.index ?? 0;
    const endIndex = matches[index + 1]?.index ?? timedText.length;
    const rangeStart = Number(match[2]);
    const rangeEnd = Number(match[3]);
    const rawText = timedText.slice(startIndex, endIndex).trim();
    blocks.push({
      start: rangeStart,
      end: rangeEnd,
      text: rawText
    });
  }

  return {
    preamble,
    blocks,
    tail,
    fallback: normalized
  };
}

function composePromptParts(parts: PromptParts): string {
  if (parts.blocks.length === 0) return parts.fallback.trim();

  const blockText = parts.blocks
    .map((block) => shiftBlockText(block.text, block.start, block.end))
    .join("\n\n");

  return [parts.preamble, blockText, parts.tail]
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function shiftBlock(block: TimedBlock, offset: number): TimedBlock {
  return {
    start: Math.max(0, block.start + offset),
    end: Math.max(1, block.end + offset),
    text: shiftTimeRanges(block.text, offset)
  };
}

function clampTimedBlock(block: TimedBlock): TimedBlock {
  const safeStart = Math.min(block.start, MAX_PROMPT_SECONDS - 1);
  const shiftedText = safeStart === block.start ? block.text : shiftTimeRanges(block.text, safeStart - block.start);
  const safeEnd = Math.min(MAX_PROMPT_SECONDS, Math.max(safeStart + 1, block.end + (safeStart - block.start)));

  return {
    start: safeStart,
    end: safeEnd,
    text: shiftBlockText(shiftedText, safeStart, safeEnd)
  };
}

function shiftBlockText(text: string, start: number, end: number): string {
  return text.replace(/^\s*\d{1,3}\s*[-–—~至到]\s*\d{1,3}\s*(?:s|秒)/, `${start}-${end}s`);
}

function shiftTimeRanges(text: string, offset: number): string {
  return text.replace(/(\d{1,3})\s*[-–—~至到]\s*(\d{1,3})\s*(?:s|秒)/gi, (_match, startText: string, endText: string) => {
    const start = Math.max(0, Number(startText) + offset);
    const end = Math.max(1, Number(endText) + offset);
    return `${start}-${end}s`;
  });
}

function extractRanges(prompt: string): TimeRange[] {
  return Array.from(prompt.matchAll(/(\d{1,3})\s*[-–—~至到]\s*(\d{1,3})\s*(?:s|秒)/gi))
    .map((match) => ({
      start: Number(match[1]),
      end: Number(match[2])
    }))
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start);
}

function findTailIndex(text: string): number {
  const rangeMatches = Array.from(text.matchAll(/(\d{1,3})\s*[-–—~至到]\s*(\d{1,3})\s*(?:s|秒)/gi));
  const searchStart = rangeMatches.length ? rangeMatches[rangeMatches.length - 1].index ?? 0 : 0;
  const searchableText = text.slice(searchStart);
  const candidates = ["负面约束", "画面约束", "整体要求", "参考建议"];
  const indexes = candidates
    .map((label) => {
      const index = searchableText.search(new RegExp(`(^|\\n)\\s*${label}[：:]`, "i"));
      return index >= 0 ? searchStart + index : -1;
    })
    .filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function enforceMaxPromptText(prompt: string): string {
  const parts = decomposePrompt(normalizePromptToZero(prompt));
  if (parts.blocks.length === 0) {
    return normalizeDeclaredDuration(prompt, MAX_PROMPT_SECONDS).trim();
  }

  return composePromptParts({
    ...parts,
    blocks: parts.blocks.map(clampTimedBlock)
  });
}

function replaceStandaloneDuration(text: string, safeDuration: number): string {
  return text.replace(/(\d{1,3})\s*(秒|s)(?=(?:短视频|广告|视频|影片|片|，|,|。|\s|$))/gi, (match, value: string, unit: string, offset: number, fullText: string) => {
    const before = fullText.slice(Math.max(0, offset - 4), offset);
    if (/[-–—~至到]\s*$/.test(before)) return match;
    return Number(value) !== safeDuration ? `${safeDuration}${unit}` : match;
  });
}

function mergeTailText(leftTail: string, rightTail: string): string {
  const lines = [...leftTail.split("\n"), ...rightTail.split("\n")]
    .map((line) => line.trim())
    .filter(Boolean);
  return Array.from(new Set(lines)).join("\n");
}

function buildWarnings(prompt: string, duration: number): string[] {
  const warnings: string[] = [];

  if (duration > MAX_PROMPT_SECONDS) {
    warnings.push("已拦截超过15秒的段落");
  }
  if (/口播|旁白|Voiceover|VO|台词|says?:|说[:：]/i.test(prompt) && !hasPerShotSpeech(prompt)) {
    warnings.push("建议把口播拆进对应镜头");
  }
  if (/主角|女生|男生|人物|角色|产品|App|道具|宠物|车辆/.test(prompt)) {
    warnings.push("主体描述已用于一致性");
  }

  return warnings;
}

function hasPerShotSpeech(prompt: string): boolean {
  const blocks = decomposePrompt(prompt).blocks;
  if (blocks.length === 0) return false;
  return blocks.some((block) => /口播|旁白|台词|对白|says?:|VO/i.test(block.text));
}
