import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { BrowserWindow, app, powerMonitor, shell } from "electron";
import { IPC } from "@shared/api";
import type { GlassEvent } from "@shared/types";
import { AgentManager } from "./agent-manager";
import { AutomationScheduler } from "./automations";
import { registerIpc } from "./ipc";
import { GlassStore } from "./store";

const isSmokeTest = process.env.GLASS_SMOKE === "1";
if (isSmokeTest || process.env.ELECTRON_DISABLE_SANDBOX) {
  app.commandLine.appendSwitch("no-sandbox");
}

let mainWindow: BrowserWindow | null = null;

function broadcast(event: GlassEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC.event, event);
  }
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: "#0a0a12",
    title: "Glass",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : undefined,
    trafficLightPosition: { x: 18, y: 19 },
    vibrancy: process.platform === "darwin" ? "under-window" : undefined,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.once("ready-to-show", () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }

  return window;
}

async function runSmokeTest(window: BrowserWindow): Promise<void> {
  // Headless CI check: wait for first paint, capture a screenshot, exit.
  await new Promise<void>((resolve) => {
    if (window.webContents.isLoading()) {
      window.webContents.once("did-finish-load", () => resolve());
    } else {
      resolve();
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 2500));
  try {
    const image = await window.webContents.capturePage();
    const out = process.env.GLASS_SMOKE_OUT ?? "/tmp/glass-smoke.png";
    writeFileSync(out, image.toPNG());
    console.log(`[glass] smoke screenshot written to ${out}`);
    app.exit(0);
  } catch (error) {
    console.error("[glass] smoke test failed", error);
    app.exit(1);
  }
}

void app.whenReady().then(() => {
  const store = new GlassStore(app.getPath("userData"));
  const agents = new AgentManager(store, app.getPath("userData"), broadcast);
  const automations = new AutomationScheduler(store, agents, broadcast);
  registerIpc(store, agents, automations);
  automations.start();

  mainWindow = createWindow();
  if (isSmokeTest) void runSmokeTest(mainWindow);

  // Cloud runs keep going while the app is closed or the laptop sleeps;
  // pick their streams back up.
  if (store.getSettings().apiKey) {
    agents.reattachRunningSessions("startup");
  }
  powerMonitor.on("resume", () => {
    if (store.getSettings().apiKey) agents.reattachRunningSessions("wake");
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });

  app.on("before-quit", () => {
    automations.stop();
    store.flush();
    void agents.disposeAll();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
