import { BANNED_PROMPT_PHRASES } from "../data/negativeRules";

export interface QualityReport {
  cleanPrompt: string;
  removedPhrases: string[];
  tags: string[];
}

const DURATION_PATTERN =
  /(?:\d+(?:\.\d+)?\s*(?:-|－|–|—|~|～|至|到)\s*\d+(?:\.\d+)?\s*秒|(?:总时长|时长|片长|持续时间)\s*[:：]?\s*\d+(?:\.\d+)?\s*秒|\d+(?:\.\d+)?\s*秒(?:钟)?)/;

const SHOT_STRUCTURE_PATTERN =
  /(?:镜头\s*\d+|第\s*[一二三四五六七八九十\d]+\s*镜|多镜头|单镜头|一镜到底|分镜|镜头结构|镜头(?:切换|缓慢|快速|推进|拉远|摇移|跟拍|停留|转向))/;

const SOUND_RULE_PATTERN = /(?:BGM|背景音乐|口播|旁白|配音|音效|环境声|同期声|声音|声效|音乐)/i;

const NEGATIVE_CONSTRAINT_PATTERN = /(?:不生成字幕|不出现|避免|不要|禁止|不得|负面约束|无字幕|无水印|不含字幕|不显示)/;

export function guardPromptText(prompt: string): QualityReport {
  let cleanPrompt = prompt
    .replace(/<\/?PROMPT_CARD>/gi, "")
    .replace(/\b(?:iPhone|Apple)\b/gi, "手机")
    .replace(/不要后期感/g, "保持实拍自然质感")
    .replace(/后期手动加(?:品牌)?Logo/g, "保持干净收束画面")
    .replace(/后期(?:手动)?添加的?/g, "");
  const removedPhrases: string[] = [];

  for (const phrase of BANNED_PROMPT_PHRASES) {
    if (cleanPrompt.includes(phrase)) {
      cleanPrompt = cleanPrompt.split(phrase).join("");
      removedPhrases.push(phrase);
    }
  }

  cleanPrompt = cleanPrompt
    .replace(/（[^）]*(?:同上|延续前句|延续前文|延续上一句)[^）]*）/g, "（声线保持自然连贯）")
    .replace(/\([^)]*(?:同上|延续前句|延续前文|延续上一句)[^)]*\)/g, "（声线保持自然连贯）")
    .replace(/(?:主角)?与上一段为同一人[：:，,]?\s*/g, "")
    .replace(/(?:口播|旁白|对白|台词)([（(][^）)]*[）)])?[：:]\s*(?:同上|延续前句|延续前文)[。；;，,\s]*/g, "")
    .replace(/延续上一段的?/g, "")
    .replace(/接上一段[，,]?\s*/g, "")
    .replace(/^\s*(?:口播|旁白|对白|台词)[：:]\s*(?:无|没有|不需要|无口播|无对白|无旁白)\s*$/gim, "")
    .replace(/^\s*画面[：:]\s*无口播\s*$/gim, "")
    .replace(/真实\s+手机\s+手持/g, "真实手机手持")
    .replace(/不写(?:、不写)+[；;，,。]?\s*/g, "")
    .replace(/不写[；;，,。]?\s*/g, "")
    .replace(/不要写[；;，,。]?\s*/g, "")
    .replace(/不要预留提示[；;，,。]?\s*/g, "")
    .replace(/不要保持画面干净[^\n；;。]*[；;。]?\s*/g, "")
    .replace(/不出现的描述[；;，,。]?\s*/g, "")
    .replace(/不出现的视觉元素[；;，,。]?\s*/g, "")
    .replace(/不出现\s+或任何/g, "不出现任何")
    .replace(/真实感\s+手机\s+手持/g, "真实手机手持")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/：\s+/g, "：")
    .trim();

  cleanPrompt = condenseNegativeConstraintLines(cleanPrompt);

  if (!/(光线|阳光|阴影|色调|环境|背景|空间|桌面|窗|街|室内|室外|画面)/.test(cleanPrompt)) {
    cleanPrompt = [
      cleanPrompt,
      "画面环境：每个镜头都要有清晰空间背景、光线方向、色调变化和前后景层次，避免空泛纯动作画面。"
    ].join("\n");
  }

  const tags: string[] = [];
  if (removedPhrases.length === 0) tags.unshift("通过禁用词检查");
  if (DURATION_PATTERN.test(cleanPrompt)) tags.push("含时长");
  if (SHOT_STRUCTURE_PATTERN.test(cleanPrompt)) tags.push("含镜头结构");
  if (SOUND_RULE_PATTERN.test(cleanPrompt)) tags.push("含声音规则");
  if (NEGATIVE_CONSTRAINT_PATTERN.test(cleanPrompt)) tags.push("含负面约束");
  if (!/上一段|同上|后期/.test(cleanPrompt)) tags.push("无跨段依赖");

  return { cleanPrompt, removedPhrases, tags };
}

function condenseNegativeConstraintLines(prompt: string): string {
  return prompt.replace(/(^|\n)(\s*负面约束[：:])([^\n]+)/g, (_match, lineStart: string, prefix: string, body: string) => {
    const clauses = body
      .split(/[；;。]/)
      .map((clause) => clause.trim().replace(/[，,]\s*$/g, ""))
      .filter(Boolean)
      .filter((clause) => !/不生成的重复内容/.test(clause));

    if (clauses.length <= 10 && body.length <= 260) {
      return `${lineStart}${prefix}${clauses.join("；")}。`;
    }

    const priorityClauses = clauses.filter((clause) =>
      /字幕|文字|logo|Logo|水印|品牌|商标|手机|App|UI|口播|旁白|对白|台词|过度|变形|手指|肢体|虚焦|低清|产品|包装|多余|特效|滤镜/i.test(clause)
    );
    const fallbackClauses = priorityClauses.length >= 3 ? priorityClauses : clauses;
    const uniqueClauses = Array.from(new Set(fallbackClauses)).slice(0, 8);

    return `${lineStart}${prefix}${uniqueClauses.join("；")}。`;
  });
}
