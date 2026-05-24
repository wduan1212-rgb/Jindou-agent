import type { AgentQuestion, ReferenceAsset, ShotMode } from "../types/chat";
import type { ProjectMemory } from "../types/memory";
import { extractTimelineItems, parseDurationSeconds } from "./durationSplitter";

export interface CreativeAnalysis {
  originalText: string;
  duration: number;
  videoType: string;
  model: string;
  shotMode: ShotMode;
  style: string;
  voiceMode: "unknown" | "dialogue" | "host" | "voiceover" | "none";
  voiceLanguage: string;
  referenceMode: "unknown" | "with-reference" | "no-reference";
  specificity: "vague" | "brief" | "script";
  timelineCount: number;
  readyToGenerate: boolean;
  missingInfo: string[];
}

const videoTypePatterns: Array<[RegExp, string]> = [
  [/vlog|探店|旅行|酒店|餐厅|美食|出游|生活/i, "真实 vlog 广告"],
  [/剧情|反转|冲突|故事|短剧/i, "剧情反转广告"],
  [/护肤|美妆|产品|功能|开箱|测评|app|应用|软件/i, "产品功能展示"],
  [/游戏|战斗|角色|关卡|boss/i, "游戏剧情广告"],
  [/品牌|高级|质感|大片/i, "高级品牌短片"]
];

export function analyzeCreativeRequest(
  text: string,
  references: ReferenceAsset[],
  memory: ProjectMemory
): CreativeAnalysis {
  const normalized = text.trim();
  const duration = parseDurationSeconds(normalized, 15);
  const videoType = inferVideoType(normalized);
  const model = inferModel(normalized, memory.defaultModel);
  const shotMode = inferShotMode(normalized, memory.defaultShotMode);
  const style = inferStyle(normalized, memory);
  const voiceMode = inferVoiceMode(normalized);
  const voiceLanguage = inferVoiceLanguage(normalized);
  const referenceMode = inferReferenceMode(normalized, references);
  const timelineCount = extractTimelineItems(normalized).length;
  const specificity = inferSpecificity(normalized, timelineCount);
  const missingInfo: string[] = [];

  if (specificity === "vague") {
    missingInfo.push("广告主题", "主推对象", "目标受众", "核心情绪");
  }
  if (specificity !== "script" && !hasConcreteScene(normalized)) {
    missingInfo.push("关键画面");
  }
  if (specificity !== "script" && !hasGoal(normalized)) {
    missingInfo.push("广告目标");
  }
  if (specificity !== "script" && voiceMode === "unknown") missingInfo.push("口播方式");
  if (voiceMode !== "none" && voiceMode !== "unknown" && voiceLanguage === "未指定") {
    missingInfo.push("口播语言");
  }
  if (specificity !== "script" && referenceMode === "unknown") missingInfo.push("参考图");
  if (specificity !== "script" && !/多镜头|单镜头|一镜到底|剪辑|分镜|镜头/.test(normalized)) {
    missingInfo.push("镜头形式");
  }

  return {
    originalText: normalized,
    duration,
    videoType,
    model,
    shotMode,
    style,
    voiceMode,
    voiceLanguage,
    referenceMode,
    specificity,
    timelineCount,
    readyToGenerate: missingInfo.length === 0,
    missingInfo
  };
}

