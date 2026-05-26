/**
 * v0.3.0 专项验证脚本 — 覆盖本次改动的关键路径
 * 测试 10 个复杂场景：多轮对话、品牌边界、长时序、多语言口播、拆段策略
 */
import { runAgentTurn } from "../src/agent/conversationOrchestrator";
import { parseDurationSeconds } from "../src/agent/durationSplitter";
import { guardPromptText } from "../src/agent/promptQualityGuard";
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
  if (!llmApiKey) {
    console.log("SKIP: No API key configured");
    process.exit(0);
  }

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

interface TestCase {
  name: string;
  turns: string[];
  validations: ValidationRule[];
}

interface ValidationRule {
  description: string;
  check: (prompts: PromptSegment[], assistantText: string) => boolean;
}

const cases: TestCase[] = [
  // ====== 场景 1: 完整脚本一键生成（15s内不拆） ======
  {
    name: "1. 咖啡vlog — 完整信息直接生成，不追问",
    turns: [
      "15秒咖啡店探店vlog广告，年轻女生，短发，米色针织衫，真实手持拍摄。中文口播：这家店像把周末提前端上桌。展示进门、拉花、甜点、窗边坐下。"
    ],
    validations: [
      {
        description: "15秒内只生成1条",
        check: (prompts) => prompts.length === 1
      },
      {
        description: "时长≤15s",
        check: (prompts) => prompts.every((p) => p.duration <= 15)
      },
      {
        description: "含口播内容",
        check: (prompts) => prompts.some((p) => /口播|旁白/.test(p.prompt))
      },
      {
        description: "不追问用户",
        check: (_, text) => !/[？?]/.test(text)
      },
      {
        description: "无禁用词泄漏",
        check: (prompts) => !prompts.some((p) => /iPhone|Apple|Seedance|参考图规则|同上|延续上一段|接上一段/.test(p.prompt))
      }
    ]
  },

  // ====== 场景 2: 23s复杂时序 — 需拆段 =====
  {
    name: "2. 旅行印章23s — 正确拆段，覆盖完整时长",
    turns: [
      `"印章收集型"旅行广告，23秒，9:16竖屏。
0-2s：手拿盖章本，空白页
3-6s：盖章「京都」弹出伏见稻荷场景
7-9s：盖章「北海道」弹出富良野花田场景
10-12s：盖章「冲绳」弹出美丽海水族馆场景
13-15s：盖章本合上，出现旅行App录屏
16-18s：品牌结尾，后期手动加Logo
19-23s：标语 + 下载引导`
    ],
    validations: [
      {
        description: "23s脚本应拆成多段",
        check: (prompts) => prompts.length >= 2
      },
      {
        description: "每条≤15s",
        check: (prompts) => prompts.every((p) => p.duration <= 15)
      },
      {
        description: "总覆盖时长≥20s",
        check: (prompts) => prompts.reduce((s, p) => s + p.duration, 0) >= 20
      },
      {
        description: "无禁用词泄漏",
        check: (prompts) => !prompts.some((p) => /同上|延续上一段|接上一段|后期手动加(?:品牌)?Logo/.test(p.prompt))
      }
    ]
  },

  // ====== 场景 3: 从零引导 — 模糊需求 → 生成 =====
  {
    name: "3. 护肤品从零 — 模糊需求多轮引导",
    turns: [
      "我想做一个护肤品广告",
      "推面霜，女生夜间护肤场景，15秒，高级短片质感，不要口播，自然光"
    ],
    validations: [
      {
        description: "第二轮生成提示词",
        check: (prompts) => prompts.length >= 1
      },
      {
        description: "15s内不拆段",
        check: (prompts) => prompts.length === 1
      },
      {
        description: "无禁用词泄漏",
        check: (prompts) => !prompts.some((p) => /iPhone|Apple|Seedance|参考图规则|同上|延续上一段/.test(p.prompt))
      }
    ]
  },

  // ====== 场景 4: 长时序 + 英文口播 =====
  {
    name: "4. 理财App 25s — 英文旁白 + 多段拆解",
    turns: [
      `25秒理财App广告，都市上班族男性，30岁，深色衬衫，晚上加班焦虑。英文旁白。
0-5s：电脑屏幕一堆账单，他揉太阳穴。
5-10s：打开App，资产模块自动分类。
10-15s：手机特写，预算提醒变成绿色。
15-20s：他在地铁上轻松查看图表。
20-25s：早晨咖啡店，他微笑收起手机。`
    ],
    validations: [
      {
        description: "25s应拆成多段",
        check: (prompts) => prompts.length >= 2
      },
      {
        description: "每条≤15s",
        check: (prompts) => prompts.every((p) => p.duration <= 15)
      },
      {
        description: "含英文旁白",
        check: (prompts) => prompts.some((p) => /旁白|Voiceover|VO|English|英文/i.test(p.prompt))
      },
      {
        description: "角色形象锚点存在",
        check: (prompts) => prompts.some((p) => /男性|衬衫|30岁|上班族/.test(p.prompt))
      }
    ]
  },

  // ====== 场景 5: 多角色对白 =====
  {
    name: "5. Mamak美食 — 多角色英文对白",
    turns: [
      `15秒马来西亚美食旅行广告，多镜头。Mamak店员问Where to? 顾客回答Penang, Sabah, KL，每次端出对应食物并浮现目的地风景。最后台词 Your trip is served. One app.`
    ],
    validations: [
      {
        description: "15s只生成1条",
        check: (prompts) => prompts.length === 1
      },
      {
        description: "含对白",
        check: (prompts) => prompts.some((p) => /Where to|Penang|Sabah|Your trip is served|对白|台词/i.test(p.prompt))
      },
      {
        description: "无禁用词",
        check: (prompts) => !prompts.some((p) => /iPhone|Apple|同上|延续/.test(p.prompt))
      }
    ]
  },

  // ====== 场景 6: 品牌名边界 — 用户自己提的品牌不触发警告 =====
  {
    name: "6. 品牌边界 — 用户提Trip.com不误触发",
    turns: [
      "帮我做一条Trip.com的15秒旅行广告，女生在海边用App预订酒店，中文字幕口播：一次下载，说走就走"
    ],
    validations: [
      {
        description: "生成提示词",
        check: (prompts) => prompts.length >= 1
      },
      {
        description: "不追问",
        check: (_, text) => !/[？?]/.test(text)
      },
      {
        description: "品牌提醒不阻断生成",
        check: (prompts) => prompts.length >= 1
      }
    ]
  },

  // ====== 场景 7: 游戏广告 无口播 =====
  {
    name: "7. 手游20s — 无口播纯战斗",
    turns: [
      `20秒竖屏手游广告，剧情反转。主角是银发女剑士，黑色短斗篷，蓝色发光剑。不要口播，只有战斗音效。
0-4s：Boss压迫感出场，主角后退。
4-9s：主角被击飞，剑掉在地上。
9-14s：她捡起剑，蓝光从剑身亮起。
14-20s：一招反击，Boss碎裂，主角站在光里。`
    ],
    validations: [
      {
        description: "20s拆成多段",
        check: (prompts) => prompts.length >= 2
      },
      {
        description: "每条≤15s",
        check: (prompts) => prompts.every((p) => p.duration <= 15)
      },
      {
        description: "无口播标记",
        check: (prompts) => prompts.every((p) => !/口播：/.test(p.prompt) || /无口播/.test(p.prompt))
      }
    ]
  },

  // ====== 场景 8: 14s边界 — 不拆段 =====
  {
    name: "8. 露营灯14s — 短时序不拆段",
    turns: [
      `14秒露营灯广告，无口播。一家三口傍晚搭帐篷，孩子害怕黑，父亲打开暖光露营灯，帐篷和草地被照亮，最后一家人围坐讲故事。`
    ],
    validations: [
      {
        description: "14s只生成1条",
        check: (prompts) => prompts.length === 1
      },
      {
        description: "时长14-15s",
        check: (prompts) => prompts[0]?.duration === 14 || prompts[0]?.duration === 15
      },
      {
        description: "无禁用词",
        check: (prompts) => !prompts.some((p) => /iPhone|Apple|Seedance|同上|延续/.test(p.prompt))
      }
    ]
  },

  // ====== 场景 9: 模糊需求 — 先引导再生成 =====
  {
    name: "9. 宠物用品从零 — 模糊→补充→生成",
    turns: [
      "想做宠物用品广告",
      "推自动喂食器，主角是一只橘猫和上班族女生，15秒，轻松幽默，中文旁白"
    ],
    validations: [
      {
        description: "第二轮生成提示词",
        check: (prompts) => prompts.length >= 1
      },
      {
        description: "15s不拆段",
        check: (prompts) => prompts.length === 1
      },
      {
        description: "含旁白",
        check: (prompts) => prompts.some((p) => /旁白|口播|台词/.test(p.prompt))
      }
    ]
  },

  // ====== 场景 10: 极端复杂 — 多目的地 + 分屏 + 情绪转折 =====
  {
    name: "10. 分屏旅行 — 三目的地情绪转折",
    turns: [
      `9:16竖屏，真实感旅行方式广告风格，整体为"从阴雨压抑到阳光治愈"的情绪转折短视频。主角为一位新加坡年轻女性，24-30岁，东南亚面孔，深棕色中长发，简洁居家穿搭。不要口播。
0-2s｜阴雨开场｜室内，窗外下雨，主角坐在窗边神情疲惫。
3-6s｜手机触发转场｜手部近景+分屏，主角滑动手机，右侧出现兰卡威天空之桥晴天风景。
7-9s｜继续滑动｜右侧切到槟城升旗山，阳光明亮。
10-12s｜第三次滑动｜右侧切到亚庇丹绒亚路日落。
13-15s｜收束｜手机上出现蓝白旅行App首页，室内放晴，主角微笑。`
    ],
    validations: [
      {
        description: "15s只生成1条",
        check: (prompts) => prompts.length === 1
      },
      {
        description: "三个目的地都出现",
        check: (prompts) => prompts.some((p) =>
          /兰卡威/.test(p.prompt) && /槟城/.test(p.prompt) && /亚庇/.test(p.prompt)
        )
      },
      {
        description: "有分屏描述",
        check: (prompts) => prompts.some((p) => /分屏/.test(p.prompt))
      },
      {
        description: "有角色形象锚点",
        check: (prompts) => prompts.some((p) => /女性|女生|主角|东南亚|中长发|穿搭/.test(p.prompt))
      },
      {
        description: "无禁用词",
        check: (prompts) => !prompts.some((p) => /iPhone|Apple|Seedance|参考图规则|同上|延续上一段|接上一段|后期加入/.test(p.prompt))
      }
    ]
  }
];

