import { contextBridge, ipcRenderer } from "electron";
import { IPC, type GlassApi } from "@shared/api";
import type { GlassEvent, SessionConfig, Settings } from "@shared/types";

const api: GlassApi = {
  platform: process.platform,
  demo: process.env.GLASS_DEMO === "1",

  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  setSettings: (patch: Partial<Settings>) => ipcRenderer.invoke(IPC.settingsSet, patch),
  verifyApiKey: (apiKey: string) => ipcRenderer.invoke(IPC.authVerify, apiKey),

  listModels: () => ipcRenderer.invoke(IPC.modelsList),

  listSessions: () => ipcRenderer.invoke(IPC.sessionsList),
  getTranscript: (sessionId: string) => ipcRenderer.invoke(IPC.sessionsTranscript, sessionId),
  createSession: (config: SessionConfig) => ipcRenderer.invoke(IPC.sessionsCreate, config),
  removeSession: (sessionId: string) => ipcRenderer.invoke(IPC.sessionsRemove, sessionId),
  sendMessage: (sessionId: string, text: string) =>
    ipcRenderer.invoke(IPC.sessionsSend, sessionId, text),
  cancelRun: (sessionId: string) => ipcRenderer.invoke(IPC.sessionsCancel, sessionId),

  pickDirectory: () => ipcRenderer.invoke(IPC.dialogPickDirectory),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.shellOpenExternal, url),

  onEvent: (callback: (event: GlassEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: GlassEvent) => callback(payload);
    ipcRenderer.on(IPC.event, listener);
    return () => ipcRenderer.removeListener(IPC.event, listener);
  },
};

contextBridge.exposeInMainWorld("glass", api);
