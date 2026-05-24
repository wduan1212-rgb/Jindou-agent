import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(fileName) {
  const filePath = path.join(root, fileName);
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex === -1) continue;
    const key = trimmed.slice(0, equalIndex).trim();
    const rawValue = trimmed.slice(equalIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization"
};

function sendJson(res, status, payload) {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  if (!body) return {};
  return JSON.parse(body);
}

function normalizeBaseUrl(baseUrl) {
  return (baseUrl || "").replace(/\/+$/, "");
}

async function proxyLlmChat(body) {
  const baseURL = normalizeBaseUrl(process.env.LLM_BASE_URL || "https://api.openai.com/v1");
  const apiKey = process.env.LLM_API_KEY || "";
  const model = body.model || process.env.LLM_MODEL || "gpt-4.1-mini";

  if (!apiKey) {
    return {
      status: 503,
      payload: {
        error: "LLM API key is not configured on the local server."
      }
    };
  }

  const upstream = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: body.messages,
      temperature: body.temperature ?? 0.7,
      response_format: body.response_format,
      stream: false
    })
  });

  const text = await upstream.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { error: text || upstream.statusText };
  }

  return { status: upstream.status, payload };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, jsonHeaders);
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && req.url === "/api/llm/config") {
      sendJson(res, 200, {
        hasKey: Boolean(process.env.LLM_API_KEY),
        baseURL: process.env.LLM_BASE_URL || "",
        model: process.env.LLM_MODEL || ""
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/llm/chat") {
      const body = await readJson(req);
      const result = await proxyLlmChat(body);
      sendJson(res, result.status, result.payload);
      return;
    }

    if (req.method === "POST" && req.url === "/api/video/generate") {
      if (!process.env.VIDEO_API_KEY) {
        sendJson(res, 501, {
          error: "当前未配置视频模型 API。你可以先复制提示词到视频模型中使用，或在设置中接入视频模型 API。"
        });
        return;
      }
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Unknown server error"
    });
  }
});

const port = Number(process.env.API_PORT || 8787);
server.listen(port, "127.0.0.1", () => {
  console.log(`Jindou Agent API proxy running on http://127.0.0.1:${port}`);
});