async function main() {
  const results = [];

  for (const testCase of cases) {
    const result = await runCase(testCase);
    results.push(result);
    printResult(result);
  }

  const allChecks = results.flatMap((r) => r.checkResults.map((c) => ({ name: r.name, ...c })));
  const failed = results.filter((r) => !r.allPassed);

  console.log("\n" + "=".repeat(60));
  console.log(`总场景: ${results.length} | 总检查项: ${allChecks.length}`);
  console.log(`通过场景: ${results.filter((r) => r.allPassed).length} | 未通过: ${failed.length}`);
  console.log(`通过检查: ${allChecks.filter((c) => c.passed).length} | 未通过: ${allChecks.filter((c) => !c.passed).length}`);

  if (failed.length > 0) {
    console.log("\n❌ 未通过场景详情:");
    for (const f of failed) {
      console.log(`  [${f.name}]`);
      for (const c of f.checkResults.filter((c) => !c.passed)) {
        console.log(`    - ${c.description}`);
      }
    }
  } else {
    console.log("\n✅ 全部10个复杂场景通过！");
  }

  console.log("\n--- 单元测试：清洗规则 ---");
  testCleaningRules();

  if (failed.length > 0) process.exitCode = 1;
}

async function runCase(testCase: TestCase) {
  let messages: ChatMessage[] = [];
  let memory: ProjectMemory = createDefaultMemory();
  let assistantText = "";
  let prompts: PromptSegment[] = [];

  for (const turn of testCase.turns) {
    messages.push({
      id: `user-${Math.random()}`,
      role: "user",
      kind: "text",
      content: turn,
      createdAt: new Date().toISOString()
    });
    try {
      const result = await runAgentTurn({
        input: turn,
        messages: messages.slice(0, -1),
        references: [],
        memory
      });
      memory = result.memory;
      messages = [...messages, ...result.messages];
      const assistant = result.messages[result.messages.length - 1];
      assistantText = assistant.content || "";
      if (assistant.prompts?.length) prompts = assistant.prompts;
    } catch (error) {
      console.error(`[${testCase.name}] API调用失败:`, error);
      return {
        name: testCase.name,
        allPassed: false,
        error: String(error),
        prompts: [] as PromptSegment[],
        checkResults: [] as { description: string; passed: boolean }[]
      };
    }
  }

  const checkResults = testCase.validations.map((v) => ({
    description: v.description,
    passed: v.check(prompts, assistantText)
  }));

  return {
    name: testCase.name,
    allPassed: checkResults.every((c) => c.passed),
    promptCount: prompts.length,
    durations: prompts.map((p) => p.duration),
    checkResults,
    error: null as string | null
  };
}

