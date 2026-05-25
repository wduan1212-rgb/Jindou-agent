# REVIEW.md

## 角色和审查范围

- 我是独立审查 Agent，只审查、评估和补充，不执行代码改造。
- 本次审查以 `TASK.md`、`CHANGELOG.md`、`.codex-review-instruction.md` 和核心源码为准。
- 根目录未找到 `work.md`，因此无法按其第 10 节原始模板逐字套用；以下按审查指令要求的内容结构输出。
- 审查重点：Agent 对话编排、提示词生成/清洗/拆段、LLM 与代理调用、前端消息渲染、视频 API/参考图扩展、验证脚本。
- 本轮除新增本文件外，不应修改任何项目文件。

## 总体结论

当前仓库状态与 Hermes 在 `TASK.md` 中描述的“LLM 仅在最后一步被调用”已经不完全一致：`src/agent/conversationOrchestrator.ts` 现在每轮都会构造上下文并调用 `chat()`，不再走 `questionPlanner -> promptComposer` 的主流程。因此 Hermes 对旧架构的部分判断是准确的历史问题，但对当前源码已经过期。

更准确的当前问题是：项目处在“LLM 主导对话 + 旧规则/旧模板残留 + 多层正则兜底”的混合状态。主流程更接近 Phase 1，但旧的 `questionPlanner`、`promptComposer`、`requestPromptFromLlm` 和 smoke 测试仍保留，测试体系与实际应用路径脱节。视频 API 与参考图仍基本停留在数据结构和设置入口层面，尚未形成可用闭环。

`npm run typecheck` 已通过；未运行 `npm run build`，因为 build 会写入 `dist`，不符合“只输出 REVIEW.md，不修改其他文件”的限制。

## 关键问题清单

### P0/P1：验证脚本的 `.env.local` API Key 实际用不上

位置：
- `scripts/agent-validation.ts:17-47`
- `scripts/agent-15s-check.ts:183-210`
- `src/services/storage.ts:65-86`
- `src/services/llmClient.ts:89-136`

问题：两个验证脚本只 mock 了 `sessionStorage`，但 `loadApiSettings()` 先访问 `localStorage.getItem(...)`。Node 环境没有 `localStorage`，该访问会被 `try/catch` 捕获并直接返回 fallback，导致脚本写入的 `sessionStorage` 配置完全不会被读取。随后 `llmClient` 在 Node 环境直连 `${settings.llmBaseUrl}/chat/completions`，但 headers 中没有 Authorization。

影响：`TASK.md` 提到测试脚本“需要真实 API Key”已经不只是离线性差，而是即使 `.env.local` 有 key，当前脚本也可能仍以无 key 请求失败。验证体系不可信。

建议：给 Node 脚本补 `localStorage` shim，或让 `loadApiSettings()` 在非浏览器环境优先读 `process.env`。更好的方式是把 API 配置读取从浏览器 storage 中拆出来，测试脚本直接注入。

### P1：`/api/video/generate` 有路由壳但没有成功路径

位置：
- `server/jindouServer.mjs:58-65`
- `server/jindouServer.mjs:67-72`
- `src/App.tsx:157-172`

问题：服务端 `POST /api/video/generate` 只在没有 `VIDEO_API_KEY` 时返回 501；如果配置了 key，代码没有生成逻辑，也没有返回结果，会继续落到静态文件或 404。前端“生成视频”按钮也没有调用该 API，只根据 `settings.videoApiKey` 展示提示文案。

影响：视频 API 不只是“未接入”，而是存在一个看似可用但永远不能成功的接口入口。后续接入时容易误判为已有服务端骨架。

建议：短期删除或明确标记该路由为未实现；正式接入时新增 `videoClient`、请求状态、任务轮询/回调、结果资产入库和失败重试，不要复用当前空路由。

### P1：参考图是空数据结构，没有上传、存储、视觉输入链路

位置：
- `src/types/project.ts:11-13`
- `src/services/storage.ts:27-39`
- `src/agent/conversationOrchestrator.ts:527-539`
- `src/agent/referenceRules.ts:3-28`

问题：`Project.references` 默认是空数组，代码中没有前端上传/拖拽入口，也没有任何路径会把文件写入 `references`。即使手动有 references，传给 LLM 的也只有名称、用途和文件类型，没有图片 base64、URL 可访问性、尺寸、预览或多模态消息结构。

影响：Hermes 提到“缺少拖入图片/参考图功能”是准确的；当前 `referenceRules.ts` 更像未接入的旧工具函数。用户无法实现“参考图 + 提示词”的核心视频工作流。

