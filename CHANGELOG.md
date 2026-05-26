## 日期

2026-05-26

## 执行 Agent

Claude Code（执行）+ Codex（审查）

## 本轮修改目标

v0.3.0 代码质量优化 —— Claude Code + Codex 双审查对齐后的 6 项 P1 优化

## 修改内容

1. **修复 iPhone 品牌词泄漏** — `stylePresets.ts`、`memory.ts` 默认值中的 "iPhone" → "手机"；`promptQualityGuard.ts` 品牌替换扩展到 Samsung/Huawei/小米/OPPO/vivo/Pixel
2. **重做提示词清洗规则** — `negativeRules.ts` 拆为 HARD_BANS（跨段依赖/后期引用/广告腔，直接删除）和 SOFT_SUGGESTIONS（模糊措辞/常用词，仅标记警告），避免暴力删除破坏语义
3. **API 错误分类 + 重试** — `llmClient.ts` 新增 `LlmError` 类（auth/network/server/timeout），`chat()` 带 1 次重试和 45s 超时，认证错误不重试，用户看到中文错误提示
4. **LLM 上下文裁剪** — `buildLlmMessages` 限制最近 20 条历史消息，`serializeMessageForLlm` 对超长 PROMPT_CARD 截断到 400 字符
5. **localStorage 安全加固** — `storage.ts` 增加 `migrateProject` schema 兼容旧数据，8MB 阈值检查 + 逐级降级保存，QuotaExceededError 兜底
6. **Sidebar 搜索实现** — `Sidebar.tsx` 增加 searchQuery 状态 + useMemo 过滤 + 空结果提示

## 修改文件

- `src/data/negativeRules.ts`
- `src/data/stylePresets.ts`
- `src/types/memory.ts`
- `src/agent/promptQualityGuard.ts`
- `src/agent/conversationOrchestrator.ts`
- `src/services/llmClient.ts`
- `src/services/storage.ts`
- `src/components/Sidebar.tsx`

## 未完成内容

- API 设置页暴露 baseURL/model 切换
- 桌面端端口 fallback
- 参考图功能完整闭环
- 自动化测试
- 流式输出

## 风险提示

- 老用户升级后 localStorage 数据首次加载时会经过 migrateProject 兼容，结构完整但旧版默认记忆中的 "iPhone" 不会自动修正（仅影响新创建的项目）
- 桌面端 CORS 仍为 *，但只监听 127.0.0.1，本机外无法访问

## 下一步建议

- v0.4.0：流式输出（SSE）+ API 设置页 baseURL/model 切换
- v0.5.0：参考图上传/存储闭环
