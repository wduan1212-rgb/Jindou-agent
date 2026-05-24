import { NEGATIVE_RULES } from "../data/negativeRules";
import { STYLE_PRESETS } from "../data/stylePresets";
import {
  buildShotIntervals,
  extractTimelineItems,
  splitDuration,
  type DurationSegment,
  type TimelineItem
} from "./durationSplitter";
import { guardPromptText } from "./promptQualityGuard";
import type { CreativeAnalysis } from "./questionPlanner";
import type { PromptSegment, ReferenceAsset } from "../types/chat";
import type { ProjectMemory } from "../types/memory";

interface ComposeArgs {
  analysis: CreativeAnalysis;
  references: ReferenceAsset[];
  memory: ProjectMemory;
}

export function composePromptSegments(args: ComposeArgs): PromptSegment[] {
  const timelineItems = extractTimelineItems(args.analysis.originalText);
  if (timelineItems.length >= 2 && args.analysis.shotMode === "multi") {
    return composeTimelinePromptSegments(args, timelineItems);
  }

  const segments = splitDuration(args.analysis.duration, 15);

  return segments.map((segment) => {
    const rawPrompt =
      args.analysis.shotMode === "single"
        ? composeSingleShotPrompt(args, segment)
        : composeMultiShotPrompt(args, segment);
    const report = guardPromptText(rawPrompt);

    return {
      id: `prompt-${segment.index}-${Date.now()}`,
      title: `提示词 ${segment.index}｜${segment.timeRange}`,
      timeRange: segment.timeRange,
      duration: segment.duration,
      videoType: args.analysis.videoType,
      model: args.analysis.model,
      shotMode: args.analysis.shotMode,
      prompt: report.cleanPrompt,
      qualityTags: report.tags
    };
  });
}

function composeTimelinePromptSegments(args: ComposeArgs, timelineItems: TimelineItem[]): PromptSegment[] {
  const totalDuration = Math.max(...timelineItems.map((item) => item.end));
  const durationSegments = splitDuration(totalDuration, 15);

  return durationSegments.map((segment) => {
    const items = timelineItems.filter((item) => item.start < segment.end && item.end > segment.start);
    const rawPrompt = composeTimelinePrompt(args, segment, items);
    const report = guardPromptText(rawPrompt);

    return {
      id: `prompt-${segment.index}-${Date.now()}`,
      title: `提示词 ${segment.index}｜${segment.timeRange}`,
      timeRange: segment.timeRange,
      duration: segment.duration,
      videoType: args.analysis.videoType,
      model: args.analysis.model,
      shotMode: "multi",
      prompt: report.cleanPrompt,
      qualityTags: report.tags
    };
  });
}

function composeMultiShotPrompt(
  { analysis, references, memory }: ComposeArgs,
  segment: DurationSegment
): string {
  const styleRule = buildStyleRule(analysis, memory);
  const voiceRule = buildVoiceRule(analysis, memory);
  const continuityRule = buildContinuityRule(analysis);
  const shots = buildShotIntervals(segment.duration);
  const shotDescriptions = shots
    .map((shot) => {
      const scene = pickScene(analysis.originalText, segment.index, shot.index);
      const camera = pickCamera(shot.index);
      return `镜头 ${shot.index}（${shot.timeRange}）：${camera}，${scene}`;
    })
    .join("\n");

  return [
    `9:16 竖屏，${analysis.videoType}，${segment.duration} 秒，多镜头剪辑。`,
    `整体风格：${styleRule}`,
    `一致性规则：${continuityRule}`,
    `声音规则：${voiceRule}`,
    shotDescriptions,
    `负面约束：${NEGATIVE_RULES.join("；")}。`
  ].join("\n");
}

function composeSingleShotPrompt(
  { analysis, references, memory }: ComposeArgs,
  segment: DurationSegment
): string {
  const styleRule = buildStyleRule(analysis, memory);
  const voiceRule = buildVoiceRule(analysis, memory);
  const continuityRule = buildContinuityRule(analysis);
  const continuousAction = pickContinuousAction(analysis.originalText);

  return [
    `9:16 竖屏，${segment.duration} 秒，单镜头一镜到底。`,
    `画面风格：${styleRule}`,
    `一致性规则：${continuityRule}`,
    `连续镜头描述：开场为中景，镜头以轻微手持感停在主体前方。${continuousAction} 镜头缓慢推进到手部动作和人物表情，主体在同一空间内完成动作变化，结尾停留在人物自然反应与核心道具同框画面。`,
    `声音规则：${voiceRule}`,
    `负面约束：${NEGATIVE_RULES.join("；")}。`
  ].join("\n");
}

