import type {
  GlassEvent,
  ModelInfo,
  Session,
  SessionConfig,
  Settings,
  TranscriptItem,
  VerifyResult,
} from "./types";

/** The bridge surface exposed on `window.glass` by the preload script. */
export interface GlassApi {
  platform: string;
  /** Demo mode renders seeded data so the UI can be explored without an API key. */
  demo: boolean;

  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  verifyApiKey(apiKey: string): Promise<VerifyResult>;

  listModels(): Promise<ModelInfo[]>;

  listSessions(): Promise<Session[]>;
  getTranscript(sessionId: string): Promise<TranscriptItem[]>;
  createSession(config: SessionConfig): Promise<Session>;
  removeSession(sessionId: string): Promise<void>;
  sendMessage(sessionId: string, text: string): Promise<void>;
  cancelRun(sessionId: string): Promise<void>;

  pickDirectory(): Promise<string | null>;
  openExternal(url: string): Promise<void>;

  onEvent(callback: (event: GlassEvent) => void): () => void;
}

export const IPC = {
  settingsGet: "settings:get",
  settingsSet: "settings:set",
  authVerify: "auth:verify",
  modelsList: "models:list",
  sessionsList: "sessions:list",
  sessionsTranscript: "sessions:transcript",
  sessionsCreate: "sessions:create",
  sessionsRemove: "sessions:remove",
  sessionsSend: "sessions:send",
  sessionsCancel: "sessions:cancel",
  dialogPickDirectory: "dialog:pick-directory",
  shellOpenExternal: "shell:open-external",
  event: "glass:event",
} as const;
