import { applyMemoryUpdates, extractMemoryUpdates } from "./memoryManager";
import { composePromptSegments } from "./promptComposer";
import { analyzeCreativeRequest, buildAgentQuestions } from "./questionPlanner";
import { requestPromptFromLlm } from "../services/llmClient";
import { createMessage } from "../services/storage";
import type { ChatMessage, ReferenceAsset } from "../types/chat";
import type { ProjectMemory } from "../types/memory";

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

export async function runAgentTurn(args: AgentTurnArgs): Promise<AgentTurnResult> {
  const memoryUpdates = extractMemoryUpdates(args.input);
  const nextMemory = applyMemoryUpdates(args.memory, memoryUpdates);

  if (memoryUpdates.length > 0 && args.input.length < 90) {
    return {
      memory: nextMemory,
      messages: [
        createMessage({
          role: "assistant",
          kind: "notice",
          content: `已保存到项目记忆：${memoryUpdates.join("；")}`
        })
      ]
    };
  }

  const brief = buildBrief(args.messages, args.input);
  const analysis = analyzeCreativeRequest(brief, args.references, nextMemory);
  const questions = buildAgentQuestions(analysis);

  if (questions.length > 0) {
    return {
      memory: nextMemory,
      messages: [
        createMessage({
          role: "assistant",
          kind: "questions",
          content: buildQuestionIntro(analysis.missingInfo),
          questions
        })
      ]
    };
  }

  const localPrompts = composePromptSegments({
    analysis,
    references: args.references,
    memory: nextMemory
  });

  if (analysis.specificity === "script") {
    return {
      memory: nextMemory,
      messages: [
        createMessage({
          role: "assistant",
          kind: "prompts",
          content: `我按你给的完整脚本做了导演级整理，保留原有时间轴和镜头意图。${localPrompts.length > 1 ? ` 已拆分为 ${localPrompts.length} 条独立提示词。` : ""}`,
          prompts: localPrompts
        })
      ]
    };
  }

  const llmResult = await requestPromptFromLlm({
    brief,
    analysis,
    memory: nextMemory,
    references: args.references
  }).catch(() => null);

  const llmPromptsAreReady =
    llmResult?.segments.length === localPrompts.length &&
    llmResult.segments.every((prompt) => isPromptStructurallyReady(prompt.prompt));
  const prompts = llmPromptsAreReady ? llmResult.segments : localPrompts;

  const sourceText = llmPromptsAreReady
    ? llmResult.summary
    : "已生成提示词预览。本地规则已完成拆分、镜头结构、声音规则和负面约束。";

  return {
    memory: nextMemory,
    messages: [
      createMessage({
        role: "assistant",
        kind: "prompts",
        content: `${sourceText}${prompts.length > 1 ? ` 已拆分为 ${prompts.length} 条独立提示词。` : ""}`,
        prompts
      })
    ]
  };
}

function buildBrief(messages: ChatMessage[], input: string): string {
  const history = messages
    .filter((message) => message.role === "user" && message.content)
    .slice(-8)
    .map((message) => message.content)
    .join("\n");
  return [history, input].filter(Boolean).join("\n").trim();
}

function buildQuestionIntro(missingInfo: string[]): string {
  const isEarlyBrief = missingInfo.some((item) =>
    ["广告主题", "主推对象", "目标受众", "核心情绪"].includes(item)
  );

  if (isEarlyBrief) {
    return [
      "可以，我们先把这条广告聊清楚一点，不急着生成。",
      "我会先确认创意方向，再帮你规划成可生成的视频提示词。"
    ].join("\n");
  }

  return [
    "方向已经比较清楚了，我再确认几个会影响画面的关键点。",
    `还需要确认：${missingInfo.join("、")}。`
  ].join("\n");
}

function isPromptStructurallyReady(prompt: string): boolean {
  const required = ["声音", "负面约束"];
  const hasRequiredSections = required.every((section) => prompt.includes(section));
  const hasShotStructure = /镜头\s*1|连续镜头描述/.test(prompt);
  const hasForbiddenDependency = /上一段|同上|后期加入|根据需要|可选择|或者|参考图规则/.test(prompt);
  const leaksModelName = /Seedance/i.test(prompt);

  return hasRequiredSections && hasShotStructure && !hasForbiddenDependency && !leaksModelName;
}
