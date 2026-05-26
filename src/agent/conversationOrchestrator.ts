import { applyMemoryUpdates, extractMemoryUpdates } from "./memoryManager";
import { finalizePromptTexts, type FinalizedPromptText } from "./promptFinalizer";
import { guardPromptText } from "./promptQualityGuard";
import { JINDOU_SYSTEM_PROMPT } from "./systemPrompt";

const AGENT_VERSION = "0.3.0";

function buildSystemPrompt(): string {
  return JINDOU_SYSTEM_PROMPT.replace("{{VERSION}}", AGENT_VERSION);
}
import { parseDurationSeconds } from "./durationSplitter";
import { chat, LlmError, type ChatCompletionMessage } from "../services/llmClient";
import { createId, createMessage } from "../services/storage";
import type { ChatMessage, PromptSegment, ReferenceAsset, ShotMode } from "../types/chat";
import type { ProjectMemory } from "../types/memory";

const BRAND_KEYWORDS = [
  "品牌名",
  "品牌标识",
  "商标",
  "Trip.com",
  "携程",
  "Nike",
  "Apple",
  "iPhone",
  "Tesla",
  "Disney",
  "Marvel",
  "Coca-Cola",
  "McDonald's",
  "星巴克",
  "迪士尼",
  "漫威",
  "可口可乐",
  "麦当劳"
];

const SENSITIVE_KEYWORDS = [
  "军队",
  "军人",
  "士兵",
  "战争",
  "政治人物",
  "总统",
  "国旗",
  "敏感地标",
  "天安门",
  "白宫",
  "政府",
  "警察",
  "暴力",
  "血腥",
  "枪",
  "毒品",
  "色情",
  "未成年人",
  "自残",
  "自杀",
  "恐怖主义"
];

interface AgentTurnArgs {
  input: string;
  messages: ChatMessage[];
  references: ReferenceAsset[];
  memory: ProjectMemory;
}

interface AgentTurnResult {
  messages: ChatMessage[];
  memory: ProjectMemory;
}

interface PromptCardExtraction {
  contents: string[];
  usedExplicitTags: boolean;
}