function testCleaningRules() {
  const tests = [
    {
      input: "与上一段保持一致，画面温暖。可以选择暖色调或者冷色调。",
      expect: { removed: true, softFlag: true }
    },
    {
      input: "9:16竖屏，真实手机手持拍摄，15秒。角色站在窗边，阳光温暖。负面约束：不生成字幕。",
      expect: { removed: false, clean: true }
    },
    {
      input: "延续上一段的内容，大概在3秒后切换镜头。",
      expect: { removed: true, softFlag: true }
    },
    {
      input: "后期的特效根据需要调整，突出卖点强化氛围。",
      expect: { removed: true, softFlag: true }
    },
  ];

  let passed = 0;
  for (const test of tests) {
    const report = guardPromptText(test.input);
    const hasRemoved = report.removedPhrases.length > 0;
    const hasSoftFlag = report.tags.some((t) => t.startsWith("建议："));
    const ok =
      (test.expect.removed === undefined || hasRemoved === test.expect.removed) &&
      (test.expect.softFlag === undefined || hasSoftFlag === test.expect.softFlag);
    console.log(`  ${ok ? "✅" : "❌"} "${test.input.slice(0, 50)}..." → removed:${hasRemoved} soft:${hasSoftFlag}`);
    if (ok) passed++;
  }
  console.log(`  清洗规则测试: ${passed}/${tests.length} 通过`);
}

function printResult(result: {
  name: string;
  allPassed: boolean;
  promptCount: number;
  durations: number[];
  checkResults: { description: string; passed: boolean }[];
  error: string | null;
}) {
  const status = result.error ? "💥 ERROR" : result.allPassed ? "✅" : "❌";
  console.log(`\n${status} ${result.name} | 卡片:${result.promptCount} | 时长:${result.durations.join(",")}`);
  if (result.error) {
    console.log(`  错误: ${result.error}`);
  }
  for (const c of result.checkResults) {
    console.log(`  ${c.passed ? "✓" : "✗"} ${c.description}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