建议：Phase 3 应前置成 Phase 1.5：先实现参考素材上传、缩略图、kind 标注、持久化、删除；再决定是把图片传给多模态 LLM 理解，还是只传给视频模型作为 `image_reference`。

### P1：内联时间轴解析会低估总时长

位置：
- `src/agent/durationSplitter.ts:21-28`
- `src/agent/durationSplitter.ts:46-85`
- `src/agent/durationSplitter.ts:31-43`

问题：`extractTimelineItems()` 按行解析，且 timeline 正则锚定行首。像 `0-3s 开场，3-8s 展示，8-15s 收束` 这种单行多时间段，当前只会识别第一个 `0-3s`，`parseDurationSeconds()` 会返回 3 秒，而不是 15 秒。

影响：`inferExpectedPromptDuration()`、coverage repair 和 15 秒拆段判断都会被错误总时长带偏，可能导致完整脚本被压缩成很短的提示词。

建议：增加单行多 range 解析；`parseDurationSeconds()` 至少应扫描全文所有 `start-end` range 并取最大 end，而不是只依赖 line-based timeline items。

### P1：多轮口播保真修复只看当前输入，容易漏掉前文台词

位置：
- `src/agent/conversationOrchestrator.ts:124-135`
- `src/agent/conversationOrchestrator.ts:310-323`

问题：`shouldRepairSpeechFidelity(input, promptExtraction.contents)` 只从当前 input 提取用户给过的口播/旁白/对白。多轮对话中，用户可能在上一轮给出台词，最后一轮只说“请生成最终提示词”，此时口播保真修复不会检查历史台词。

影响：LLM 如果在最终生成时改写或新增了前文台词，当前 repair 机制可能不会触发。测试脚本里的 zero-case 正好覆盖多轮生成，但验证失败后只能报错，不能驱动 repair。

建议：把 `extractProvidedSpeechSnippets` 的输入改成最近 N 轮 user messages + 当前 input，或在构建项目 brief 时沉淀结构化 speech facts。

### P2：品牌提醒会被“logo 负面约束”误触发

位置：
- `src/agent/conversationOrchestrator.ts:11-31`
- `src/agent/conversationOrchestrator.ts:148-158`
- `src/data/negativeRules.ts:1-6`

问题：`BRAND_KEYWORDS` 包含 `logo`，`checkBrandKeywords(reply)` 又检查整段 LLM 原始回复。最终提示词通常包含“负面约束：不生成字幕、文字、logo、水印”，这会触发版权提醒，即使没有真实品牌或商标使用。

影响：普通提示词也可能被追加版权提醒，降低信任感，并把真正的品牌风险提示稀释掉。

建议：品牌检测应忽略负面约束行，或把 `logo` 从品牌关键词中移出，仅检测真实品牌名、商标、品牌标识等上下文。

### P2：`questions` 消息类型和 `QuestionOptions` 组件已断链

位置：
- `src/types/chat.ts:3`
- `src/components/MessageBubble.tsx:22-37`
- `src/components/QuestionOptions.tsx:18-67`
- `src/agent/questionPlanner.ts:82-258`

问题：`MessageKind` 仍包含 `questions`，`QuestionOptions` 也存在，但 `MessageBubble` 只渲染 `prompts`，没有渲染 `questions`。主流程当前也不再调用 `buildAgentQuestions()`。旧 smoke 测试仍在验证 `questionPlanner + promptComposer`，但应用实际路径已经改成 LLM 对话。

影响：代码呈现旧架构残留，测试覆盖了不再服务真实产品的路径。如果未来某处重新返回 `kind: "questions"`，UI 会静默不展示选项。

建议：二选一：彻底移除结构化问题链路和旧 smoke；或恢复 `QuestionOptions` 渲染并让它成为 LLM 失败时的 fallback。

### P2：旧模板生成器仍保留，且 references 参数未使用

位置：
- `src/agent/promptComposer.ts:15-19`
- `src/agent/promptComposer.ts:73-120`
- `src/agent/promptComposer.ts:122-147`
- `src/agent/promptComposer.ts:279-327`

问题：`promptComposer` 仍以 scene pack、camera pack、negative rules 拼接提示词，并且 `references` 参数没有进入生成逻辑。`rg` 显示它只被 `scripts/agent-smoke.ts` 使用，不在主应用路径中。

影响：Hermes 对模板化输出质量的批评适用于这个旧模块，但它当前不是主流程。真正的问题是死代码和旧测试会误导后续维护者。

建议：如果主线确认 LLM-first，应把 `promptComposer` 标记 legacy 或删除；若作为离线 fallback，则必须明确入口、补参考素材规则，并更新测试目标。

### P2：提示词清洗规则过宽，可能破坏用户原文

