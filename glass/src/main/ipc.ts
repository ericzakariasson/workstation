import { BrowserWindow, dialog, ipcMain, shell, webContents } from "electron";
import { IPC } from "@shared/api";
import type { Automation, ImageAttachment, SessionConfig, Settings } from "@shared/types";
import type { AgentManager } from "./agent-manager";
import type { AutomationScheduler } from "./automations";
import { listSkills } from "./skills";
import type { GlassStore } from "./store";
import { transcribeAudio } from "./voice";

export function registerIpc(
  store: GlassStore,
  agents: AgentManager,
  automations: AutomationScheduler,
): void {
  ipcMain.handle(IPC.settingsGet, () => store.getSettings());

  ipcMain.handle(IPC.settingsSet, (_event, patch: Partial<Settings>) =>
    store.patchSettings(patch),
  );

  ipcMain.handle(IPC.authVerify, (_event, apiKey: string) => agents.verifyApiKey(apiKey));

  ipcMain.handle(IPC.modelsList, () => agents.listModels());

  ipcMain.handle(IPC.sessionsList, () => store.listSessions());

  ipcMain.handle(IPC.sessionsTranscript, (_event, sessionId: string) =>
    store.getTranscript(sessionId),
  );

  ipcMain.handle(IPC.sessionsCreate, (_event, config: SessionConfig) =>
    agents.createSession(config),
  );

  ipcMain.handle(IPC.sessionsRemove, (_event, sessionId: string) =>
    agents.removeSession(sessionId),
  );

  ipcMain.handle(IPC.sessionsRename, (_event, sessionId: string, name: string) =>
    agents.renameSession(sessionId, name),
  );

  ipcMain.handle(
    IPC.sessionsSend,
    (_event, sessionId: string, text: string, images?: ImageAttachment[]) =>
      agents.send(sessionId, text, images?.length ? { images } : undefined),
  );

  ipcMain.handle(IPC.sessionsCancel, (_event, sessionId: string) => agents.cancelRun(sessionId));

  ipcMain.handle(IPC.sessionsQueueRemove, (_event, sessionId: string, messageId: string) =>
    agents.removeQueuedMessage(sessionId, messageId),
  );

  ipcMain.handle(IPC.skillsList, (_event, cwd?: string) => listSkills(cwd));

  ipcMain.handle(IPC.automationsList, () => store.listAutomations());

  ipcMain.handle(IPC.automationsSave, (_event, automation: Automation) =>
    automations.save(automation),
  );

  ipcMain.handle(IPC.automationsRemove, (_event, id: string) => automations.remove(id));

  ipcMain.handle(IPC.automationsRunNow, (_event, id: string) => automations.runNow(id));

  ipcMain.handle(IPC.voiceTranscribe, (_event, audio: ArrayBuffer, mimeType: string) =>
    transcribeAudio(audio, mimeType, store.getSettings().voice),
  );

  ipcMain.handle(IPC.browserCapture, async (_event, webContentsId: number) => {
    const target = webContents.fromId(webContentsId);
    if (!target || target.isDestroyed()) throw new Error("Browser view not available");
    const image = await target.capturePage();
    const attachment: ImageAttachment = {
      data: image.toPNG().toString("base64"),
      mimeType: "image/png",
    };
    return attachment;
  });

  ipcMain.handle(IPC.dialogPickDirectory, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window ?? BrowserWindow.getAllWindows()[0], {
      title: "Choose a workspace folder",
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle(IPC.shellOpenExternal, (_event, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url);
    return undefined;
  });
}
