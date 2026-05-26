import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import packageJson from "./package.json";

function loadEnvKey(): string {
  try {
    const envPath = path.resolve(__dirname, ".env.local");
    if (!fs.existsSync(envPath)) return "";
    const content = fs.readFileSync(envPath, "utf8");
    const match = content.match(/^LLM_API_KEY\s*=\s*(.+)$/m);
    return match?.[1]?.trim().replace(/^['"]|['"]$/g, "") || "";
  } catch {
    return "";
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __DEFAULT_LLM_API_KEY__: JSON.stringify(loadEnvKey())
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true
      }
    }
  }
});
