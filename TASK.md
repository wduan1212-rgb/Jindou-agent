# TASK.md — 收尾轮：版本发布 + 部署 + 清理

## 本轮目标

完成前面两轮所有修改的收尾工作：
1. 更新版本号 → v0.2.0
2. 打包桌面安装包（macOS + Windows）
3. 推送代码到 GitHub 并创建 Release
4. 清理旧下载包，只保留最新的
5. 清理项目根目录的临时文档文件
6. 更新 macOS 聚焦搜索索引，避免搜索出多个 Jindou Agent

## 执行分工

- **Hermes（我）**：制定计划 + 汇总
- **Claude Code**：执行版本号更新、构建、清理工作
- **Codex**：审查 + GitHub 部署 + 确保桌面版可用 + 聚焦搜索清理

## 具体任务

### 1️⃣ 版本更新
- `package.json` version: `0.1.6` → `0.2.0`
- `README.md` 如果有版本号也更新

### 2️⃣ 构建桌面版
- 运行 `npm run build` ✅（已验证通过）
- 运行 `npm run desktop:dist:mac` 打包 macOS dmg
- 运行 `npm run desktop:dist:win` 打包 Windows exe

### 3️⃣ 清理旧下载包
- 删除项目根目录的 `Jindou mac下载包.zip` 和 `Jindou win 下载包.zip`
- 新的安装包会输出到 `release/` 文件夹

### 4️⃣ 清理临时文档
- 删除 `.codex-audit.md`、`.codex-review-instruction.md`、`.fix-plan.md`（审查临时文件）
- 保留 `work.md`、`TASK.md`、`CHANGELOG.md`、`REVIEW.md`、`AGENT_LOCK.md`（项目文档）

### 5️⃣ 提交代码 + GitHub Release
- `git add` + `git commit` 所有修改
- `git tag v0.2.0`
- `git push origin main --tags`
- GitHub Actions 自动触发构建

### 6️⃣ 更新本地桌面版
- 安装新打包好的桌面版
- 确保应用能正常启动

### 7️⃣ 聚焦搜索清理
- 更新 Spotlight 索引，避免搜索"jindou"时出现多个结果
- 或者清理旧的 Jindou Agent 应用残留

## 禁止事项

- 不改任何业务代码（不做新功能）
- 不改 UI 样式
- 不删除用户项目数据
- 不修改核心 Agent 架构