export function buildAgentQuestions(analysis: CreativeAnalysis): AgentQuestion[] {
  const questions: AgentQuestion[] = [];

  if (analysis.missingInfo.includes("广告主题")) {
    questions.push({
      id: "ad-theme",
      title: "广告主题",
      prompt: "这条广告最想讲什么主题？",
      icon: "Clapperboard",
      options: [
        { id: "travel", label: "旅行治愈", recommended: true },
        { id: "product", label: "产品种草" },
        { id: "service", label: "服务转化" },
        { id: "story", label: "情绪故事" },
        { id: "custom", label: "我补充具体主题" }
      ]
    });
  }

  if (analysis.missingInfo.includes("主推对象")) {
    questions.push({
      id: "promoted-object",
      title: "主推对象",
      prompt: "这条广告主要推什么？",
      icon: "Images",
      options: [
        { id: "app", label: "App / 平台", recommended: true },
        { id: "brand", label: "品牌心智" },
        { id: "product", label: "具体产品" },
        { id: "place", label: "目的地 / 门店" },
        { id: "offer", label: "活动 / 优惠" }
      ]
    });
  }

  if (analysis.missingInfo.includes("目标受众")) {
    questions.push({
      id: "audience",
      title: "目标受众",
      prompt: "主要想打动哪类人？",
      icon: "Languages",
      options: [
        { id: "young-women", label: "年轻女性", recommended: true },
        { id: "urban-workers", label: "都市上班族" },
        { id: "families", label: "家庭旅行人群" },
        { id: "students", label: "学生 / 年轻人" },
        { id: "broad", label: "泛人群" }
      ]
    });
  }

  if (analysis.missingInfo.includes("核心情绪")) {
    questions.push({
      id: "emotion-arc",
      title: "核心情绪",
      prompt: "希望观众感受到怎样的情绪变化？",
      icon: "Film",
      options: [
        { id: "healing", label: "压抑到治愈", recommended: true },
        { id: "surprise", label: "普通到惊喜" },
        { id: "trust", label: "犹豫到信任" },
        { id: "desire", label: "平淡到向往" },
        { id: "fun", label: "轻松搞笑" }
      ]
    });
  }

  if (analysis.missingInfo.includes("关键画面")) {
    questions.push({
      id: "key-visual",
      title: "关键画面",
      prompt: "你脑中最想保留的核心画面是哪类？",
      icon: "Images",
      options: [
        { id: "phone-split", label: "手机操作 + 分屏", recommended: true },
        { id: "role-scene", label: "人物生活场景" },
        { id: "product-close", label: "产品细节特写" },
        { id: "destination", label: "目的地风景" },
        { id: "none", label: "你先帮我设计" }
      ]
    });
  }

  if (analysis.missingInfo.includes("广告目标")) {
    questions.push({
      id: "ad-goal",
      title: "广告目标",
      prompt: "这条广告最后更想完成什么？",
      icon: "Clapperboard",
      options: [
        { id: "desire", label: "制造旅行向往", recommended: true },
        { id: "download", label: "引导下载 / 使用" },
        { id: "booking", label: "强化一站式预订" },
        { id: "brand", label: "建立品牌好感" },
        { id: "sales", label: "促进转化" }
      ]
    });
  }

  if (analysis.missingInfo.includes("视频类型")) {
    questions.push({
      id: "video-type",
      title: "视频类型",
      prompt: "这条视频你更希望做成哪种类型？",
      icon: "Clapperboard",
      options: [
        { id: "vlog", label: "真实 vlog 广告", recommended: true },
        { id: "story", label: "剧情反转广告" },
        { id: "product", label: "产品功能展示" },
        { id: "brand", label: "高级品牌短片" },
        { id: "auto", label: "你根据内容判断" }
      ]
    });
  }

  if (analysis.missingInfo.includes("口播方式")) {
    questions.push({
      id: "voice-mode",
      title: "口播方式",
      prompt: "这条视频需要口播吗？",
      icon: "Mic2",
      options: [
        { id: "host", label: "角色面对镜头口播" },
        { id: "voiceover", label: "画外音旁白" },
        { id: "none", label: "不需要口播", recommended: true },
        { id: "auto", label: "你帮我判断" }
      ]
    });
  }

  if (analysis.missingInfo.includes("口播语言")) {
    questions.push({
      id: "voice-language",
      title: "口播语言",
      prompt: "如果有口播，口播语言希望是哪一种？",
      icon: "Languages",
      options: [
        { id: "zh", label: "中文", recommended: true },
        { id: "en", label: "英文" },
        { id: "local", label: "当地语言" },
        { id: "mix", label: "中英混合" },
        { id: "tone", label: "只写声线和语气" }
      ]
    });
  }

  if (analysis.missingInfo.includes("参考图")) {
    questions.push({
      id: "references",
      title: "参考图",
      prompt: "这条视频会使用参考图吗？",
      icon: "Images",
      options: [
        { id: "role", label: "有角色参考图" },
        { id: "product", label: "有产品参考图" },
        { id: "scene", label: "有场景参考图" },
        { id: "style", label: "有风格参考图" },
        { id: "none", label: "没有参考图", recommended: true }
      ]
    });
  }

  if (analysis.missingInfo.includes("镜头形式")) {
    questions.push({
      id: "shot-mode",
      title: "镜头形式",
      prompt: "这条视频你希望是哪种镜头形式？",
      icon: "Film",
      options: [
        { id: "multi", label: "多镜头剪辑", recommended: true },
        { id: "single", label: "单镜头一镜到底" },
        { id: "auto", label: "你根据内容判断" }
      ]
    });
  }

  return questions.slice(0, analysis.specificity === "vague" ? 5 : 4);
}

