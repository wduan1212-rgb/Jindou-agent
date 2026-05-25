import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization"
};

const staticMimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

export function loadEnvFiles(root) {
  loadEnvFile(root, ".env.local");
  loadEnvFile(root, ".env");
}

export function createJindouServer({ root, staticDir = null } = {}) {
  return http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, jsonHeaders);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");

      if (req.method === "GET" && url.pathname === "/api/llm/config") {
        sendJson(res, 200, {
          hasKey: Boolean(process.env.LLM_API_KEY),
          baseURL: process.env.LLM_BASE_URL || "",
          model: process.env.LLM_MODEL || ""
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/llm/chat") {
        const body = await readJson(req);
        const result = await proxyLlmChat(body, req.headers.authorization || "");
        sendJson(res, result.status, result.payload);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/video/generate") {
        if (!process.env.VIDEO_API_KEY) {
          sendJson(res, 501, {
            error: "当前未配置视频模型 API。你可以先复制提示词到视频模型中使用，或在设置中接入视频模型 API。"
          });
          return;
        }
      }

      if (req.method === "GET" && staticDir) {
        const served = serveStaticFile(res, staticDir, url.pathname);
        if (served) return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "Unknown server error"
      });
    }
  });
}

function loadEnvFile(root, fileName) {
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

function getBearerToken(authorization) {
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function proxyLlmChat(body, authorization) {
  const baseURL = normalizeBaseUrl(body.baseURL || process.env.LLM_BASE_URL || "https://api.deepseek.com/v1");
  const apiKey = getBearerToken(authorization) || process.env.LLM_API_KEY || "";
  const model = body.model || process.env.LLM_MODEL || "deepseek-chat";

  if (!apiKey) {
    return {
      status: 503,
      payload: {
        error: "LLM API key is not configured. Paste a language model API key in settings, or set LLM_API_KEY locally."
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

function serveStaticFile(res, staticDir, pathname) {
  const decodedPathname = decodeURIComponent(pathname);
  const relativePath = decodedPathname === "/" ? "index.html" : decodedPathname.replace(/^\/+/, "");
  const filePath = path.resolve(staticDir, relativePath);
  const staticRoot = path.resolve(staticDir);

  if (!filePath.startsWith(staticRoot)) return false;

  const finalPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    ? filePath
    : path.join(staticRoot, "index.html");

  if (!fs.existsSync(finalPath)) return false;

  const ext = path.extname(finalPath).toLowerCase();
  const contentType = staticMimeTypes[ext] || "application/octet-stream";
  res.writeHead(200, {
    "content-type": contentType,
    "cache-control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable"
  });
  fs.createReadStream(finalPath).pipe(res);
  return true;
}
