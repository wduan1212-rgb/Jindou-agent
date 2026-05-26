export type MessageRole = "user" | "assistant";

export type MessageKind = "text" | "questions" | "prompts" | "notice";

export type ShotMode = "multi" | "single";

export type ReferenceKind = "role" | "product" | "scene" | "style" | "mixed";

export interface QuestionOption {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

export interface AgentQuestion {
  id: string;
  title: string;
  prompt: string;
  icon: string;
  options: QuestionOption[];
}

export interface PromptSegment {
  id: string;
  title: string;
  timeRange: string;
  duration: number;
  videoType: string;
  model: string;
  shotMode: ShotMode;
  prompt: string;
  qualityTags: string[];
}

export interface ReferenceAsset {
  id: string;
  name: string;
  type: string;
  url: string;
  kind: ReferenceKind;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  kind: MessageKind;
  content?: string;
  questions?: AgentQuestion[];
  prompts?: PromptSegment[];
  createdAt: string;
}

export interface ApiSettings {
  llmBaseUrl: string;
  llmModel: string;
  llmApiKey: string;
  videoBaseUrl: string;
  videoModel: string;
  videoApiKey: string;
}

export type MemoryCategory = "stylePreferences" | "voicePreferences" | "negativeRules" | "promptTemplates" | "notes";
