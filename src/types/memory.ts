import type { ShotMode } from "./chat";

export interface ProjectMemory {
  defaultModel: string;
  defaultShotMode: ShotMode;
  stylePreferences: string[];
  voicePreferences: string[];
  negativeRules: string[];
  notes: string[];
}

export const createDefaultMemory = (): ProjectMemory => ({
  defaultModel: "Seedance",
  defaultShotMode: "multi",
  stylePreferences: ["真实手机手持 vlog", "生活化表演", "少广告腔"],
  voicePreferences: ["口播自然、语速适中"],
  negativeRules: ["不生成字幕、文字、logo、水印", "不写后期加入", "不写与上一段一致"],
  notes: []
});
