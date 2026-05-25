import { runAgentTurn } from "../src/agent/conversationOrchestrator";
import { parseDurationSeconds } from "../src/agent/durationSplitter";
import type { ChatMessage, PromptSegment } from "../src/types/chat";
import { createDefaultMemory, type ProjectMemory } from "../src/types/memory";
import fs from "node:fs";
import path from "node:path";

interface SessionStorageShim {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  length: number;
}

installNodeApiSettingsShim();

function installNodeApiSettingsShim() {
  const env = readLocalEnv();
  const llmApiKey = env.LLM_API_KEY || process.env.LLM_API_KEY || "";
  if (!llmApiKey) return;

  const settings = JSON.stringify({
    llmBaseUrl: env.LLM_BASE_URL || process.env.LLM_BASE_URL || "https://api.deepseek.com/v1",
    llmModel: env.LLM_MODEL || process.env.LLM_MODEL || "deepseek-chat",
    llmApiKey,
    videoBaseUrl: "",
    videoModel: "",
    videoApiKey: ""
  });

  const storage: SessionStorageShim = {
    length: 1,
    getItem(key: string) {
      return key === "jindou.apiSettings.session.v1" || key === "jindou.apiSettings.v1" ? settings : null;
    },
    setItem() {},
    removeItem() {},
    clear() {},
    key(index: number) {
      return index === 0 ? "jindou.apiSettings.v1" : index === 1 ? "jindou.apiSettings.session.v1" : null;
    }
  };

  const g = globalThis as typeof globalThis & { sessionStorage?: SessionStorageShim; localStorage?: SessionStorageShim };
  g.sessionStorage = storage;
  g.localStorage = storage;
}

