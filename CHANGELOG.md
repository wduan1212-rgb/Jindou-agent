# CHANGELOG.md

## 日期

2026-05-25

## 执行 Agent

Claude Code

## 本轮修改目标

根据 Codex REVIEW.md 诊断，执行 #1~#5 修复项。

## 修改内容

1. **修复验证脚本 API Key 读取** — `installNodeApiSettingsShim()` 同时 mock localStorage，解决 Node 环境因 localStorage 不存在导致 sessionStorage 配置被跳过的 bug；`loadApiSettings()` 在非浏览器环境回退到 `process.env`
2. **标记旧链路为 legacy** — `questionPlanner.ts`、`promptComposer.ts` 添加 @legacy 注释；`referenceRules.ts` 添加未接入说明
3. **修复视频 API 路由** — `/api/video/generate` 始终返回 501 + 明确提示；前端 `handleGenerateVideo` 统一展示"即将支持"通知
4. **修复品牌提醒误触发 + handleSend 异常兜底** — 从 BRAND_KEYWORDS 移除 'logo'；`checkBrandKeywords` 跳过负面约束行；`handleSend()` 加 try/catch/finally 防止卡 thinking
5. **修复 questions 渲染断链** — `MessageBubble` 新增 `kind === "questions"` 渲染 `QuestionOptions` 组件；`ChatView` 和 `App` 透传 `onQuestionSubmit`

## 修改文件

- `scripts/agent-validation.ts` — mock localStorage + 扩展 shim
- `scripts/agent-15s-check.ts` — mock localStorage + 扩展 shim
- `src/services/storage.ts` — loadApiSettings 回退 process.env
- `src/agent/questionPlanner.ts` — @legacy 注释
- `src/agent/promptComposer.ts` — @legacy 注释
- `src/agent/referenceRules.ts` — 未接入说明注释
- `server/jindouServer.mjs` — 视频路由始终返回 501
- `src/App.tsx` — handleGenerateVideo 统一文案 + handleSend try/catch
- `src/agent/conversationOrchestrator.ts` — BRAND_KEYWORDS 移除 logo + checkBrandKeywords 跳过负面约束
- `src/components/MessageBubble.tsx` — 新增 questions 渲染
- `src/components/ChatView.tsx` — 透传 onQuestionSubmit

## 未完成内容

- 未修改 `systemPrompt.ts`（下一轮）
- 未修改核心 Agent 逻辑架构（下一轮）
- 未删除用户素材

## 风险提示

- `loadApiSettings()` 中的 `resolveEnvFallback` 使用 `typeof process !== "undefined"` 检测 Node 环境，需确保 Vite 构建时不会 tree-shake 该分支

## 下一步建议

1. 由 Codex 审查本轮 diff，输出 REVIEW.md
2. 确认后进入 Phase 1 核心架构升级

---

## 日期

2026-05-25

## 执行 Agent

Claude Code

## 本轮修改目标

第二轮：修复测试发现的 4 项问题（P0-P3）

## 修改内容

1. **P0：修复安全提醒误触发** — `checkSensitiveContent` 新增负面前缀过滤（与 `checkBrandKeywords` 同逻辑），跳过"不要出现暴力/色情"等否定句式，避免旅行/古镇等正常场景误触发敏感提醒
2. **P1：修复品牌提醒误触应用户自定义名** — `checkBrandKeywords` 新增 `userInput` 参数，用户在输入中已出现的品牌词不再触发版权提醒
3. **P2：合并多提醒段落** — 品牌提醒和安全提醒合并为一个统一的"温馨提示"段落，避免多条独立提醒堆叠造成阅读混乱
4. **P3：systemPrompt 增加"信息够就生成"指引** — 当用户已提供 >= 4 个关键信息时，优先尝试生成提示词而不是继续追问

## 修改文件

- `src/agent/conversationOrchestrator.ts` — P0/P1/P2
- `src/agent/systemPrompt.ts` — P3

## 未完成内容

- 无

## 风险提示

- `checkSensitiveContent` 和 `checkBrandKeywords` 共用同一份负面前缀正则，如果后续调整需同步修改两处

## 下一步建议

1. 由 Codex 审查本轮 diff，输出 REVIEW.md
2. 验证旅行 App 场景不再误触发安全提醒
