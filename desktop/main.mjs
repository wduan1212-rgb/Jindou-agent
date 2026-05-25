import { app, BrowserWindow, Menu, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJindouServer, loadEnvFiles } from "../server/jindouServer.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");
const iconPath = process.platform === "win32"
  ? path.join(root, "build", "icon.ico")
  : path.join(root, "build", "icon.png");
const stableUserDataDir = path.join(app.getPath("appData"), "Jindou Agent");
const desktopServerPort = 47837;

app.setPath("userData", stableUserDataDir);

let server = null;
let serverUrl = "";
let mainWindow = null;

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
}

async function startLocalServer() {
  loadEnvFiles(root);
  server = createJindouServer({ root, staticDir: distDir });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(desktopServerPort, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to resolve local server port."));
        return;
      }
      serverUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1060,
    minHeight: 720,
    title: "Jindou Agent",
    backgroundColor: "#fbfaf7",
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadURL(serverUrl);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

if (singleInstanceLock) {
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    await startLocalServer();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (server) server.close();
});