export async function runAgentTurn(args: AgentTurnArgs): Promise<AgentTurnResult> {
  const memoryUpdates = extractMemoryUpdates(args.input);
  const nextMemory = applyMemoryUpdates(args.memory, memoryUpdates);
  const llmMessages = buildLlmMessages(args.messages, args.input, {
    memory: nextMemory,
    references: args.references
  });
  let reply: string;
  try {
    reply = await chat(llmMessages);
  } catch (error) {
    return {
      memory: nextMemory,
      messages: [
        createMessage({
          role: "assistant",
          kind: "notice",
          content: error instanceof LlmError ? error.toUserMessage() : "请求失败，请检查 API 设置后重试。"
        })
      ]
    };
  }

  if (!reply?.trim()) {
    return {
      memory: nextMemory,
      messages: [
        createMessage({
          role: "assistant",
          kind: "text",
          content: "LLM 暂时没有返回内容，请检查 API 设置后再试。"
        })
      ]
    };
  }

  let promptExtraction = extractPromptCards(reply);

  if (promptExtraction.contents.length > 0 && isDefiniteNonVideoChat(args.input, args.messages)) {
    promptExtraction = { contents: [], usedExplicitTags: false };
  }

  if (promptExtraction.contents.length === 0 && shouldForcePromptGeneration(args.input, args.messages)) {
    const repairedReply = await requestPromptCardRepair(llmMessages, args.input, reply).catch(() => null);
    const repairedExtraction = repairedReply ? extractPromptCards(repairedReply) : null;
    if (repairedReply && repairedExtraction?.contents.length) {
      reply = repairedReply;
      promptExtraction = repairedExtraction;
    }
  }

  if (promptExtraction.contents.length > 0 && shouldRepairDurationMismatch(args.input, args.messages, promptExtraction.contents)) {
    const expectedDuration = inferExpectedPromptDuration(args.input, args.messages);
    const coveredDuration = estimateFinalizedDuration(promptExtraction.contents);
    const repairedReply = await requestDurationCoverageRepair(llmMessages, args.input, reply, {
      expectedDuration,
      coveredDuration
    }).catch(() => null);
    const repairedExtraction = repairedReply ? extractPromptCards(repairedReply) : null;
    if (
      repairedReply &&
      repairedExtraction?.contents.length &&
      !shouldRepairDurationMismatch(args.input, args.messages, repairedExtraction.contents)
    ) {
      reply = repairedReply;
      promptExtraction = repairedExtraction;
    }
  }

  if (promptExtraction.contents.length > 0 && shouldRepairSpeechFidelity(args.input, promptExtraction.contents)) {
    const repairedReply = await requestSpeechFidelityRepair(llmMessages, args.input, reply).catch(() => null);
    const repairedExtraction = repairedReply ? extractPromptCards(repairedReply) : null;
    if (
      repairedReply &&
      repairedExtraction?.contents.length &&
      !shouldRepairSpeechFidelity(args.input, repairedExtraction.contents)
    ) {
      reply = repairedReply;
      promptExtraction = repairedExtraction;
    }
  }

  const promptCardContents = promptExtraction.contents;
  let visibleReply = promptExtraction.usedExplicitTags
    ? stripPromptCards(reply)
    : promptCardContents.length > 0
      ? extractLeadBeforeFallbackPrompt(reply)
      : reply.trim();

  const hasQuestionForUser = visibleReply
    ? detectQuestionForUser(visibleReply)
    : promptCardContents.length === 0 && detectQuestionForUser(reply);

  const hasBrandKeywords = checkBrandKeywords(reply, args.input);
  const hasSensitiveContent = checkSensitiveContent(reply);

  const reminderParts: string[] = [];
  if (hasBrandKeywords && !hasQuestionForUser) {
    reminderParts.push("回复中包含品牌、商标或 Logo 相关元素，请确认你拥有使用授权；真实品牌 Logo 建议后期手动添加，避免 AI 生成造成版权或商标风险。");
  }
  if (hasSensitiveContent) {
    reminderParts.push("回复中包含可能涉及军政、暴力、违法或其他敏感内容的元素，请根据目标平台政策自行修改或删除相关描述。");
  }
  if (reminderParts.length > 0) {
    visibleReply = [
      "温馨提示：\n" + reminderParts.map((part) => "· " + part).join("\n"),
      visibleReply
    ].filter(Boolean).join("\n\n");
  }

  if (promptCardContents.length > 0) {
    const expectedDuration = inferExpectedPromptDuration(args.input, args.messages);
    const finalizedPrompts = fitFinalizedPromptsToExpectedDuration(
      finalizePromptTexts(promptCardContents.map((rawPrompt, index) => cleanupPromptCard(rawPrompt, index))),
      expectedDuration
    );
    const prompts = finalizedPrompts.map((finalized, index) => {
      return buildPromptSegment(
        finalized.text,
        index,
        nextMemory.defaultModel,
        nextMemory.defaultShotMode,
        finalized
      );
    });
    const content = [
      visibleReply || `已生成 ${prompts.length} 条视频提示词。`,
      buildConsistencySuggestion(prompts)
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      memory: nextMemory,
      messages: [
        createMessage({
          role: "assistant",
          kind: "prompts",
          content,
          prompts
        })
      ]
    };
  }

  return {
    memory: nextMemory,
    messages: [
      createMessage({
        role: "assistant",
        kind: "text",
        content: hasQuestionForUser
          ? visibleReply || "我还需要先确认几个关键信息，再生成最终提示词。"
          : visibleReply || reply.trim()
      })
    ]
  };
}

async function requestPromptCardRepair(
  llmMessages: ChatCompletionMessage[],
  input: string,
  previousReply: string
): Promise<string | null> {
  try {
    return await chat([
      ...llmMessages,
      {
        role: "assistant",
        content: previousReply
      },
      {
        role: "user",
        content: [
          "上一次回复没有生成可复制的 PROMPT_CARD，但当前用户信息已经足够。",
          "请立刻生成最终视频提示词，不要继续反问，不要输出 JSON，不要写 Markdown 代码块。",
          "硬性结构：每条最终提示词必须用 <PROMPT_CARD> 和 </PROMPT_CARD> 包裹；每条卡片不超过 15 秒；总时长小于等于 15 秒只生成一条；超过 15 秒按叙事自然拆段；如果后两段合计小于等于 15 秒必须合并。",
          "内容标准：写具体角色形象锚点、场景环境、镜头/运镜、光线色调、动作节奏、声音；有口播/旁白/对白时，把用户给出的台词原样放进对应时间段，并写声线/语气；不要擅自新增台词；不要写 Seedance、参考图规则、根据需要、可选择、后期加入、同上、延续上一段。",
          `用户当前输入：${input}`
        ].join("\n")
      }
    ]);
  } catch {
    return null;
  }
}