位置：
- `src/agent/promptQualityGuard.ts:28-57`
- `src/data/negativeRules.ts:32-48`

问题：禁用词包含“或者”“类似”“尽量”“最好”“有冲突”等通用中文词，并通过全局 split/join 删除。后续又删除“不写”“不要写”等片段。

影响：这些规则可能删除用户给定台词、场景描述或合理的负面约束，让最终 prompt 出现语义断裂。它能让形式验证通过，但会牺牲自然表达和保真度。

建议：禁用词分级：硬禁词只处理跨段依赖和模型名；软禁词只打 warning，不直接删；用户台词区域必须跳过清洗。

### P2：后处理会机械改时长，可能让元数据与内容不一致

位置：
- `src/agent/conversationOrchestrator.ts:389-438`
- `src/agent/conversationOrchestrator.ts:440-473`
- `src/agent/promptFinalizer.ts:292-301`

问题：`fitFinalizedPromptsToExpectedDuration()` 会把最后一段增加 1-2 秒，或把超长输出裁切到 expected duration，并用 `forcePromptDuration()` 改写时间标签。这个过程不理解画面内容，只改数字。

影响：UI 显示的 `duration/timeRange` 可能满足测试，但提示词正文的动作密度、口播节奏和剧情覆盖未必真实匹配。尤其是 overrun 被裁切时，尾部内容可能仍描述被压缩或丢失的情节。

建议：超过容差时优先让 LLM 重写；本地只做硬性拦截和提示，不应静默改写复杂时间轴。

### P2：LLM 上下文无裁剪，长对话会快速膨胀

位置：
- `src/agent/conversationOrchestrator.ts:489-515`
- `src/agent/conversationOrchestrator.ts:559-584`

问题：`buildLlmMessages()` 把全部历史消息序列化进 LLM，包括之前生成过的完整 `<PROMPT_CARD>`。没有 token 预算、摘要、最近轮裁剪或 prompt card 压缩。

影响：长项目会越来越慢、越来越贵，并增加模型被旧 prompt 干扰的概率。多轮优化时尤其明显。

建议：保留最近 N 轮原文，旧 prompt cards 只保留标题、用户采纳状态和关键约束；项目记忆负责长期偏好。

### P2：前端发送缺少异常兜底，异常时会卡在 thinking

位置：
- `src/App.tsx:80-117`

问题：`handleSend()` 在 `setIsThinking(true)` 后直接 `await runAgentTurn()`，没有 `try/finally`。虽然 `chat()` 失败会被 catch 成 null，但其他同步/异步异常仍可能让 `setIsThinking(false)` 不执行。

影响：用户界面可能永久停留在 typing 状态，输入被禁用。

建议：用 `try/catch/finally` 包住 agent turn，catch 时追加 assistant notice/text，finally 恢复 thinking。

### P2：设置页没有暴露 baseURL/model，实际多模型支持不足

位置：
- `src/components/ApiSettingsModal.tsx:53-95`
- `src/services/storage.ts:65-73`
- `src/types/chat.ts:54-61`

问题：数据结构包含 `llmBaseUrl`、`llmModel`、`videoBaseUrl`、`videoModel`，但设置弹窗只允许输入 LLM Key 和视频 Key。

影响：用户无法切换 DeepSeek/OpenAI-compatible endpoint、模型名或视频模型 endpoint。`TASK.md` 里的多模型/视频 API 扩展若基于当前 UI 会不完整。

建议：设置页至少提供高级折叠区编辑 baseURL/model；视频 API 接入时必须区分不同供应商的认证和 payload schema。

### P3：静态文件路径边界检查不够严谨

位置：
- `server/jindouServer.mjs:159-166`

问题：`filePath.startsWith(staticRoot)` 不能严格防止 sibling-prefix 路径问题，例如 `dist-other` 这类路径也可能通过字符串前缀判断。

影响：当前主要是本地桌面/开发服务，风险较低；如果未来暴露到局域网或外部环境，需要修。

建议：使用 `path.relative(staticRoot, filePath)`，并拒绝以 `..` 开头或绝对路径的结果。

## Hermes 评估复核

### 准确的判断

- “缺少拖入图片/参考图功能”准确。当前只有 `references` 类型和空数组，没有上传/传图链路。
- “没有视频生成后的反馈循环”准确。当前生成视频按钮只展示 notice，不调用真实视频服务。
- “测试需要真实 API Key，验证维度偏形式化”方向准确，而且还遗漏了 Node storage shim 导致 key 可能读取失败的问题。
- “promptComposer 是模板拼接、提示词质量有限”对 `promptComposer.ts` 本身准确。
- “负面约束重复、影响可读性”仍有残留风险，虽然 `promptQualityGuard` 已尝试压缩。

