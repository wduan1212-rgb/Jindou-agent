import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vite.cmd" : "vite"
);

const children = [
  spawn(process.execPath, ["server/index.mjs"], {
    cwd: root,
    stdio: "inherit",
    env: process.env
  }),
  spawn(viteBin, ["--host", "0.0.0.0", "--port", "5173"], {
    cwd: root,
    stdio: "inherit",
    env: process.env
  })
];

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
