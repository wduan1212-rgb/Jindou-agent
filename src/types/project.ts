import type { ChatMessage, ReferenceAsset } from "./chat";
import type { ProjectMemory } from "./memory";

export interface Project {
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
