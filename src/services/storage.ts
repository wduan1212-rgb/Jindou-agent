import type { ApiSettings, ChatMessage } from "../types/chat";
import type { Project } from "../types/project";
import { createDefaultMemory } from "../types/memory";
import { DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL } from "../data/modelRules";

const PROJECTS_KEY = "jindou.projects.v1";
const ACTIVE_PROJECT_KEY = "jindou.activeProjectId.v1";
const API_SETTINGS_KEY = "jindou.apiSettings.v1";
const LEGACY_SESSION_API_SETTINGS_KEY = "jindou.apiSettings.session.v1";
const MAX_STORAGE_BYTES = 8 * 1024 * 1024; // 8MB safety threshold

export function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createMessage(message: Omit<ChatMessage, "id" | "createdAt">): ChatMessage {
  return {
    ...message,
    id: createId("msg"),
    createdAt: nowIso()
  };
}

export function createInitialProject(): Project {
  const now = nowIso();
  return {
    id: createId("project"),
    title: "新的创作",
    status: "active",
    tag: "对话已开始",
    createdAt: now,
    updatedAt: now,
    messages: [],
    references: [],
    memory: createDefaultMemory()
  };
}

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [createInitialProject()];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [createInitialProject()];
    return parsed.map(migrateProject);
  } catch {
    return [createInitialProject()];
  }
}

export function saveProjects(projects: Project[]): void {
  try {
    const json = JSON.stringify(projects);
    if (json.length > MAX_STORAGE_BYTES) {
      const compacted = compactProjectsForStorage(projects);
      const compactedJson = JSON.stringify(compacted);
      if (compactedJson.length <= MAX_STORAGE_BYTES) {
        localStorage.setItem(PROJECTS_KEY, compactedJson);
      } else {
        tryFallbackSave(compacted);
      }
    } else {
      localStorage.setItem(PROJECTS_KEY, json);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      tryFallbackSave(projects);
    }
  }
}

function tryFallbackSave(projects: Project[]): void {
  const minimal = projects.slice(0, Math.max(1, projects.length - 3)).map((project) => ({
    ...project,
    messages: project.messages.slice(-20).map((message) => ({
      ...message,
      prompts: message.prompts?.map((prompt) => ({
        ...prompt,
        prompt: prompt.prompt.length > 300 ? prompt.prompt.slice(0, 300) + "…" : prompt.prompt
      }))
    })),
    references: []
  }));
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(minimal));
  } catch {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify([createInitialProject()]));
  }
}

function compactProjectsForStorage(projects: Project[]): Project[] {
  return projects.map((project) => ({
    ...project,
    messages: project.messages.map((message) => ({
      ...message,
      prompts: message.prompts?.map((prompt) => ({
        ...prompt,
        prompt: prompt.prompt.length > 600 ? prompt.prompt.slice(0, 600) + "…" : prompt.prompt
      }))
    }))
  }));
}

function migrateProject(raw: Record<string, unknown>): Project {
  const now = nowIso();
  return {
    id: String(raw.id || createId("project")),
    title: String(raw.title || "新的创作"),
    status: raw.status === "draft" ? "draft" : "active",
    tag: String(raw.tag || ""),
    createdAt: String(raw.createdAt || now),
    updatedAt: String(raw.updatedAt || now),
    messages: Array.isArray(raw.messages)
      ? raw.messages.map((message: Record<string, unknown>) => ({
          id: String(message.id || createId("msg")),
          role: message.role === "assistant" ? "assistant" : "user",
          kind: ["text", "questions", "prompts", "notice"].includes(String(message.kind))
            ? (String(message.kind) as ChatMessage["kind"])
            : "text",
          content: typeof message.content === "string" ? message.content : "",
          questions: Array.isArray(message.questions) ? message.questions as ChatMessage["questions"] : undefined,
          prompts: Array.isArray(message.prompts) ? message.prompts as ChatMessage["prompts"] : undefined,
          createdAt: String(message.createdAt || now)
        }))
      : [],
    references: Array.isArray(raw.references) ? raw.references as Project["references"] : [],
    memory: raw.memory && typeof raw.memory === "object"
      ? {
          defaultModel: String((raw.memory as Record<string, unknown>).defaultModel || "Seedance"),
          defaultShotMode: (raw.memory as Record<string, unknown>).defaultShotMode === "single" ? "single" : "multi",
          stylePreferences: Array.isArray((raw.memory as Record<string, unknown>).stylePreferences)
            ? (raw.memory as Record<string, unknown>).stylePreferences as string[]
            : [],
          voicePreferences: Array.isArray((raw.memory as Record<string, unknown>).voicePreferences)
            ? (raw.memory as Record<string, unknown>).voicePreferences as string[]
            : [],
          negativeRules: Array.isArray((raw.memory as Record<string, unknown>).negativeRules)
            ? (raw.memory as Record<string, unknown>).negativeRules as string[]
            : [],
          notes: Array.isArray((raw.memory as Record<string, unknown>).notes)
            ? (raw.memory as Record<string, unknown>).notes as string[]
            : []
        }
      : createDefaultMemory()
  };
}

export function loadActiveProjectId(): string | null {
  return localStorage.getItem(ACTIVE_PROJECT_KEY);
}

export function saveActiveProjectId(projectId: string): void {
  localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
}

export function loadApiSettings(): ApiSettings {
  const fallback: ApiSettings = {
    llmBaseUrl: DEFAULT_LLM_BASE_URL,
    llmModel: DEFAULT_LLM_MODEL,
    llmApiKey: "",
    videoBaseUrl: "",
    videoModel: "Seedance",
    videoApiKey: ""
  };

  try {
    const raw = localStorage.getItem(API_SETTINGS_KEY) || sessionStorage.getItem(LEGACY_SESSION_API_SETTINGS_KEY);
    if (!raw) return resolveEnvFallback(fallback);
    const settings = { ...fallback, ...(JSON.parse(raw) as Partial<ApiSettings>) };
    if (!localStorage.getItem(API_SETTINGS_KEY)) {
      localStorage.setItem(API_SETTINGS_KEY, JSON.stringify(settings));
    }
    return settings;
  } catch {
    return resolveEnvFallback(fallback);
  }
}

function resolveEnvFallback(fallback: ApiSettings): ApiSettings {
  if (typeof process !== "undefined" && process.env) {
    return {
      ...fallback,
      llmApiKey: process.env.LLM_API_KEY || fallback.llmApiKey,
      llmBaseUrl: process.env.LLM_BASE_URL || fallback.llmBaseUrl,
      llmModel: process.env.LLM_MODEL || fallback.llmModel,
      videoApiKey: process.env.VIDEO_API_KEY || fallback.videoApiKey
    };
  }
  return fallback;
}

export function saveApiSettings(settings: ApiSettings): void {
  localStorage.setItem(API_SETTINGS_KEY, JSON.stringify(settings));
  sessionStorage.removeItem(LEGACY_SESSION_API_SETTINGS_KEY);
}

export function clearSavedApiKey(): void {
  const settings = loadApiSettings();
  saveApiSettings({ ...settings, llmApiKey: "", videoApiKey: "" });
}
