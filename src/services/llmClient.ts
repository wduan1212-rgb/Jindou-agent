import { JINDOU_SYSTEM_PROMPT } from "../agent/systemPrompt";
import type { CreativeAnalysis } from "../agent/questionPlanner";
import { guardPromptText } from "../agent/promptQualityGuard";
import type { PromptSegment, ReferenceAsset, ShotMode } from "../types/chat";
import type { ProjectMemory } from "../types/memory";
import { loadApiSettings } from "./storage";

interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LlmPromptResponse {
  summary: string;
  segments: Array<{
    title: string;
    timeRange: string;
    duration: number;
    videoType: string;
    model: string;
    shotMode: ShotMode;
    prompt: string;
  }>;
}

export async function getLocalLlmConfig(): Promise<{
  hasKey: boolean;
  baseURL: string;
  model: string;
} | null> {
  try {
    const response = await fetch("/api/llm/config");
    if (!response.ok) return null;
    return (await response.json()) as { hasKey: boolean; baseURL: string; model: string };
  } catch {
    return null;
  }
}

export async function requestPromptFromLlm(args: {
  brief: string;
  analysis: CreativeAnalysis;
  memory: ProjectMemory;
  references: ReferenceAsset[];
}): Promise<{ summary: string; segments: PromptSegment[] } | null> {
  const messages: ChatCompletionMessage[] = [
    { role: "system", content: JINDOU_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        `用户完整需求：${args.brief}`,
        `分析结果：${JSON.stringify(args.analysis)}`,
        `项目记忆：${JSON.stringify(args.memory)}`,
        `参考素材数量：${args.references.length}`,
        "请根据上述内容生成最终视频模型提示词。严格返回 JSON，不要输出 Markdown。"
      ].join("\n")
    }
  ];

  const payload = await callChatCompletion(messages);
  if (!payload) return null;

  const parsed = parseJsonResponse(payload);
  if (!parsed?.segments?.length) return null;

  return {
    summary: parsed.summary || "已根据需求生成提示词。",
    segments: parsed.segments.map((segment, index) => {
      const report = guardPromptText(segment.prompt);
      return {
        id: `llm-prompt-${index}-${Date.now()}`,
        title: segment.title || `提示词 ${index + 1}`,
        timeRange: segment.timeRange || `${index * 15}-${index * 15 + segment.duration} 秒`,
        duration: segment.duration || 15,
        videoType: segment.videoType || args.analysis.videoType,
        model: segment.model || args.analysis.model,
        shotMode: segment.shotMode || args.analysis.shotMode,
        prompt: report.cleanPrompt,
        qualityTags: report.tags
      };
    })
  };
}

async function callChatCompletion(messages: ChatCompletionMessage[]): Promise<string | null> {
  const settings = loadApiSettings();
  const body = {
    model: settings.llmModel,
    messages,
    temperature: 0.72,
    response_format: { type: "json_object" }
  };

  const endpoint = settings.llmApiKey
    ? `${settings.llmBaseUrl.replace(/\/+$/, "")}/chat/completions`
    : "/api/llm/chat";

  const headers: Record<string, string> = {
    "content-type": "application/json"
  };

  if (settings.llmApiKey) {
    headers.authorization = `Bearer ${settings.llmApiKey}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) return null;
  const data = await response.json();
  return data?.choices?.[0]?.message?.content || null;
}

function parseJsonResponse(text: string): LlmPromptResponse | null {
  try {
    return JSON.parse(text) as LlmPromptResponse;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as LlmPromptResponse;
    } catch {
      return null;
    }
  }
}
