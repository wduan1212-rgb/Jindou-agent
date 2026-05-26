# AGENT_LOCK.md

## 当前状态

idle ✅ v0.4.0 已交付

## 本轮完成

Codex 主理方案，Claude Code 执行：

### 4 个 Bug 修复
1. 输入框瘦身 — 删除无功能标签
2. 闲聊扩展 — "喜欢你小金豆" 不再误生成
3. "正在思考"竖排修复
4. 主题切换滑动开关 + 删除双层光效

### 项目文件夹系统
- WorkspaceData > ProjectFolder > Conversation 三层结构
- 项目独立记忆 + 提示词模板
- 全局偏好跨项目共享
- v1→v2 自动迁移

### 验证
- typecheck ✅
- build ✅
- 19/19 聊天+引导测试 ✅
- Spotlight: 1个 Jindou Agent ✅
