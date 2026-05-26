import { JINDOU_SYSTEM_PROMPT } from "../agent/systemPrompt";
import type { CreativeAnalysis } from "../agent/questionPlanner";
import { guardPromptText } from "../agent/promptQualityGuard";
import type { PromptSegment, ReferenceAsset, ShotMode } from "../types/chat";
import type { ProjectMemory } from "../types/memory";
import { loadApiSettings } from "./storage";

export interface ChatCompletionMessage {
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

export class LlmError extends Error {
  code: "auth" | "network" | "server" | "timeout";
  status?: number;
  constructor(message: string, code: LlmError["code"], status?: number) {
    super(message);
    this.name = "LlmError";
    this.code = code;
    this.status = status;
  }

  toUserMessage(): string {
    switch (this.code) {
      case "auth":
        return "API Key 无效或已过期，请在 API 设置中更新。";
      case "network":
        return "网络连接失败，请检查网络后重试。";
      case "server":
        return `模型服务暂时不可用（${this.status || "未知"}），请稍后重试。`;
      case "timeout":
        return "请求超时，模型响应时间过长，请稍后重试。";
    }
  }
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

/** 带重试的聊天请求。失败时重试一次，两次都失败则抛出 LlmError。 */
export async function chat(messages: ChatCompletionMessage[]): Promise<string> {
  let lastError: LlmError | null = null;
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    try {
      const result = await callChatCompletion(messages, null);
      if (result) return result;
    } catch (error) {
      lastError = error instanceof LlmError ? error : new LlmError("未知错误", "network");
      if (lastError.code === "auth") break;
    }
  }
  if (lastError) throw lastError;
  return "";
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

async function callChatCompletion(
  messages: ChatCompletionMessage[],
  responseFormat: { type: "json_object" } | null = { type: "json_object" },
  timeoutMs = 45000
): Promise<string | null> {
  const settings = loadApiSettings();
  const runsInBrowser = typeof window !== "undefined" && typeof window.location !== "undefined";
  const body: {
    model: string;
    messages: ChatCompletionMessage[];
    temperature: number;
    baseURL?: string;
    response_format?: { type: "json_object" };
  } = {
    baseURL: settings.llmBaseUrl,
    model: settings.llmModel,
    messages,
    temperature: 0.72
  };

  if (runsInBrowser) {
    body.baseURL = settings.llmBaseUrl;
  }

  if (responseFormat) {
    body.response_format = responseFormat;
  }

  const headers: Record<string, string> = {
    "content-type": "application/json"
  };

  if (settings.llmApiKey) {
    headers.authorization = `Bearer ${settings.llmApiKey}`;
  }

  const endpoint = runsInBrowser
    ? "/api/llm/chat"
    : `${settings.llmBaseUrl.replace(/\/+$/, "")}/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new LlmError("请求超时", "timeout");
    }
    throw new LlmError("网络连接失败", "network");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new LlmError("API Key 无效", "auth", response.status);
    }
    if (response.status === 429 || response.status >= 500) {
      throw new LlmError("模型服务暂不可用", "server", response.status);
    }
    throw new LlmError("请求失败", "server", response.status);
  }

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