function inferVideoType(text: string): string {
  for (const [pattern, type] of videoTypePatterns) {
    if (pattern.test(text)) return type;
  }
  return "真实 vlog 广告";
}

function inferModel(text: string, fallback: string): string {
  if (/seedance/i.test(text)) return "Seedance";
  if (/可灵|kling/i.test(text)) return "可灵";
  if (/即梦/i.test(text)) return "即梦";
  if (/runway/i.test(text)) return "Runway";
  return fallback || "Seedance";
}

function inferShotMode(text: string, fallback: ShotMode): ShotMode {
  if (/单镜头|一镜到底|长镜头/.test(text)) return "single";
  if (/多镜头|剪辑|分镜|快切|拆分/.test(text)) return "multi";
  return fallback || "multi";
}

function inferSpecificity(text: string, timelineCount: number): CreativeAnalysis["specificity"] {
  if (timelineCount >= 2 || text.length > 260) return "script";
  if (
    text.length < 18 ||
    /^(想做一个广告|我想做一个广告|做个广告|想拍广告|广告)$/.test(text.trim()) ||
    /随便|不知道|想做个视频|帮我想|好玩的/.test(text)
  ) {
    return "vague";
  }
  return "brief";
}

function hasConcreteScene(text: string): boolean {
  return /室内|室外|窗|手机|餐厅|酒店|海边|街|浴室|厨房|办公室|车|机场|分屏|雨|阳光|人物|主角|产品/.test(text);
}

function hasGoal(text: string): boolean {
  return /吸引|转化|下载|预订|种草|品牌|治愈|向往|信任|展示|推广|广告|CTA|购买|使用/.test(text);
}

function inferStyle(text: string, memory: ProjectMemory): string {
  if (/真实|自然|vlog|探店|生活/.test(text)) return "真实自然";
  if (/电影|质感|品牌|高级/.test(text)) return "电影质感";
  if (/明亮|清新|干净|白色/.test(text)) return "明亮清新";
  if (/复古|胶片|怀旧/.test(text)) return "复古胶片";
  return memory.stylePreferences[0] || "真实自然";
}

function inferVoiceMode(text: string): CreativeAnalysis["voiceMode"] {
  if (/不需要口播|不要口播|无口播|没有口播|只保留环境音/.test(text)) return "none";
  if (/画外音|旁白|voiceover/i.test(text)) return "voiceover";
  if (/面对镜头口播|主播|口播/.test(text)) return "host";
  if (/对白|台词|说：|说:|对话/.test(text)) return "dialogue";
  return "unknown";
}

function inferVoiceLanguage(text: string): string {
  if (/中文|汉语|普通话/.test(text)) return "中文";
  if (/英文|英语|English/i.test(text)) return "英文";
  if (/泰语|马来语|当地语言/.test(text)) return "当地语言";
  if (/中英混合/.test(text)) return "中英混合";
  return "未指定";
}

function inferReferenceMode(text: string, references: ReferenceAsset[]): CreativeAnalysis["referenceMode"] {
  if (references.length > 0) return "with-reference";
  if (/没有参考图|无参考图|没有参考|无参考|直接文生视频|完全创意/.test(text)) return "no-reference";
  if (/参考图|参考图片|参考视频|素材|图片/.test(text)) return "with-reference";
  return "unknown";
}
