import type { ApiSettings, ChatMessage } from "../types/chat";
import type { Conversation, LegacyProject, ProjectFolder, WorkspaceData } from "../types/project";
import { createDefaultGlobalMemory, createDefaultMemory, type GlobalProjectMemory, type ProjectMemory } from "../types/memory";
import { DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL } from "../data/modelRules";

const WORKSPACE_KEY = "jindou.workspace.v2";
const LEGACY_PROJECTS_KEY = "jindou.projects.v1";
const API_SETTINGS_KEY = "jindou.apiSettings.v1";
const LEGACY_SESSION_API_SETTINGS_KEY = "jindou.apiSettings.session.v1";
const MAX_STORAGE_BYTES = 8 * 1024 * 1024;

export function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

export function nowIso(): string { return new Date().toISOString(); }

export function createMessage(message: Omit<ChatMessage, "id" | "createdAt">): ChatMessage {
  return { ...message, id: createId("msg"), createdAt: nowIso() };
}

// ===== Workspace =====

export function createDefaultWorkspace(): WorkspaceData {
  const folder = createDefaultFolder("默认项目");
  const convo = createDefaultConversation(folder.id);
  folder.conversationIds = [convo.id];
  return {
    schemaVersion: 2,
    folders: [folder],
    conversations: [convo],
    globalMemory: createDefaultGlobalMemory(),
    activeFolderId: folder.id,
    activeConversationId: convo.id
  };
}

export function createDefaultFolder(title: string): ProjectFolder {
  const now = nowIso();
  return {
    id: createId("folder"),
    title,
    status: "active",
    createdAt: now,
    updatedAt: now,
    memory: createDefaultMemory(),
    conversationIds: []
  };
}

export function createDefaultConversation(folderId: string): Conversation {
  const now = nowIso();
  return {
    id: createId("convo"),
    folderId,
    title: "新的创作",
    status: "active",
    tag: "对话已开始",
    createdAt: now,
    updatedAt: now,
    messages: [],
    references: []
  };
}

export function loadWorkspace(): WorkspaceData {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WorkspaceData;
      if (parsed.schemaVersion === 2 && parsed.folders?.length) return migrateWorkspaceFields(parsed);
    }
  } catch {}

  // v1 → v2 迁移
  try {
    const raw = localStorage.getItem(LEGACY_PROJECTS_KEY);
    if (raw) {
      const legacy = JSON.parse(raw) as LegacyProject[];
      if (Array.isArray(legacy) && legacy.length) return migrateLegacyProjects(legacy);
    }
  } catch {}

  return createDefaultWorkspace();
}

function migrateWorkspaceFields(ws: WorkspaceData): WorkspaceData {
  return {
    ...ws,
    globalMemory: { ...createDefaultGlobalMemory(), ...ws.globalMemory },
    folders: ws.folders.map((f) => ({
      ...f,
      memory: { ...createDefaultMemory(), ...f.memory, promptTemplates: f.memory.promptTemplates || [] },
      conversationIds: f.conversationIds || []
    })),
    conversations: ws.conversations.map((c) => ({ ...c, references: c.references || [], tag: c.tag || "" })),
    activeFolderId: ws.activeFolderId || ws.folders[0]?.id || "",
    activeConversationId: ws.activeConversationId || ws.conversations[0]?.id || ""
  };
}

function migrateLegacyProjects(legacy: LegacyProject[]): WorkspaceData {
  const folders: ProjectFolder[] = [];
  const conversations: Conversation[] = [];
  for (const lp of legacy) {
    const folder = createDefaultFolder(lp.title || "迁移项目");
    folder.memory = { ...createDefaultMemory(), ...lp.memory, promptTemplates: [] };
    folder.updatedAt = lp.updatedAt || folder.createdAt;
    const convo = createDefaultConversation(folder.id);
    convo.title = lp.title || "历史对话";
    convo.messages = lp.messages || [];
    convo.references = lp.references || [];
    convo.tag = lp.tag || "";
    convo.updatedAt = lp.updatedAt || convo.createdAt;
    folder.conversationIds = [convo.id];
    folders.push(folder);
    conversations.push(convo);
  }
  return {
    schemaVersion: 2,
    folders,
    conversations,
    globalMemory: createDefaultGlobalMemory(),
    activeFolderId: folders[0]?.id || "",
    activeConversationId: conversations[0]?.id || ""
  };
}

export function saveWorkspace(ws: WorkspaceData): void {
  try {
    const json = JSON.stringify(ws);
    if (json.length > MAX_STORAGE_BYTES) {
      const compacted = compactWorkspace(ws);
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(compacted));
    } else {
      localStorage.setItem(WORKSPACE_KEY, json);
    }
  } catch {
    tryFallbackSave(ws);
  }
}

function tryFallbackSave(ws: WorkspaceData): void {
  const minimal = createDefaultWorkspace();
  minimal.folders = ws.folders.slice(0, 3).map((f) => ({
    ...f,
    conversationIds: f.conversationIds.slice(0, 5)
  }));
  minimal.conversations = ws.conversations.slice(0, 5).map((c) => ({
    ...c,
    messages: c.messages.slice(-10),
    references: []
  }));
  minimal.globalMemory = ws.globalMemory;
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(minimal));
  } catch {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(createDefaultWorkspace()));
  }
}

function compactWorkspace(ws: WorkspaceData): WorkspaceData {
  return {
    ...ws,
    conversations: ws.conversations.map((c) => ({
      ...c,
      messages: c.messages.map((m) => ({
        ...m,
        prompts: m.prompts?.map((p) => ({
          ...p,
          prompt: p.prompt.length > 600 ? p.prompt.slice(0, 600) + "…" : p.prompt
        }))
      }))
    }))
  };
}

// ===== API Settings =====

export function loadApiSettings(): ApiSettings {
  const defaultKey = typeof __DEFAULT_LLM_API_KEY__ !== "undefined" ? __DEFAULT_LLM_API_KEY__ : "";
  const fallback: ApiSettings = {
    llmBaseUrl: DEFAULT_LLM_BASE_URL, llmModel: DEFAULT_LLM_MODEL, llmApiKey: defaultKey,
    videoBaseUrl: "", videoModel: "Seedance", videoApiKey: ""
  };
  try {
    const raw = localStorage.getItem(API_SETTINGS_KEY) || sessionStorage.getItem(LEGACY_SESSION_API_SETTINGS_KEY);
    if (!raw) return resolveEnvFallback(fallback);
    const settings = { ...fallback, ...(JSON.parse(raw) as Partial<ApiSettings>) };
    if (!localStorage.getItem(API_SETTINGS_KEY)) localStorage.setItem(API_SETTINGS_KEY, JSON.stringify(settings));
    return settings;
  } catch { return resolveEnvFallback(fallback); }
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
