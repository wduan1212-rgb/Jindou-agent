import fs from "node:fs";
import path from "node:path";
import { runAgentTurn } from "../src/agent/conversationOrchestrator";
import { createDefaultMemory, type ProjectMemory } from "../src/types/memory";
import type { ChatMessage, PromptSegment } from "../src/types/chat";

interface SessionStorageShim {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  length: number;
}

interface FifteenSecondCase {
  name: string;
  input: string;
  expectsSpeech?: boolean;
  expectsRole?: boolean;
}

const cases: FifteenSecondCase[] = [
  {
    name: "rainy travel split screen no VO",
    expectsRole: true,
    input: `15秒旅行App广告，9:16竖屏，真实感旅行方式广告风格，不要口播。主角是一位新加坡年轻女性，24-30岁，东南亚面孔，深棕色中长发，简洁居家都市穿搭。0-2s 阴雨室内坐在窗边；3-6s 手机滑动，分屏出现兰卡威天空之桥晴天；7-9s 继续滑动切到槟城升旗山；10-12s 切到亚庇丹绒亚路日落；13-15s 回到旅行App首页，窗外放晴，主角微笑。`
  },
  {
    name: "coffee vlog with Chinese VO",
    expectsRole: true,
    expectsSpeech: true,
    input: `15秒咖啡店探店vlog广告，年轻女生，短发，米色针织衫，真实手持拍摄。中文口播：这家店像把周末提前端上桌。展示进门、拉花、甜点、窗边坐下。`
  },
  {
    name: "mamak travel dialogue",
    expectsRole: true,
    expectsSpeech: true,
    input: `15秒马来西亚美食旅行广告，多镜头。Mamak店员问Where to? 顾客回答Penang, Sabah, KL，每次端出对应食物并浮现目的地风景。最后台词 Your trip is served. One app.`
  },
  {
    name: "skincare no speech",
    expectsRole: true,
    input: `15秒护肤品高级短片，不要口播。年轻女性在奶白色浴室，夜晚疲惫，使用极简白色银色泵头精华后情绪变轻松。展示镜前疲惫、按压精华、涂抹吸收、皮肤光泽和放松微笑。`
  },
  {
    name: "hair straightener tutorial with VO",
    expectsRole: true,
    expectsSpeech: true,
    input: `15秒直发梳广告，产品功能展示，卧室自然光。女生二十多岁，睡醒头发毛躁，穿白色家居T恤。中文自然口播。0-3s：女生对镜子皱眉，头发乱翘。3-7s：拿起直发梳，从发根慢慢梳到发尾。7-11s：左右对比，一侧顺滑一侧毛躁。11-15s：出门前回头笑，头发自然垂顺。`
  },
  {
    name: "mobile game no VO",
    expectsRole: true,
    input: `15秒竖屏手游广告，奇幻战斗，不要口播，只有战斗音效。主角是银发女剑士，黑色短斗篷，蓝色发光剑。0-4s Boss压迫感出场，主角后退。4-8s 主角被击飞，剑掉在地上。8-12s 她捡起剑，蓝光亮起。12-15s 一招反击，Boss碎裂，主角站在光里。`
  }
];

installNodeApiSettingsShim();

async function main() {
  const results = [];

  for (const testCase of cases) {
    const result = await runCase(testCase);
    results.push(result);
    printResult(result);
  }

  const failed = results.filter((result) => result.issues.length > 0);
  console.log(
    JSON.stringify(
      {
        summary: {
          total: results.length,
          passed: results.length - failed.length,
          failed: failed.length
        },
        failed: failed.map((result) => ({ name: result.name, issues: result.issues }))
      },
      null,
      2
    )
  );

  if (failed.length > 0) process.exitCode = 1;
}

