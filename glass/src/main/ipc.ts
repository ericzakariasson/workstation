import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { IPC } from "@shared/api";
import type { SessionConfig, Settings } from "@shared/types";
import type { AgentManager } from "./agent-manager";
import type { GlassStore } from "./store";

export function registerIpc(store: GlassStore, agents: AgentManager): void {
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

  ipcMain.handle(IPC.sessionsSend, (_event, sessionId: string, text: string) =>
    agents.send(sessionId, text),
  );

  ipcMain.handle(IPC.sessionsCancel, (_event, sessionId: string) => agents.cancelRun(sessionId));

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
