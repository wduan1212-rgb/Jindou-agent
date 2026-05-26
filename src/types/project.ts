import type { ChatMessage, ReferenceAsset } from "./chat";
import type { GlobalProjectMemory, ProjectMemory } from "./memory";

export interface ProjectFolder {
  id: string;
  title: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  memory: ProjectMemory;
  conversationIds: string[];
}

export interface Conversation {
  id: string;
  folderId: string;
  title: string;
  status: "active" | "draft";
  tag: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  references: ReferenceAsset[];
}

export interface WorkspaceData {
  schemaVersion: 2;
  folders: ProjectFolder[];
  conversations: Conversation[];
  globalMemory: GlobalProjectMemory;
  activeFolderId: string;
  activeConversationId: string;
}

/** @deprecated 旧版 Project 类型，v1 → v2 迁移用 */
export interface LegacyProject {
  id: string;
  title: string;
  status: "active" | "draft";
  tag: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  references: ReferenceAsset[];
  memory: ProjectMemory;
}