async function runCase(testCase: FifteenSecondCase) {
  let messages: ChatMessage[] = [];
  let memory: ProjectMemory = createDefaultMemory();
  let prompts: PromptSegment[] = [];

  messages.push({
    id: `user-${Math.random()}`,
    role: "user",
    kind: "text",
    content: testCase.input,
    createdAt: new Date().toISOString()
  });

  const result = await runAgentTurn({
    input: testCase.input,
    messages: [],
    references: [],
    memory
  });

  memory = result.memory;
  messages = [...messages, ...result.messages];
  const assistant = result.messages[result.messages.length - 1];
  prompts = assistant.prompts || [];

  return {
    name: testCase.name,
    promptCount: prompts.length,
    durations: prompts.map((prompt) => prompt.duration),
    issues: validatePrompts(prompts, testCase),
    promptPreview: prompts.map((prompt) => prompt.prompt.slice(0, 1800))
  };
}

function validatePrompts(prompts: PromptSegment[], testCase: FifteenSecondCase): string[] {
  const issues: string[] = [];
  const text = prompts.map((prompt) => prompt.prompt).join("\n\n");

  if (prompts.length !== 1) issues.push(`15秒脚本应生成1条提示词，实际${prompts.length}条`);
  if (prompts.some((prompt) => prompt.duration > 15)) issues.push("存在超过15秒的提示词卡片");
  if (prompts.some((prompt) => prompt.duration < 14 || prompt.duration > 15)) {
    issues.push(`15秒脚本时长不稳定：${prompts.map((prompt) => prompt.duration).join(",")}s`);
  }
  if (!/0-\d+s|0-\d+\s*秒/.test(text)) issues.push("缺少从0秒开始的时间段");
  if (!/(中景|近景|特写|俯拍|跟拍|推近|横移|分屏|镜头|运镜|手持|慢动作|低角度)/.test(text)) {
    issues.push("镜头语言不足");
  }
  if (!/(光线|阳光|阴影|色调|环境|背景|空间|桌面|窗|街|室内|室外|画面|夜空|浴室|卧室|店|草地)/.test(text)) {
    issues.push("画面环境描述不足");
  }
  if (testCase.expectsRole && !/(主角|女生|女性|男生|男性|角色|人物|店员|顾客|孩子|父亲|母亲|发型|穿|服装|年龄|面孔|气质|女剑士)/.test(text)) {
    issues.push("缺少稳定角色形象锚点");
  }
  if (testCase.expectsSpeech && !/(口播|旁白|台词|对白|声线|语气|Voiceover|VO|says?:)/i.test(text)) {
    issues.push("缺少口播/声线锚点");
  }
  if (testCase.expectsSpeech && !hasSpeechInTimedBlock(text)) {
    issues.push("口播/台词没有放进对应时间段");
  }
  if (/<\/?PROMPT_CARD>|Seedance|参考图规则|根据需要|可选择|后期加入|同上|延续上一段|接上一段|iPhone|Apple|不写|不要写|预留提示|不出现的描述|不要保持画面干净|画面：无口播/.test(text)) {
    issues.push("出现不该进入最终提示词的机械/模型/跨段词");
  }

  return issues;
}

function hasSpeechInTimedBlock(text: string): boolean {
  const blocks = text.split(/\n(?=\s*\d{1,2}\s*[-–—~至到]\s*\d{1,2}\s*(?:s|秒))/);
  return blocks.some((block) => /^\s*\d{1,2}\s*[-–—~至到]\s*\d{1,2}\s*(?:s|秒)/.test(block) && /口播|旁白|台词|对白|声线|语气|Voiceover|VO|says?:/i.test(block));
}

function printResult(result: {
  name: string;
  promptCount: number;
  durations: number[];
  issues: string[];
  promptPreview: string[];
}) {
  console.log(
    JSON.stringify(
      {
        name: result.name,
        ok: result.issues.length === 0,
        promptCount: result.promptCount,
        durations: result.durations,
        issues: result.issues,
        promptPreview: result.promptPreview
      },
      null,
      2
    )
  );
}

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
      return key === "jindou.apiSettings.session.v1" ? settings : null;
    },
    setItem() {},
    removeItem() {},
    clear() {},
    key(index: number) {
      return index === 0 ? "jindou.apiSettings.session.v1" : null;
    }
  };

  (globalThis as typeof globalThis & { sessionStorage?: SessionStorageShim }).sessionStorage = storage;
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
