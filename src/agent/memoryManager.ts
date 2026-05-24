import type { ProjectMemory } from "../types/memory";

export function extractMemoryUpdates(input: string): string[] {
  const text = input.trim();
  if (!/(以后|记住|这个客户|这个产品|下一版|不要出现|都这样写|偏好)/.test(text)) {
    return [];
  }

  return text
    .split(/[。！？\n]/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /(以后|记住|这个客户|这个产品|下一版|不要出现|都这样写|偏好)/.test(line));
}

export function applyMemoryUpdates(memory: ProjectMemory, updates: string[]): ProjectMemory {
  if (updates.length === 0) return memory;

  const next: ProjectMemory = {
    ...memory,
    stylePreferences: [...memory.stylePreferences],
    voicePreferences: [...memory.voicePreferences],
    negativeRules: [...memory.negativeRules],
    notes: [...memory.notes]
  };

  for (const update of updates) {
    if (/不要出现|不要写|禁用/.test(update)) {
      next.negativeRules = unique([...next.negativeRules, update]);
    } else if (/口播|旁白|语气|声音/.test(update)) {
      next.voicePreferences = unique([...next.voicePreferences, update]);
    } else if (/风格|节奏|镜头|客户|产品/.test(update)) {
      next.stylePreferences = unique([...next.stylePreferences, update]);
    } else {
      next.notes = unique([...next.notes, update]);
    }
  }

  return next;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).slice(0, 16);
}