async function requestDurationCoverageRepair(
  llmMessages: ChatCompletionMessage[],
  input: string,
  previousReply: string,
  timing: { expectedDuration: number; coveredDuration: number }
): Promise<string | null> {
  try {
    return await chat([
      ...llmMessages,
      {
        role: "assistant",
        content: previousReply
      },
      {
        role: "user",
        content: [
          `上一版提示词总覆盖约 ${timing.coveredDuration}s，但原始脚本需要完整覆盖约 ${timing.expectedDuration}s。`,
          "请重写全部最终提示词，让所有卡片的总时长贴近原始脚本，不要压缩缩水，也不要额外扩写到更长。",
          "每条 <PROMPT_CARD> 最多 15 秒；如果总时长超过 15 秒，请拆成多条并完整覆盖原始时间轴；后两段合计小于等于 15 秒时合并。",
          "所有时间段在每条卡片内部从 0s 开始重新编号；口播/旁白/对白必须放进对应时间段，用户给过原文时必须原样保留且不要新增台词；不要写后期、同上、延续上一段、Seedance、参考图规则。",
          `用户当前输入：${input}`
        ].join("\n")
      }
    ]);
  } catch {
    return null;
  }
}

async function requestSpeechFidelityRepair(
  llmMessages: ChatCompletionMessage[],
  input: string,
  previousReply: string
): Promise<string | null> {
  try {
    return await chat([
      ...llmMessages,
      {
        role: "assistant",
        content: previousReply
      },
      {
        role: "user",
        content: [
          "上一版提示词擅自新增或改写了用户给定的口播/台词。",
          "请重写最终提示词：用户给过明确口播、旁白或对白原文时，必须原样保留这些文字；可以放进最匹配的时间段，但不要新增任何其他口播/旁白/对白。",
          "没有口播的时间段只写环境音、动作音或BGM，不要写新的台词。",
          "仍然保持每条 PROMPT_CARD 不超过15秒、画面具体、有导演镜头语言。",
          `用户当前输入：${input}`
        ].join("\n")
      }
    ]);
  } catch {
    return null;
  }
}

function shouldForcePromptGeneration(input: string, messages: ChatMessage[]): boolean {
  if (isNonVideoQuery(input, messages)) return false;

  const text = [messages.slice(-4).map((message) => message.content).join("\n"), input].join("\n");

  if (/生成(?:最终)?提示词|最终提示词|直接生成|输出提示词|写(?:成)?提示词|请生成|好了|可以了|生成吧|帮我生成/i.test(input)) {
    return true;
  }

  return hasCompleteVideoBrief(text);
}

function isDefiniteNonVideoChat(input: string, messages: ChatMessage[]): boolean {
  const normalized = input.trim();
  const isDefiniteMeta = /^(?:你(?:是)?(?:谁|什么|叫什么|几号|哪个|什么版本|版本)|(?:什么|你)版本|你好|hi\b|hello|嗨|嘿|早上好|下午好|晚上好|在吗)/i.test(normalized);
  if (!isDefiniteMeta) return false;

  const hasRecentVideoContext = messages.slice(-3).some((message) =>
    message.role === "user" && /广告|短视频|视频|短片|vlog|探店|教程|宣传片|种草|提示词|脚本|分镜|口播|PROMPT_CARD/i.test(message.content || "")
  );
  return !hasRecentVideoContext;
}

function isNonVideoQuery(input: string, messages: ChatMessage[]): boolean {
  const normalized = input.trim();

  const hasExplicitGenerateOrder = /生成(?:最终)?提示词|最终提示词|直接生成|输出提示词|写(?:成)?提示词|请生成|好了|生成吧|可以了|帮我生成|好的.*生成/i.test(normalized);
  if (hasExplicitGenerateOrder) return false;

  const hasVideoIntent = /广告|短视频|视频|短片|影片|片子|vlog|探店|教程|宣传片|种草|提示词|脚本|分镜|镜头|口播|PROMPT_CARD/i.test(normalized);
  if (hasVideoIntent) return false;

  const hasRecentVideoContext = messages.slice(-3).some((message) =>
    message.role === "user" && /广告|短视频|视频|短片|vlog|探店|教程|宣传片|种草|提示词|脚本|分镜|口播|PROMPT_CARD/i.test(message.content || "")
  );
  if (hasRecentVideoContext && normalized.length < 40) return false;

  const isHighConfidenceMeta = /^(?:你(?:是)?(?:谁|什么|叫什么|几号|哪个|能|可以|会|有(?:什么|哪些))|(?:什么|你)版本|你好|hi\b|hello|嗨|嘿|早上好|下午好|晚上好|在吗|谢谢|多谢|辛苦了|再见|拜拜)/i.test(normalized);
  if (isHighConfidenceMeta) return true;

  return (!hasRecentVideoContext && /[？?]$/.test(normalized) && normalized.length < 30)
    || (!hasRecentVideoContext && normalized.length < 6);
}

