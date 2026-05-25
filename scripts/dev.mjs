import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vite.cmd" : "vite"
);

const apiPort = Number(process.env.API_PORT || 8787);
const clientPort = 5173;
const children = [];

if (await isHttpServing(`http://127.0.0.1:${apiPort}/api/llm/config`)) {
  console.log(`Jindou Agent API proxy already running on http://127.0.0.1:${apiPort}`);
} else if (await isPortAvailable("0.0.0.0", apiPort)) {
  children.push(spawn(process.execPath, ["server/index.mjs"], {
    cwd: root,
    stdio: "inherit",
    env: process.env
  }));
} else {
  console.log(`Port ${apiPort} is busy; skipping API proxy startup.`);
}

if (await isHttpServing(`http://127.0.0.1:${clientPort}/`)) {
  console.log(`Jindou Agent web app already running on http://127.0.0.1:${clientPort}`);
} else {
  children.push(spawn(viteBin, ["--host", "0.0.0.0", "--port", String(clientPort)], {
    cwd: root,
    stdio: "inherit",
    env: process.env
  }));
}

if (children.length === 0) {
  process.exit(0);
}

function stop() {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});

for (const child of children) {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      stop();
      process.exit(code);
    }
  });
}

function isPortAvailable(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function isHttpServing(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}
