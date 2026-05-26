/**
 * 闲聊 + 引导对话专项测试
 * 验证：非视频问题不生成提示词 + 信息不足时引导追问 + 信息充足时生成
 */
import { runAgentTurn } from "../src/agent/conversationOrchestrator";
import type { ChatMessage, PromptSegment } from "../src/types/chat";
import { createDefaultMemory, type ProjectMemory } from "../src/types/memory";
import fs from "node:fs";
import path from "node:path";

installNodeApiSettingsShim();

function installNodeApiSettingsShim() {
  const env = readLocalEnv();
  const llmApiKey = env.LLM_API_KEY || process.env.LLM_API_KEY || "";
  if (!llmApiKey) { console.log("SKIP: No API key"); process.exit(0); }
  const settings = JSON.stringify({
    llmBaseUrl: env.LLM_BASE_URL || "https://api.deepseek.com/v1",
    llmModel: env.LLM_MODEL || "deepseek-chat",
    llmApiKey, videoBaseUrl: "", videoModel: "", videoApiKey: ""
  });
  const shim = {
    length: 1,
    getItem(k: string) { return k === "jindou.apiSettings.v1" || k === "jindou.apiSettings.session.v1" ? settings : null; },
    setItem() {}, removeItem() {}, clear() {}, key(i: number) { return i === 0 ? "jindou.apiSettings.v1" : null; }
  };
  (globalThis as any).sessionStorage = shim;
  (globalThis as any).localStorage = shim;
}

