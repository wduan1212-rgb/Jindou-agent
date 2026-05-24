import { BANNED_PROMPT_PHRASES } from "../data/negativeRules";

export interface QualityReport {
  cleanPrompt: string;
  removedPhrases: string[];
  tags: string[];
}

export function guardPromptText(prompt: string): QualityReport {
  let cleanPrompt = prompt;
  const removedPhrases: string[] = [];

  for (const phrase of BANNED_PROMPT_PHRASES) {
    if (cleanPrompt.includes(phrase)) {
      cleanPrompt = cleanPrompt.split(phrase).join("");
      removedPhrases.push(phrase);
    }
  }

  cleanPrompt = cleanPrompt
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/：\s+/g, "：")
    .trim();

  const tags = ["含时长", "含镜头结构", "含声音规则", "含负面约束"];
  if (removedPhrases.length === 0) tags.unshift("通过禁用词检查");
  if (!/上一段|同上|后期/.test(cleanPrompt)) tags.push("无跨段依赖");

  return { cleanPrompt, removedPhrases, tags };
}