function readLocalEnv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return {};

  return fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .reduce<Record<string, string>>((accumulator, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return accumulator;
      const equalIndex = trimmed.indexOf("=");
      if (equalIndex === -1) return accumulator;
      const key = trimmed.slice(0, equalIndex).trim();
      const value = trimmed.slice(equalIndex + 1).trim().replace(/^['"]|['"]$/g, "");
      accumulator[key] = value;
      return accumulator;
    }, {});
}

interface ScriptCase {
  name: string;
  input: string;
  expectsSpeech?: boolean;
  expectsRole?: boolean;
}

interface ZeroCase {
  name: string;
  turns: string[];
  expectsSpeech?: boolean;
  expectsRole?: boolean;
}

const scriptCases: ScriptCase[] = [
  {
    name: "pocket travel 23s with English VO",
    expectsSpeech: true,
    expectsRole: true,
    input: `"消息弹窗式 0-2s：新加坡人刷手机，弹出马来西亚旅行邀请
0-4s: 小孩玩跳房子游戏，年轻人路过，停下脚步
4-8s: 小孩单脚跳进第1格，镜头特写格子，叠化出吉隆坡夜景
8-12s: 依次跳进第2、3格，分别叠化槟城街头、沙巴海滩
12-16s: 最后一格，叠化出马六甲古城红屋风光
16-20s: 镜头拉回现实，年轻人原路上场，镜头向天空上摇出现Trip.com图标
20-23s: 携程LOGO+下载按钮
英文口播:
0-4s: One step, one view
4-8s: One step, one view
8-12s: Every step, full of warmth
13-16s: Scenery heals the heart
16-20s: Warm companion, explore Malaysia
20-23s: Download Trip, start your Malaysia trip`
  },
  {
    name: "rainy split screen travel 15s",
    expectsRole: true,
    input: `9:16竖屏，真实感旅行方式广告风格，主角为一位新加坡年轻女性，24-30岁，东南亚面孔，深棕色中长发，居家都市穿搭，不要口播。
0-2s｜阴雨开场｜室内中景
室外下雨，主角坐在窗边，神情疲惫。
3-6s｜手机触发转场｜手部近景 + 分屏
主角滑动手机，右侧出现兰卡威天空之桥晴天风景。
7-9s｜继续滑动｜分屏切换
右侧切到槟城升旗山，阳光明亮。
10-12s｜第三次滑动
右侧切到亚庇丹绒亚路日落。
13-15s｜收束
手机上出现蓝白旅行App首页，室内放晴，主角微笑。`
  },
  {
    name: "hair straightener 15s tutorial with VO",
    expectsSpeech: true,
    expectsRole: true,
    input: `15秒直发梳广告，产品功能展示，卧室自然光。女生二十多岁，睡醒头发毛躁，穿白色家居T恤。中文自然口播。
0-3s：女生对镜子皱眉，头发乱翘。
3-7s：拿起直发梳，从发根慢慢梳到发尾。
7-11s：左右对比，一侧顺滑一侧毛躁。
11-15s：出门前回头笑，头发自然垂顺。`
  },
  {
    name: "stamp travel 18s",
    input: `"印章收集型"
0-2s：手拿盖章本，空白页
3-6s：盖章「京都」弹出伏见稻荷场景
7-9s：盖章「北海道」弹出富良野花田场景
10-12s：盖章「冲绳」弹出美丽海水族馆场景
13-15s：盖章本合上，出现旅行App录屏
16-18s：品牌结尾，后期手动加Logo`
  },
  {
    name: "game boss 20s",
    expectsRole: true,
    input: `20秒竖屏手游广告，剧情反转。主角是银发女剑士，黑色短斗篷，蓝色发光剑。不要口播，只有战斗音效。
0-4s：Boss压迫感出场，主角后退。
4-9s：主角被击飞，剑掉在地上。
9-14s：她捡起剑，蓝光从剑身亮起。
14-20s：一招反击，Boss碎裂，主角站在光里。`
  },
  {
    name: "mamak food travel 15s dialogue",
    expectsSpeech: true,
    expectsRole: true,
    input: `15秒马来西亚美食旅行广告，多镜头。Mamak店员问Where to? 顾客回答Penang, Sabah, KL，每次端出对应食物并浮现目的地风景。最后台词 Your trip is served. One app.`
  },
  {
    name: "skincare bathroom no speech 15s",
    expectsRole: true,
    input: `15秒护肤品高级短片，不要口播。年轻女性在奶白色浴室，夜晚疲惫，使用精华后情绪变轻松。产品瓶身极简白色，银色泵头。`
  },
  {
    name: "finance app 25s",
    expectsSpeech: true,
    expectsRole: true,
    input: `25秒理财App广告，都市上班族男性，30岁，深色衬衫，晚上加班焦虑。英文旁白。
0-5s：电脑屏幕一堆账单，他揉太阳穴。
5-10s：打开App，资产模块自动分类。
10-15s：手机特写，预算提醒变成绿色。
15-20s：他在地铁上轻松查看图表。
20-25s：早晨咖啡店，他微笑收起手机。`
  },
  {
    name: "camping lantern 14s",
    expectsRole: true,
    input: `14秒露营灯广告，无口播。一家三口傍晚搭帐篷，孩子害怕黑，父亲打开暖光露营灯，帐篷和草地被照亮，最后一家人围坐讲故事。`
  },
  {
    name: "coffee shop 15s warm vlog",
    expectsSpeech: true,
    expectsRole: true,
    input: `15秒咖啡店探店vlog广告，年轻女生，短发，米色针织衫，真实手持拍摄。中文口播：这家店像把周末提前端上桌。展示进门、拉花、甜点、窗边坐下。`
  }
];

const zeroCases: ZeroCase[] = [
  {
    name: "zero hair tool",
    expectsSpeech: true,
    expectsRole: true,
    turns: [
      "我想生成一个直发梳的广告",
      "做使用教程/功能展示，女生，真实生活感，15秒，中文自然口播，有产品参考图但提示词不要描述产品外观。",
      "请生成最终提示词。"
    ]
  },
  {
    name: "zero travel healing",
    expectsRole: true,
    turns: [
      "我想做一个旅行App广告但没灵感",
      "主题是雨天想逃离，目标年轻上班族，15秒，多镜头，不要口播，手机滑动切换阳光目的地。",
      "请生成最终提示词。"
    ]
  },
  {
    name: "zero pet product",
    expectsSpeech: true,
    turns: [
      "想做宠物用品广告",
      "推自动喂食器，主角是一只橘猫和上班族女生，15秒，轻松幽默，中文旁白。",
      "请生成最终提示词。"
    ]
  },
  {
    name: "zero mobile game",
    expectsRole: true,
    turns: [
      "做一个游戏广告",
      "竖屏手游，主角从弱到强，15秒，奇幻战斗，不要口播，强调技能爆发。",
      "请生成最终提示词。"
    ]
  },
  {
    name: "zero cafe local",
    expectsSpeech: true,
    expectsRole: true,
    turns: [
      "我要给咖啡店做广告",
      "真实探店vlog，女生周末下午去店里，15秒，中文口播，温暖治愈，想让人收藏。",
      "请生成最终提示词。"
    ]
  }
];

async function main() {
  const scriptResults = [];
  for (const testCase of scriptCases) {
    const result = await runScenario(testCase.name, [testCase.input], testCase);
    scriptResults.push(result);
    printResult(result);
  }

  const zeroResults = [];
  for (const testCase of zeroCases) {
    const result = await runScenario(testCase.name, testCase.turns, testCase);
    zeroResults.push(result);
    printResult(result);
  }

  const allResults = [...scriptResults, ...zeroResults];
  const failed = allResults.filter((result) => !result.ok);
  console.log(
    JSON.stringify(
      {
        summary: {
          total: allResults.length,
          passed: allResults.length - failed.length,
          failed: failed.length
        },
        failed: failed.map((result) => ({
          name: result.name,
          issues: result.issues
        }))
      },
      null,
      2
    )
  );

  if (failed.length > 0) process.exitCode = 1;
}

async function runScenario(
  name: string,
  turns: string[],
  expectations: { expectsSpeech?: boolean; expectsRole?: boolean }
) {
  let messages: ChatMessage[] = [];
  let memory: ProjectMemory = createDefaultMemory();
  let finalPrompts: PromptSegment[] = [];
  let lastAssistantText = "";

  for (const turn of turns) {
    messages.push({
      id: `user-${Math.random()}`,
      role: "user",
      kind: "text",
      content: turn,
      createdAt: new Date().toISOString()
    });
    const result = await runAgentTurn({
      input: turn,
      messages: messages.slice(0, -1),
      references: [],
      memory
    });
    memory = result.memory;
    messages = [...messages, ...result.messages];
    const assistant = result.messages[result.messages.length - 1];
    lastAssistantText = assistant.content || "";
    if (assistant.prompts?.length) finalPrompts = assistant.prompts;
  }

  const issues = validatePrompts(finalPrompts, lastAssistantText, turns.join("\n"), expectations);
  return {
    name,
    ok: issues.length === 0,
    promptCount: finalPrompts.length,
    durations: finalPrompts.map((prompt) => prompt.duration),
    promptTexts: finalPrompts.map((prompt) => prompt.prompt),
    assistantExcerpt: lastAssistantText.slice(0, 1200),
    issues
  };
}

function validatePrompts(
  prompts: PromptSegment[],
  assistantText: string,
  sourceText: string,
  expectations: { expectsSpeech?: boolean; expectsRole?: boolean }
): string[] {
  const issues: string[] = [];
  const promptText = prompts.map((prompt) => prompt.prompt).join("\n\n");
  const expectedDuration = parseDurationSeconds(sourceText, 15);
  const generatedDuration = prompts.reduce((sum, prompt) => sum + prompt.duration, 0);

  if (prompts.length === 0) issues.push("没有生成PROMPT_CARD");
  if (generatedDuration < expectedDuration) {
    issues.push(`覆盖总时长不足：期望约${expectedDuration}s，实际${generatedDuration}s`);
  }
  if (expectedDuration > 15 && generatedDuration > expectedDuration + 2) {
    issues.push(`覆盖总时长过长：期望约${expectedDuration}s，实际${generatedDuration}s`);
  }
  if (expectedDuration <= 15 && prompts.length > 1) issues.push("15秒以内不应拆成多段");
  if (prompts.some((prompt) => prompt.duration > 15)) issues.push("存在超过15秒的提示词卡片");
  if (prompts.length >= 2) {
    const last = prompts[prompts.length - 1].duration;
    const prev = prompts[prompts.length - 2].duration;
    if (last + prev <= 15) issues.push("最后两段可合并但仍被拆开");
  }
  if (!/0-\d+s|0-\d+\s*秒/.test(promptText)) issues.push("缺少明确时间段");
  if (!/(中景|近景|特写|俯拍|跟拍|推近|横移|分屏|镜头|运镜|手持|稳定)/.test(promptText)) {
    issues.push("镜头语言不够明确");
  }
  if (!/(光线|阳光|阴影|色调|环境|背景|空间|桌面|窗|街|室内|室外|画面)/.test(promptText)) {
    issues.push("画面环境描述不够具体");
  }
  if (expectations.expectsRole && !/(主角|女生|男生|女性|男性|角色|人物|店员|顾客|孩子|父亲|母亲|爸爸|妈妈|一家|发型|穿|服装|年龄|面孔|气质)/.test(promptText)) {
    issues.push("涉及角色但缺少固定角色形象锚点");
  }
  if (expectations.expectsSpeech && !/(口播|旁白|台词|对白|声线|语气|Voiceover|VO|says?:)/i.test(promptText)) {
    issues.push("涉及口播但缺少口播/声线锚点");
  }
  if (/<\/?PROMPT_CARD>|Seedance|参考图规则|根据需要|可选择|后期加入|同上|延续上一段|接上一段|iPhone|Apple|不写|不要写|预留提示|不出现的描述|不要保持画面干净|画面：无口播/.test(promptText)) {
    issues.push("出现不该进入最终提示词的机械/模型/跨段词");
  }
  if (assistantText.length > 0 && !/[。！？]/.test(assistantText)) {
    issues.push("对话回复过于机械");
  }

  return issues;
}

function printResult(result: {
  name: string;
  ok: boolean;
  promptCount: number;
  durations: number[];
  promptTexts?: string[];
  assistantExcerpt?: string;
  issues: string[];
}) {
  console.log(
    JSON.stringify(
      {
        name: result.name,
        ok: result.ok,
        promptCount: result.promptCount,
        durations: result.durations,
        issues: result.issues,
        debug: result.ok
          ? undefined
          : {
              assistantExcerpt: result.assistantExcerpt,
              promptTexts: result.promptTexts?.map((text) => text.slice(0, 1400))
            }
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
