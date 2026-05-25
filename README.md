# Jindou Agent

Jindou Agent 是一个桌面版 AI 视频提示词创作搭档。它会像导演和创意策划一样，通过轻松的多轮对话理解用户想做的视频，最后生成适合视频模型使用的 15 秒以内分段提示词。

默认角色名是「金豆小子」。桌面应用图标使用 Jindou Agent 头像。

## 能做什么

- 从一句很模糊的想法开始，引导用户补齐广告主题、受众、情绪、镜头、声音和口播。
- 把完整脚本整理成导演级视频提示词。
- 自动判断是否需要拆成多段，每条提示词不超过 15 秒。
- 15 秒以内默认只生成 1 条提示词，不乱拆。
- 有口播、旁白或对白时，会放进对应时间段。
- 多段里有同一角色、产品或 App 时，会保持描述一致，并建议用户准备参考图。
- 预留视频模型 API 设置入口；当前第一版主要生成可复制的视频提示词。

## 下载桌面版

推荐从 GitHub Releases 下载：

1. 打开仓库的 Releases 页面。
2. 选择最新版本。
3. 根据系统下载对应安装包：
   - macOS Apple Silicon：`Jindou Agent-*-arm64.dmg`
   - macOS Intel：`Jindou Agent-*-x64.dmg`
   - macOS ZIP 备用包：`Jindou Agent-*-arm64-mac.zip`
   - Windows：`Jindou Agent Setup *.exe`

说明：当前 macOS 安装包是未公证构建。如果系统提示无法打开，可以在 Finder 中右键应用，选择「打开」，再确认一次。

安装后的位置：

- macOS：打开 `.dmg` 后，把 `Jindou Agent` 拖进 `Applications/应用程序`。应用程序列表里会显示金豆头像图标。
- Windows：运行 `.exe` 安装器。安装完成后会创建开始菜单入口和桌面快捷方式，图标同样是金豆头像。

## 使用方式

1. 打开 Jindou Agent。
2. 点击左侧顶部的「API 设置」。
3. 在「语言模型 Key」里粘贴你的模型 API Key。
4. 视频模型 Key 可以先留空。
5. 回到对话框，输入脚本或想法，例如：

```text
15秒咖啡店探店vlog广告，年轻女生，短发，米色针织衫，真实手持拍摄。
中文口播：这家店像把周末提前端上桌。
展示进门、拉花、甜点、窗边坐下。
```

## API 配置

桌面版支持两种语言模型 Key 配置方式：

- 在应用内 API 设置里粘贴 Key：只保存在当前应用会话里，不会显示明文。
- 开发模式下创建 `.env.local`：适合开发者本地调试。

`.env.local` 示例：

```env
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
LLM_API_KEY=

VIDEO_BASE_URL=
VIDEO_MODEL=
VIDEO_API_KEY=
```

不要把真实 API Key 提交到 GitHub。

## 本地开发

```bash
npm install
npm run dev
```

默认访问：

- Web 前端：`http://127.0.0.1:5173/`
- 本地 API 代理：`http://127.0.0.1:8787/`

## 构建桌面应用

生成图标：

```bash
npm run icons
```

启动桌面开发版：

```bash
npm run desktop:dev
```

只打包本机可运行应用：

```bash
npm run desktop:pack
```

生成安装包：

```bash
npm run desktop:dist
```

本机生成的安装包会出现在 `release/` 文件夹。`release/` 默认不提交到 GitHub，因为安装包通常超过 GitHub 普通文件大小限制。

## 自动构建安装包

仓库内置 GitHub Actions 工作流：`.github/workflows/release.yml`。

触发方式：

- 在 GitHub Actions 页面手动运行 `Build Desktop Installers`。
- 推送版本标签，例如：

```bash
git tag v0.1.0
git push origin v0.1.0
```

工作流会在 macOS 和 Windows 上分别构建安装包，并上传到 Actions Artifacts。如果是 tag 触发，还会自动附加到对应 GitHub Release。

## 后续更新

应用内左侧有「检查更新」按钮，会读取 GitHub Releases 的最新版本。以后发布新版本时：

1. 更新 `package.json` 里的 `version`。
2. 提交并推送代码。
3. 创建版本标签，例如 `v0.2.0`。
4. GitHub Actions 会自动生成 macOS 和 Windows 安装包，并挂到对应 Release。

用户安装当前版本后，不需要重新找仓库地址，直接在应用里点「检查更新」即可打开最新版下载页面。

## 测试

常用测试命令：

```bash
npm run typecheck
npx tsx scripts/agent-15s-check.ts
npx tsx scripts/agent-validation.ts
npm run build
npm run desktop:pack
```

`scripts/agent-15s-check.ts` 专门验证 15 秒脚本不会被乱拆或缩短；`scripts/agent-validation.ts` 覆盖复杂脚本和从零引导流程。