### 过期或误判的判断

- `TASK.md` 称“LLM 仅在最后一步被调用”不符合当前源码。`runAgentTurn()` 在每轮都会调用 `chat(llmMessages)`。
- “对话过程由 questionPlanner 硬编码规则驱动”不符合当前主流程。`questionPlanner` 目前没有被 `conversationOrchestrator` 使用，只被旧 smoke 测试使用。
- “优化弹窗只有 3 个预设方向”不完整。当前 `OptimizePromptModal` 已有自定义优化方向输入。
- “两条生成路径并存且冲突”需要改写：主应用路径目前基本是一条 LLM-first 路径，旧模板路径更多是未清理的 legacy/test 路径，而不是运行时并行冲突。

### Hermes 遗漏的问题

- Node 验证脚本的 storage shim 与 `loadApiSettings()` 不匹配，导致 `.env.local` key 可能失效。
- `/api/video/generate` 在有 key 时落 404。
- `MessageBubble` 不渲染 `questions`，`QuestionOptions` 断链。
- 单行多时间段解析低估总时长。
- 口播保真 repair 只检查当前输入，不检查多轮历史。
- 品牌提醒会被普通 `logo` 负面约束误触发。

## Roadmap 评估

Hermes 的 Phase 方向总体合理，但需要按当前源码状态调整：

1. Phase 0 应先做“架构清账”：确认 LLM-first 为唯一主线，删除或隔离 `questionPlanner/promptComposer/requestPromptFromLlm` 旧链路，修复测试脚本，使验证能真实跑通。
2. Phase 1 不再是“让 LLM 每轮参与”，因为当前已基本做到；重点应改成“减少正则兜底的破坏性、补上下文裁剪、补多轮事实保真”。
3. Phase 2 提示词质量提升应保留本地格式校验，但避免静默重写内容；质量 guard 更适合输出 warning/repair prompt，而不是大量字符串删除。
4. Phase 3 参考图不应等太后。对 AI 视频工具来说，参考图是核心输入能力，建议提前到 Phase 1.5。
5. Phase 4 评测体系必须先解决 `.env.local` key 读取问题，再加入离线 fixtures、mock LLM responses、黄金样例和人工评分维度。

## 视频 API + 参考图方案评估

可行，但当前代码距离可用方案还有明显缺口。

建议目标架构：

- `ReferenceAsset` 扩展：`dataUrl/blobPath/width/height/size/thumbnailUrl/source`，并支持 role/product/scene/style/mixed 标注。
- 前端新增 ReferencePanel：拖拽上传、预览、改用途、删除、按 prompt 选择使用哪些参考图。
- LLM 上下文分两层：文本 LLM 只读参考图摘要；多模态 LLM 可接收图片内容生成参考描述。
- 视频生成服务新增 `videoClient`：根据供应商适配 payload，包括 prompt、duration、aspectRatio、model、referenceImages。
- 服务端 `/api/video/generate` 返回 task id 或直接 result；前端展示 queued/running/succeeded/failed 状态。
- 生成后反馈闭环：用户可对结果选择“更稳主体 / 更强运镜 / 更像参考图 / 改台词 / 缩短时长”，再带原 prompt、视频结果元数据和用户反馈进入下一轮。

风险：

- 不同视频模型对参考图字段差异很大，不能只设计一个通用 `videoBaseUrl + videoApiKey`。
- 图片本地持久化和隐私提示需要明确，尤其桌面端打包后路径、大小限制和清理策略要先定。
- 如果 LLM 不能真正看图，只把文件名传入会制造“已参考图片”的错觉。

## 建议修复优先级

1. 修复验证脚本 API key 读取，保证 `agent-validation` 和 `agent-15s-check` 可运行。
2. 清理或隔离旧链路：`questionPlanner`、`promptComposer`、`requestPromptFromLlm`、`agent-smoke`。
3. 修复时间轴解析和多轮口播保真。
4. 给 `handleSend` 加异常兜底，修复 `questions` 渲染断链或删除该类型。
5. 把视频 API 路由改成明确未实现，或实现最小 task 调用闭环。
6. 提前实现参考图上传与项目存储，再接视频模型。
7. 重构 prompt quality guard，把破坏性删除改成 warning + LLM repair。

## 验证记录

- 已执行：`npm run typecheck`
- 结果：通过。
- 未执行：`npm run build`，因为会写入构建产物，不符合本轮“只输出 REVIEW.md”的约束。
- 未执行真实 LLM 验证脚本，因为当前脚本存在 storage shim/key 读取问题，且会依赖外部 API。
