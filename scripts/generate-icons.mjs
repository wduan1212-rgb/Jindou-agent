import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pngToIco from "png-to-ico";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public", "assets", "agent-avatar.png");
const buildDir = path.join(root, "build");
const iconsetDir = path.join(buildDir, "icon.iconset");

fs.mkdirSync(buildDir, { recursive: true });
fs.rmSync(iconsetDir, { recursive: true, force: true });

const pngPath = path.join(buildDir, "icon.png");
fs.copyFileSync(source, pngPath);

if (process.platform === "darwin") {
  fs.mkdirSync(iconsetDir, { recursive: true });
  execFileSync("sips", ["-z", "1024", "1024", source, "--out", pngPath], { stdio: "ignore" });

  const iconSizes = [16, 32, 128, 256, 512];
  for (const size of iconSizes) {
    execFileSync("sips", ["-z", String(size), String(size), source, "--out", path.join(iconsetDir, `icon_${size}x${size}.png`)], {
      stdio: "ignore"
    });
    execFileSync("sips", ["-z", String(size * 2), String(size * 2), source, "--out", path.join(iconsetDir, `icon_${size}x${size}@2x.png`)], {
      stdio: "ignore"
    });
  }

  execFileSync("iconutil", ["-c", "icns", iconsetDir, "-o", path.join(buildDir, "icon.icns")], { stdio: "ignore" });
  fs.rmSync(iconsetDir, { recursive: true, force: true });
}

const icoBuffer = await pngToIco(pngPath);
fs.writeFileSync(path.join(buildDir, "icon.ico"), icoBuffer);

console.log("Generated desktop icons in build/.");