function composeTimelinePrompt(
  { analysis, memory }: ComposeArgs,
  segment: DurationSegment,
  items: TimelineItem[]
): string {
  const opening = extractOpeningBrief(analysis.originalText) || buildOpeningSpec(analysis);
  const styleRule = buildStyleRule(analysis, memory);
  const voiceRule = buildVoiceRule(analysis, memory);
  const continuityRule = buildContinuityRule(analysis);
  const shotLines = items.map((item) => formatTimelineItem(item)).join("\n\n");
  const overall = extractOverallRequirements(analysis.originalText);

  return [
    `${opening}${opening.endsWith("。") ? "" : "。"}`,
    `本段为 ${segment.timeRange}，多镜头剪辑。`,
    `整体风格：${styleRule}`,
    `角色与画面一致性：${continuityRule}`,
    `声音：${voiceRule}`,
    shotLines,
    overall ? `整体要求：${overall}` : "",
    `负面约束：${NEGATIVE_RULES.join("；")}。`
  ]
    .filter(Boolean)
    .join("\n");
}

function extractOpeningBrief(text: string): string {
  const timelineMatch = text.match(/^\s*\d{1,3}\s*[-–—到至]\s*\d{1,3}\s*(?:秒|s)/im);
  if (!timelineMatch?.index) return "";
  return text
    .slice(0, timelineMatch.index)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function buildOpeningSpec(analysis: CreativeAnalysis): string {
  if (/阴雨|雨天|阳光|旅行|兰卡威|槟城|亚庇|分屏/.test(analysis.originalText)) {
    return "9:16 竖屏，真实感旅行方式广告风格，整体为从阴雨压抑到阳光治愈的情绪转折短视频";
  }

  if (/旅行|酒店|Trip\.com|探店|目的地|预订/i.test(analysis.originalText)) {
    return "9:16 竖屏，真实感旅行广告风格，生活化手机操作与目的地场景结合";
  }

  return `9:16 竖屏，${analysis.videoType}`;
}

function formatTimelineItem(item: TimelineItem): string {
  const heading = item.heading ? `｜${item.heading}` : "";
  const body = item.body
    .replace(/\s+/g, " ")
    .replace(/APP/g, "App")
    .trim();
  return `${item.start}-${item.end}s${heading}\n${body}`;
}

function extractOverallRequirements(text: string): string {
  const match = text.match(/(?:整体要求|总体要求|补充要求)\s*[:：]?\s*([\s\S]+)$/);
  if (!match) return "";
  return match[1]
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function buildStyleRule(analysis: CreativeAnalysis, memory: ProjectMemory): string {
  const preset =
    STYLE_PRESETS.find((item) => item.label === analysis.style) ||
    STYLE_PRESETS.find((item) => item.id === "real-vlog") ||
    STYLE_PRESETS[0];
  const memoryStyle = memory.stylePreferences.slice(0, 2).join("，");
  return `${preset.prompt} 项目偏好：${memoryStyle}。`;
}

function buildVoiceRule(analysis: CreativeAnalysis, memory: ProjectMemory): string {
  const preference = memory.voicePreferences[0] || "语速适中，语气自然";

  if (analysis.voiceMode === "none") {
    return "不需要口播，只保留环境声、动作声和低音量背景音乐，画面不生成字幕。";
  }

  if (analysis.voiceMode === "voiceover") {
    const language = analysis.voiceLanguage === "未指定" ? "中文" : analysis.voiceLanguage;
    return `${language}画外音旁白，${preference}，旁白句子短，环境声压低但保留真实空间感，画面不生成字幕。`;
  }

  if (analysis.voiceMode === "dialogue") {
    const language = analysis.voiceLanguage === "未指定" ? "中文" : analysis.voiceLanguage;
    return `${language}自然对白，人物说话与口型匹配，现场保留脚步声、道具声和环境声，画面不生成字幕。`;
  }

  const language = analysis.voiceLanguage === "未指定" ? "中文" : analysis.voiceLanguage;
  return `${language}角色面对镜头口播，${preference}，口播停顿自然，环境声轻微保留，画面不生成字幕。`;
}

function buildContinuityRule(analysis: CreativeAnalysis): string {
  if (/产品|护肤|美妆|app|应用|软件|Trip\.com|酒店|旅行/i.test(analysis.originalText)) {
    return "同一产品或手机应用贯穿本段视频，外观、材质、界面色块和摆放位置保持稳定；同一位角色贯穿本段视频，发型、服装、脸部特征和身形比例保持稳定。";
  }

  return "同一位主要角色贯穿本段视频，发型、服装、脸部特征和身形比例保持稳定；核心道具和空间结构保持稳定。";
}

function pickScene(text: string, segmentIndex: number, shotIndex: number): string {
  const scenes = getScenePack(text);
  const index = (segmentIndex - 1) * 5 + shotIndex - 1;
  return scenes[index % scenes.length];
}

function pickCamera(index: number): string {
  const cameras = [
    "半身中景，手持轻微推进",
    "俯拍特写，镜头从道具移动到人物手部",
    "肩后跟随，镜头横移展示空间",
    "低角度近景，人物动作进入画面前景",
    "中近景，镜头从人物表情推到核心道具"
  ];
  return cameras[(index - 1) % cameras.length];
}

function pickContinuousAction(text: string): string {
  if (/护肤|美妆|面霜|精华|口红/.test(text)) {
    return "角色站在浅色浴室镜前，拿起产品，按压泵头，乳液落在掌心，随后抬眼看向镜子，表情从疲惫转为放松。";
  }

  if (/旅行|酒店|Trip\.com|app|应用|预订|探店/i.test(text)) {
    return "角色坐在酒店窗边打开手机应用，手指滑动预订页面，起身拿起外套走向门口，镜头跟随身体转向窗外街景。";
  }

  if (/游戏|战斗|boss|关卡/i.test(text)) {
    return "角色握紧武器向前移动，屏幕空间内敌人压近，角色闪避后释放技能，光效从手部向前扩散，结尾停在胜利姿态。";
  }

  return "角色从桌面拿起核心道具，转身进入主要空间，手部动作带出画面变化，表情从思考转为确定。";
}

function getScenePack(text: string): string[] {
  if (/旅行|酒店|Trip\.com|探店|泰国|马来西亚|美食|预订/i.test(text)) {
    return [
      "酒店房间内，人物坐在窗边查看手机旅行预订页面，屏幕呈蓝白色块，不生成清晰文字",
      "街边小店桌前，人物接过热腾腾的本地食物，背景有人自然走动",
      "人物站在城市街口举起手机确认路线，阳光从建筑缝隙落在脸侧",
      "餐桌近景，手把食物推到镜头前，人物笑着点头回应同伴",
      "傍晚酒店门口，人物把手机收入口袋，转身走向明亮街景"
    ];
  }

  if (/护肤|美妆|面霜|精华|香水|口红/.test(text)) {
    return [
      "浅色浴室镜前，人物看着镜中脸部状态，手伸向台面产品",
      "产品瓶身放在浅色石材台面中央，手指按压泵头，乳液落在掌心",
      "人物把产品轻轻推开在脸侧，镜面反射出柔和白光",
      "近景展示人物闭眼感受质地，肩颈放松，台面保持干净",
      "人物转向镜头自然微笑，产品在前景清晰入画"
    ];
  }

  if (/app|应用|软件|工具|平台/i.test(text)) {
    return [
      "桌面手机特写，人物手指打开应用首页，屏幕呈清晰模块化布局，不生成清晰文字",
      "人物在通勤路上单手查看手机，背景人流自然经过",
      "手机屏幕与真实场景同框，手指完成一次关键操作",
      "人物把手机递给同伴，两人看屏幕后露出轻松表情",
      "手机放回桌面，人物起身离开，画面停在完成状态"
    ];
  }

  if (/游戏|战斗|boss|关卡/i.test(text)) {
    return [
      "角色站在关卡入口，前方敌人从阴影中压近，地面有细碎光效",
      "角色侧身闪避，武器划过前景，镜头贴近动作轨迹",
      "技能从角色手部爆发，光效照亮脸部和装备边缘",
      "敌人被击退，角色向前一步，场景碎片向两侧飞散",
      "角色停在胜利姿态，背景光束落下，画面清晰定格"
    ];
  }

  return [
    "人物进入真实生活空间，手中拿着核心道具，开场动作明确",
    "手部特写展示核心动作，道具与人物表情同时推进",
    "镜头跟随人物移动到主要场景，空间细节自然出现",
    "人物完成关键动作，情绪从犹豫转为轻松",
    "结尾中近景，人物与核心道具同框，画面干净稳定"
  ];
}
