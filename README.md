# Jindou Agent

Jindou Agent 是一个对话式 AI 视频提示词创作 Agent。它会通过导演视角分析用户想法，必要时提出少量高价值反问，并生成适合视频模型使用的单镜头或多镜头提示词。

## 启动

```bash
npm install
npm run dev
```

打开终端输出中的 Vite 地址，默认是 `http://localhost:5173`。

## API 配置

本地语言模型代理读取 `.env.local`：

```env
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4.1-mini
LLM_API_KEY=
```

也可以在应用右上角的 API 设置里临时填写语言模型或视频模型 API。前端填写的 key 只保存在当前浏览器会话的 `sessionStorage`。

视频模型 API 第一版只预留设置入口；未配置时，生成视频按钮会提示用户先复制提示词或接入视频模型 API。