function readLocalEnv(): Record<string, string> {
  const p = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return {};
  return fs.readFileSync(p, "utf8").split(/\r?\n/).reduce<Record<string, string>>((a, l) => {
    const t = l.trim(); if (!t || t.startsWith("#")) return a;
    const i = t.indexOf("="); if (i === -1) return a;
    a[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    return a;
  }, {});
}

// ===== 闲聊测试 =====
const chatCases = [
  { name: "问版本号", input: "你现在是几号版本？", chat: true },
  { name: "问你是谁", input: "你是谁？", chat: true },
  { name: "问能力", input: "你能做什么？", chat: true },
  { name: "打招呼", input: "你好啊", chat: true },
  { name: "纯闲聊", input: "今天天气真好", chat: true },
  { name: "视频意图", input: "帮我做一个15秒咖啡广告，女生探店，中文口播：这家咖啡绝了", chat: false },
];

// ===== 引导对话测试（信息不完整 → 引导 → 信息充足 → 生成） =====
interface GuideCase {
  name: string;
  turns: string[];
  expectGuideInEarlyTurns: boolean;  // 早轮应该引导追问
  expectGenerateInLastTurn: boolean;  // 最后轮应该生成
}
const guideCases: GuideCase[] = [
  {
    name: "从'想做广告'开始引导",
    turns: [
      "我想做一个广告",
      "护肤品的，面霜产品，女生用，想要那种高级感",
      "浴室场景，晚上，不要口播，15秒",
    ],
    expectGuideInEarlyTurns: true,
    expectGenerateInLastTurn: true,
  },
  {
    name: "从'不知道怎么做'开始",
    turns: [
      "我想做个视频但是不知道怎么做",
      "旅行相关的，想推一个App，年轻上班族",
      "要那种雨天逃离的感觉，15秒，多镜头，不要口播",
    ],
    expectGuideInEarlyTurns: true,
    expectGenerateInLastTurn: true,
  },
  {
    name: "模糊产品→逐步明确",
    turns: [
      "帮我做一个产品的广告",
      "是一个直发梳，女生早上起床头发很乱",
      "15秒，自然光，中文口播，有前后对比",
    ],
    expectGuideInEarlyTurns: true,
    expectGenerateInLastTurn: true,
  },
  {
    name: "只给品类无细节",
    turns: [
      "做个游戏广告",
      "竖屏手游，奇幻战斗，主角是女剑士，银发",
      "20秒，不要口播，强调技能爆发和打击感",
    ],
    expectGuideInEarlyTurns: true,
    expectGenerateInLastTurn: true,
  },
  {
    name: "只给情绪无产品",
    turns: [
      "我想做那种很治愈的视频",
      "咖啡店探店vlog，女生周末下午去",
      "15秒，中文口播，温暖治愈，像让人想收藏的那种",
    ],
    expectGuideInEarlyTurns: true,
    expectGenerateInLastTurn: true,
  },
  {
    name: "完整brief直接生成",
    turns: [
      "15秒露营灯广告，一家三口傍晚搭帐篷，孩子怕黑，父亲打开暖光露营灯照亮帐篷，无口播",
    ],
    expectGuideInEarlyTurns: false,
    expectGenerateInLastTurn: true,
  },
  {
    name: "品牌名+场景完整",
    turns: [
      "帮我做一条Trip.com的15秒旅行广告，女生在海边用App预订酒店，中文口播：一次下载说走就走",
    ],
    expectGuideInEarlyTurns: false,
    expectGenerateInLastTurn: true,
  },
  {
    name: "模糊→一轮追问→完整",
    turns: [
      "想做一个广告",
      "宠物用品，自动喂食器，橘猫和上班族女生，15秒轻松幽默中文旁白",
    ],
    expectGuideInEarlyTurns: true,
    expectGenerateInLastTurn: true,
  },
  {
    name: "美食+多角色对白",
    turns: [
      "15秒马来西亚美食旅行广告，多镜头。Mamak店员问Where to? 顾客答Penang Sabah KL，每次端出对应食物浮现目的地。最后台词Your trip is served. One app.",
    ],
    expectGuideInEarlyTurns: false,
    expectGenerateInLastTurn: true,
  },
  {
    name: "14秒短时序不拆",
    turns: [
      "14秒露营灯广告，无口播，一家三口傍晚搭帐篷，孩子怕黑父亲开灯，温暖治愈",
    ],
    expectGuideInEarlyTurns: false,
    expectGenerateInLastTurn: true,
  },
];

async function runChatTurn(input: string, messages: ChatMessage[], memory: ProjectMemory) {
  const result = await runAgentTurn({ input, messages, references: [], memory });
  const assistant = result.messages[0];
  const isError = assistant.kind === "notice" && /失败|错误|检查/.test(assistant.content || "");
  const hasPrompt = (assistant.prompts?.length ?? 0) > 0;
  const content = assistant.content || "";
  return { result, isError, hasPrompt, content };
}

async function main() {
  let totalPassed = 0;
  let totalFailed = 0;

  // 闲聊测试
  console.log("=== 闲聊模式测试 ===\n");
  for (const tc of chatCases) {
    const memory = createDefaultMemory();
    const { isError, hasPrompt, content } = await runChatTurn(tc.input, [], memory);

    if (isError) { console.log(`💥 ${tc.name}: API错误 - "${content.slice(0, 60)}"`); totalFailed++; continue; }
    const ok = tc.chat ? !hasPrompt : hasPrompt;
    console.log(`${ok ? "✅" : "❌"} ${tc.name} | prompt:${hasPrompt} | "${content.slice(0, 80)}"`);
    if (ok) totalPassed++; else totalFailed++;
  }

  // 引导对话测试
  console.log("\n=== 引导对话测试 ===\n");
  for (const gc of guideCases) {
    let messages: ChatMessage[] = [];
    let memory = createDefaultMemory();
    let earlyGuided = false;
    let lastGenerated = false;
    let errors: string[] = [];

    for (let i = 0; i < gc.turns.length; i++) {
      const turn = gc.turns[i];
      messages.push({
        id: `u${i}`, role: "user" as const, kind: "text" as const,
        content: turn, createdAt: new Date().toISOString()
      });
      const { isError, hasPrompt, content } = await runChatTurn(turn, messages.slice(0, -1), memory);

      if (isError) { errors.push(`第${i+1}轮API错误`); break; }
      memory = (await runAgentTurn({
        input: turn, messages: messages.slice(0, -1), references: [], memory
      })).memory;
      messages.push({
        id: `a${i}`, role: "assistant" as const, kind: hasPrompt ? "prompts" as const : "text" as const,
        content, createdAt: new Date().toISOString()
      });
      if (i < gc.turns.length - 1 && gc.expectGuideInEarlyTurns && !hasPrompt && (content.length > 10 || /[？?]/.test(content))) {
        earlyGuided = true;
      }
      if (i === gc.turns.length - 1) {
        lastGenerated = gc.expectGenerateInLastTurn ? hasPrompt : !hasPrompt;
      }
    }

    const earlyOk = gc.expectGuideInEarlyTurns ? earlyGuided : true;
    const ok = earlyOk && lastGenerated && errors.length === 0;
    console.log(`${ok ? "✅" : "❌"} ${gc.name} | 引导:${earlyOk ? "✅" : "❌"} | 生成:${lastGenerated ? "✅" : "❌"}${errors.length ? " | " + errors[0] : ""}`);
    if (ok) totalPassed++; else totalFailed++;
  }

  console.log(`\n========================================`);
  console.log(`总计: ${totalPassed + totalFailed} | 通过: ${totalPassed} | 失败: ${totalFailed}`);
  if (totalFailed > 0) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exit(1); });