function shouldRepairDurationMismatch(input: string, messages: ChatMessage[], promptContents: string[]): boolean {
  const expectedDuration = inferExpectedPromptDuration(input, messages);
  const coveredDuration = estimateFinalizedDuration(promptContents);
  if (expectedDuration <= 15) {
    return coveredDuration < expectedDuration - 1 || coveredDuration > Math.min(15, expectedDuration + 1);
  }
  return coveredDuration < expectedDuration - 1 || coveredDuration > expectedDuration + 2;
}

function shouldRepairSpeechFidelity(input: string, promptContents: string[]): boolean {
  const providedSnippets = extractProvidedSpeechSnippets(input);
  if (providedSnippets.length === 0) return false;

  const promptText = finalizePromptTexts(promptContents.map((rawPrompt, index) => cleanupPromptCard(rawPrompt, index)))
    .map((prompt) => prompt.text)
    .join("\n\n");
  const generatedSpeech = extractGeneratedSpeechLines(promptText);

  return generatedSpeech.some((line) => {
    const normalizedLine = normalizeSpeechText(line);
    if (normalizedLine.length < 3) return false;
    return !providedSnippets.some((snippet) => snippet.includes(normalizedLine) || normalizedLine.includes(snippet));
  });
}

function extractProvidedSpeechSnippets(input: string): string[] {
  const snippets: string[] = [];

  for (const match of input.matchAll(/[“"]([^”"]{2,120})[”"]/g)) {
    snippets.push(match[1]);
  }

  for (const match of input.matchAll(/(?:口播|旁白|对白|台词)[：:]\s*([^\n]+)/g)) {
    snippets.push(cleanProvidedSpeechSnippet(match[1]));
  }

  for (const match of input.matchAll(/(?:问|回答|台词)\s*([A-Za-z][A-Za-z0-9 ,.!?'’-]{2,})/g)) {
    snippets.push(match[1]);
  }

  return Array.from(new Set(snippets.map(normalizeSpeechText).filter((snippet) => snippet.length >= 3)));
}

function cleanProvidedSpeechSnippet(text: string): string {
  return text
    .split(/。(?=展示|画面|镜头|0\s*[-–—~至到]|\d)|；(?=展示|画面|镜头)|\n/)[0]
    .replace(/^(?:中文|英文|自然|角色|画外音|旁白|口播|对白)\s*/g, "")
    .trim();
}

function extractGeneratedSpeechLines(promptText: string): string[] {
  const lines: string[] = [];

  for (const match of promptText.matchAll(/(?:口播|旁白|对白|台词)[^：:\n]*[：:]\s*(?:（[^）]*）)?\s*[“"]?([^”"\n。；;]+(?:[。.!?？][^”"\n。；;]*)?)[”"]?/g)) {
    const line = match[1].trim();
    if (!/^(?:无|没有|不需要|无口播|无对白|无旁白|保留环境音)$/.test(line)) {
      lines.push(line);
    }
  }

  return lines;
}

function normalizeSpeechText(text: string): string {
  return text
    .replace(/\([^)]*\)|（[^）]*）/g, "")
    .replace(/[“”"'‘’`，,。.!！?？；;：:\s]/g, "")
    .toLowerCase()
    .trim();
}

function inferExpectedPromptDuration(input: string, messages: ChatMessage[]): number {
  const recentText = messages
    .slice(-8)
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .filter(Boolean)
    .join("\n");
  return parseDurationSeconds([recentText, input].filter(Boolean).join("\n"), 15);
}

function estimateFinalizedDuration(promptContents: string[]): number {
  return finalizePromptTexts(promptContents.map((rawPrompt, index) => cleanupPromptCard(rawPrompt, index))).reduce(
    (sum, prompt) => sum + prompt.duration,
    0
  );
}

function fitFinalizedPromptsToExpectedDuration(
  prompts: FinalizedPromptText[],
  expectedDuration: number
): FinalizedPromptText[] {
  if (prompts.length === 0) return prompts;

  const safeExpectedDuration = Math.max(1, Math.round(expectedDuration || 15));
  const totalDuration = prompts.reduce((sum, prompt) => sum + prompt.duration, 0);
  const allowedOverrun = safeExpectedDuration > 15 ? 2 : 1;
  const missingDuration = safeExpectedDuration - totalDuration;

  if (missingDuration > 0 && missingDuration <= 2) {
    const nextPrompts = [...prompts];
    const lastPrompt = nextPrompts[nextPrompts.length - 1];
    const duration = Math.min(lastPrompt.duration + missingDuration, 15);
    const adjustedTotal = totalDuration - lastPrompt.duration + duration;

    if (adjustedTotal === safeExpectedDuration) {
      nextPrompts[nextPrompts.length - 1] = {
        ...lastPrompt,
        duration,
        timeRange: `0-${duration}s`,
        text: forcePromptDuration(lastPrompt.text, duration)
      };
      return nextPrompts;
    }
  }

  if (totalDuration <= safeExpectedDuration + allowedOverrun) {
    return prompts;
  }

  let remainingDuration = safeExpectedDuration;
  const fittedPrompts: FinalizedPromptText[] = [];

  for (const prompt of prompts) {
    if (remainingDuration <= 0) break;

    const duration = Math.max(1, Math.min(prompt.duration, remainingDuration, 15));
    fittedPrompts.push({
      ...prompt,
      duration,
      timeRange: `0-${duration}s`,
      text: forcePromptDuration(prompt.text, duration)
    });
    remainingDuration -= duration;
  }

  return fittedPrompts.length ? fittedPrompts : prompts;
}

function forcePromptDuration(text: string, duration: number): string {
  let nextText = text
    .replace(
      /((?:总时长|时长|片长|持续时间)[：:\s]*)(\d+)\s*(?:秒|s)/gi,
      (_match, prefix: string) => `${prefix}${duration}s`
    )
    .replace(
      /(^|\n)(\s*(?:9\s*:\s*16|16\s*:\s*9)[^\n]{0,120}?)(\d{1,3})\s*(秒|s)(?=[，,。；;\s])/i,
      (_match, lineStart: string, prefix: string, _value: string, unit: string) =>
        `${lineStart}${prefix}${duration}${unit}`
    );

  const ranges = Array.from(nextText.matchAll(/(\d{1,3})\s*[-–—~至到]\s*(\d{1,3})\s*(?:s|秒)/gi));
  if (ranges.length > 0) {
    const lastRangeIndex = ranges[ranges.length - 1]?.index ?? -1;
    nextText = nextText.replace(
      /(\d{1,3})\s*[-–—~至到]\s*(\d{1,3})\s*(?:s|秒)/gi,
      (match, startText: string, endText: string, offset: number) => {
        const start = Number(startText);
        const end = Number(endText);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return match;
        if (offset === lastRangeIndex && end < duration) return `${start}-${duration}s`;
        if (end <= duration) return match;
        if (start >= duration) return `${Math.max(0, duration - 1)}-${duration}s`;
        return `${start}-${duration}s`;
      }
    );
  }

  if (!/(?:总时长|时长|片长|持续时间)[：:\s]*\d+\s*(?:秒|s)|\d+\s*[-–—~至到]\s*\d+\s*(?:s|秒)/i.test(nextText)) {
    nextText = `${nextText}\n\n时长：${duration}s`;
  }

  return nextText.trim();
}

function hasCompleteVideoBrief(text: string): boolean {
  const hasDuration = /\d{1,3}\s*(?:秒|s|sec|second|seconds)|\d{1,3}\s*[-–—~至到]\s*\d{1,3}\s*(?:秒|s)/i.test(text);
  const hasVideoIntent = /广告|短视频|视频|短片|影片|片子|vlog|探店|教程|宣传片|种草|手游|App/i.test(text);
  const hasVisualDirection = /主角|女生|男生|女性|男性|角色|产品|店员|顾客|宠物|孩子|父亲|母亲|一家|人物|场景|镜头|画面|展示|分屏|特写|中景|近景|风格|室内|室外|帐篷|露营|旅行|目的地|风景/.test(
    text
  );
  const hasSoundDecision = /口播|旁白|对白|台词|不要口播|无口播|环境音|音效|Voiceover|VO|dialogue|says?:/i.test(text);
  const timelineCount = (text.match(/\d{1,3}\s*[-–—~至到]\s*\d{1,3}\s*(?:秒|s)/gi) || []).length;

  if (timelineCount >= 3 && hasVisualDirection) return true;
  return hasDuration && hasVideoIntent && (hasVisualDirection || hasSoundDecision) && (hasSoundDecision || timelineCount >= 2);
}

const MAX_HISTORY_MESSAGES = 20;
const MAX_PROMPT_CARD_CHARS = 400;

function buildLlmMessages(
  messages: ChatMessage[],
  input: string,
  context: { memory: ProjectMemory; references: ReferenceAsset[] }
): ChatCompletionMessage[] {
  const recentMessages = messages.slice(-MAX_HISTORY_MESSAGES);
  const history = recentMessages
    .map((message): ChatCompletionMessage | null => {
      const content = serializeMessageForLlm(message);
      if (!content) return null;
      return {
        role: message.role,
        content
      };
    })
    .filter((message): message is ChatCompletionMessage => Boolean(message));

  return [
    {
      role: "system",
      content: buildSystemPrompt()
    },
    ...history,
    {
      role: "user",
      content: [buildProjectContextForLlm(context.memory, context.references), `用户当前输入：${input}`].join("\n\n")
    }
  ];
}

function serializeMessageForLlm(message: ChatMessage): string {
  const parts: string[] = [];

  if (message.content?.trim()) {
    parts.push(message.content.trim());
  }

  if (message.prompts?.length) {
    parts.push(
      ...message.prompts.map((prompt) => {
        const compact = prompt.prompt.length > MAX_PROMPT_CARD_CHARS
          ? prompt.prompt.slice(0, MAX_PROMPT_CARD_CHARS) + "…"
          : prompt.prompt;
        return [`<PROMPT_CARD>`, compact, `</PROMPT_CARD>`].join("\n");
      })
    );
  }

  if (message.questions?.length) {
    parts.push(
      message.questions
        .map((question) => {
          const options = question.options.map((option) => option.label).join(" / ");
          return `问题：${question.prompt}${options ? `\n选项：${options}` : ""}`;
        })
        .join("\n\n")
    );
  }

  return parts.join("\n\n").trim();
}

function buildProjectContextForLlm(memory: ProjectMemory, references: ReferenceAsset[]): string {
  const memoryLines = [
    `默认镜头结构：${memory.defaultShotMode === "multi" ? "多镜头剪辑" : "单镜头一镜到底"}`,
    `风格偏好：${formatList(memory.stylePreferences)}`,
    `声音偏好：${formatList(memory.voicePreferences)}`,
    `负面规则：${formatList(memory.negativeRules)}`,
    `备注：${formatList(memory.notes)}`
  ];

  const referenceLines = references.length
    ? references.map((reference, index) =>
        `${index + 1}. ${reference.name}（用途：${formatReferenceKind(reference.kind)}，文件类型：${reference.type || "未知"}）`
      )
    : ["无"];

  return [
    "当前项目上下文：",
    "项目记忆：",
    ...memoryLines,
    "参考素材：",
    ...referenceLines,
    "请把项目记忆和参考素材作为理解需求、判断是否追问、生成最终提示词的依据，不要逐字复述这段上下文。"
  ].join("\n");
}

function formatList(items: string[]): string {
  return items.length ? items.join("；") : "无";
}

function formatReferenceKind(kind: ReferenceAsset["kind"]): string {
  const labels: Record<ReferenceAsset["kind"], string> = {
    mixed: "综合参考",
    role: "角色参考",
    product: "产品参考",
    scene: "场景参考",
    style: "风格参考"
  };

  return labels[kind] || kind;
}

function extractPromptCards(text: string): PromptCardExtraction {
  const explicitContents = Array.from(text.matchAll(/<PROMPT_CARD>([\s\S]*?)<\/PROMPT_CARD>/gi))
    .map((match) => match[1].trim())
    .filter(Boolean);

  if (explicitContents.length > 0) {
    return {
      contents: explicitContents,
      usedExplicitTags: true
    };
  }

  return {
    contents: extractFallbackPromptCards(text),
    usedExplicitTags: false
  };
}

function extractFallbackPromptCards(text: string): string[] {
  const normalizedText = stripMarkdownCodeFence(text);
  const headingMatches = Array.from(
    normalizedText.matchAll(/(^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?(?:提示词|Prompt)\s*[一二三四五六七八九十\d]+[^\n]*\n/gi)
  );

  if (headingMatches.length > 0) {
    return headingMatches
      .map((match, index) => {
        const start = (match.index ?? 0) + match[0].length;
        const end = headingMatches[index + 1]?.index ?? normalizedText.length;
        return normalizedText.slice(start, end).trim();
      })
      .filter(looksLikePromptText);
  }

  const promptStart = findFallbackPromptStart(normalizedText);
  if (promptStart === -1) return [];

  const candidate = normalizedText.slice(promptStart).trim();
  return looksLikePromptText(candidate) ? [candidate] : [];
}

function stripMarkdownCodeFence(text: string): string {
  return text.replace(/```(?:[\w-]+)?\s*([\s\S]*?)```/g, (_match, body: string) => body.trim()).trim();
}

function findFallbackPromptStart(text: string): number {
  const linePattern = /[^\n]*(?:\n|$)/g;
  const lines = Array.from(text.matchAll(linePattern)).filter((match) => match[0].length > 0);

  for (const match of lines) {
    const line = match[0].trim();
    const index = match.index ?? 0;

    if (
      /^(?:9\s*:\s*16|16\s*:\s*9|竖屏|横屏|视频类型|画面风格|整体风格|镜头结构)[：:\s]/i.test(line) ||
      /^\d{1,3}\s*[-–—~至到]\s*\d{1,3}\s*(?:s|秒)/i.test(line)
    ) {
      return index;
    }
  }

  return -1;
}

function looksLikePromptText(text: string): boolean {
  const cleanText = text.trim();
  if (cleanText.length < 120) return false;

  const hasTiming = /\d{1,3}\s*[-–—~至到]\s*\d{1,3}\s*(?:s|秒)/i.test(cleanText);
  const hasVisualLanguage = /9\s*:\s*16|竖屏|镜头|画面|运镜|分屏|中景|近景|特写|俯拍|跟拍|推近|负面约束/.test(
    cleanText
  );
  const hasQuestionOnlyTone = detectQuestionForUser(cleanText) && !/负面约束|0\s*[-–—~至到]\s*\d{1,3}\s*(?:s|秒)/i.test(cleanText);

  return hasTiming && hasVisualLanguage && !hasQuestionOnlyTone;
}

function extractLeadBeforeFallbackPrompt(text: string): string {
  const normalizedText = stripMarkdownCodeFence(text);
  const explicitHeading = normalizedText.match(
    /(^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?(?:提示词|Prompt)\s*[一二三四五六七八九十\d]+[^\n]*\n/i
  );
  const promptStart = explicitHeading?.index ?? findFallbackPromptStart(normalizedText);

  if (promptStart <= 0) return "";

  return normalizedText
    .slice(0, promptStart)
    .replace(/[-—]{3,}/g, "")
    .trim();
}

/**
 * 最小化清理：只去掉 "提示词 X｜" 标题行和 "镜头 X" 前缀，
 * 不重构内容结构，保持 LLM 原有的表达方式。
 */
function cleanupPromptCard(raw: string, index: number): string {
  let text = raw
    .replace(/<\/?PROMPT_CARD>/gi, "")
    .replace(/^```(?:[\w-]+)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const promptStart = findPromptBodyStart(text);
  if (promptStart > 0) {
    text = text.slice(promptStart).trim();
  }

  // 1. 去掉第一行的 "提示词 X｜xxx" 或 "提示词 X" 标题
  const lines = text.split('\n');
  const firstLine = lines[0]?.trim() || '';
  if (/^提示词\s*\d/.test(firstLine)) {
    lines.shift();
    text = lines.join('\n').trim();
  }

  text = text.replace(/镜头\s*\d*\s*[（(]\s*(\d+)\s*[-–—~至到]\s*(\d+)\s*(?:秒|s)\s*[）)]\s*[：:]?\s*/gi, "$1-$2s｜");
  text = text.replace(/(\d+)\s*[-–—~至到]\s*(\d+)\s*秒/g, "$1-$2s");

  return text.trim();
}

function findPromptBodyStart(text: string): number {
  const patterns = [
    /(^|\n)\s*9\s*:\s*16\b/i,
    /(^|\n)\s*16\s*:\s*9\b/i,
    /(^|\n)\s*(?:竖屏|横屏|视频类型|画面风格|整体风格|镜头结构)[：:\s]/i,
    /(^|\n)\s*0\s*[-–—~至到]\s*\d{1,3}\s*(?:s|秒)/i
  ];
  const indexes = patterns
    .map((pattern) => {
      const match = text.match(pattern);
      if (!match || match.index === undefined) return -1;
      return match.index + (match[1]?.length || 0);
    })
    .filter((index) => index >= 0);

  return indexes.length ? Math.min(...indexes) : 0;
}

function stripPromptCards(text: string): string {
  return text.replace(/<PROMPT_CARD>[\s\S]*?<\/PROMPT_CARD>/gi, "").trim();
}

function checkBrandKeywords(text: string, userInput?: string): boolean {
  const lines = text.split("\n");
  const negativePrefix = /^(?:[^a-zA-Z一-鿿]*(?:不|不要|不生成|不出现|不需|不要有|禁止|避免|排除|去除|无|没有|无需))[^\n]*$/i;
  const filteredLines = lines.filter((line) => !negativePrefix.test(line.trim()));
  const filteredText = filteredLines.join("\n").toLowerCase();
  const userInputLower = (userInput || "").toLowerCase();
  return BRAND_KEYWORDS.some((keyword) => {
    const keywordLower = keyword.toLowerCase();
    if (userInputLower.includes(keywordLower)) return false;
    return filteredText.includes(keywordLower);
  });
}

function checkSensitiveContent(text: string): boolean {
  const lines = text.split("\n");
  const negativePrefix = /^(?:[^a-zA-Z一-鿿]*(?:不|不要|不生成|不出现|不需|不要有|禁止|避免|排除|去除|无|没有|无需))[^\n]*$/i;
  const filteredLines = lines.filter((line) => !negativePrefix.test(line.trim()));
  const filteredText = filteredLines.join("\n").toLowerCase();
  return SENSITIVE_KEYWORDS.some((keyword) => filteredText.includes(keyword.toLowerCase()));
}

function detectQuestionForUser(text: string): boolean {
  const normalizedText = text.trim().replace(/\s+/g, " ");

  return /[？?]|请(?:先)?(?:确认|补充|提供|说明|明确|告诉我)|请问|你(?:希望|需要|想要|是否|能否|可以)|您(?:希望|需要|想要|是否|能否|可以)|是否|能否|可否|需不需要|要不要|有没有|还是说|或者说|你的意思是|您的意思是|确认后|确认一下|我(?:还)?需要(?:先)?确认/.test(
    normalizedText
  );
}

function buildPromptSegment(
  promptText: string,
  index: number,
  fallbackModel: string,
  fallbackShotMode: ShotMode,
  finalized?: { duration: number; timeRange: string; warnings: string[] }
): PromptSegment {
  const report = guardPromptText(promptText);
  const timeRange = extractTimeRange(report.cleanPrompt);
  const duration = finalized?.duration ?? timeRange.duration;
  const label = finalized?.timeRange ?? timeRange.label;

  return {
    id: createId("prompt"),
    title: extractPromptTitle(index),
    timeRange: label,
    duration,
    videoType: extractField(report.cleanPrompt, "视频类型") || "AI 视频",
    model: fallbackModel,
    shotMode: inferShotMode(report.cleanPrompt, fallbackShotMode),
    prompt: report.cleanPrompt,
    qualityTags: [...report.tags, ...(finalized?.warnings ?? [])]
  };
}

function buildConsistencySuggestion(prompts: PromptSegment[]): string {
  if (prompts.length <= 1) return "";
  const allPromptText = prompts.map((prompt) => prompt.prompt).join("\n");
  const hasRecurringSubject = /同一|主角|女生|男生|角色|产品|App|手机|道具|宠物|车辆|人物/.test(allPromptText);

  if (!hasRecurringSubject) return "";

  return "一致性建议：这组提示词里有贯穿主体。为了让多段生成更稳定，建议准备主角/产品/App界面或关键场景参考图；没有参考图也可以，我会在每段里保持主体外貌、服装、道具和场景描述一致。";
}

function extractPromptTitle(index: number): string {
  return `提示词 ${index + 1}`;
}

function extractTimeRange(prompt: string): { label: string; duration: number } {
  const explicitDurationMatch = prompt.match(/(?:总时长|时长)[：:\s]*(\d+)\s*(?:秒|s)/i);
  if (explicitDurationMatch) {
    const duration = Number(explicitDurationMatch[1]);
    return {
      label: `0-${duration}s`,
      duration
    };
  }

  const ranges = Array.from(
    prompt.matchAll(/(\d+)\s*(?:-|–|—|~|至|到)\s*(\d+)\s*(?:秒|s)/gi)
  );

  if (ranges.length > 0) {
    const starts = ranges.map((match) => Number(match[1]));
    const ends = ranges.map((match) => Number(match[2]));
    const start = Math.min(...starts);
    const end = Math.max(...ends);
    const duration = Math.max(1, end - start);
    return {
      label: `${start}-${end}s`,
      duration
    };
  }

  return {
    label: "0-15s",
    duration: 15
  };
}

function extractField(prompt: string, label: string): string | null {
  const match = prompt.match(new RegExp(`${label}[：:]\\s*([^\\n]+)`));
  return match?.[1]?.trim() || null;
}

function inferShotMode(prompt: string, fallback: ShotMode): ShotMode {
  const shotStructure = extractField(prompt, "镜头结构");

  if (/一镜到底|单镜头|连续镜头/.test(shotStructure || prompt)) {
    return "single";
  }

  if (/多镜头|剪辑|镜头\s*1/.test(shotStructure || prompt)) {
    return "multi";
  }

  return fallback;
}
