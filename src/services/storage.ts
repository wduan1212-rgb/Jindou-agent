import type { ApiSettings, ChatMessage } from "../types/chat";
import type { Project } from "../types/project";
import { createDefaultMemory } from "../types/memory";
import { DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL } from "../data/modelRules";

const PROJECTS_KEY = "jindou.projects.v1";
const ACTIVE_PROJECT_KEY = "jindou.activeProjectId.v1";
const API_SETTINGS_KEY = "jindou.apiSettings.session.v1";

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
    const parsed = JSON.parse(raw) as Project[];
    return parsed.length > 0 ? parsed : [createInitialProject()];
  } catch {
    return [createInitialProject()];
  }
}

export function saveProjects(projects: Project[]): void {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
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
    const raw = sessionStorage.getItem(API_SETTINGS_KEY);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<ApiSettings>) };
  } catch {
    return fallback;
  }
}

export function saveApiSettings(settings: ApiSettings): void {
  sessionStorage.setItem(API_SETTINGS_KEY, JSON.stringify(settings));
}

export function clearSessionApiKey(): void {
  const settings = loadApiSettings();
  saveApiSettings({ ...settings, llmApiKey: "", videoApiKey: "" });
}
