export const MODEL_RULES = {
  seedance: {
    label: "Seedance",
    maxSegmentSeconds: 15,
    defaultAspectRatio: "9:16",
    defaultStructure: "多镜头剪辑"
  },
  generic: {
    label: "通用视频模型",
    maxSegmentSeconds: 15,
    defaultAspectRatio: "9:16",
    defaultStructure: "多镜头剪辑"
  }
} as const;

export const DEFAULT_LLM_BASE_URL = "https://api.deepseek.com/v1";
export const DEFAULT_LLM_MODEL = "deepseek-chat";
export const DEFAULT_VIDEO_MODEL = "Seedance";
