/** Where the agent loop runs. Mirrors the Cursor SDK's local/cloud split. */
export type Runtime = "local" | "cloud";

export type ConversationMode = "agent" | "plan";

export interface ModelParamChoice {
  id: string;
  value: string;
}

export interface ModelChoice {
  id: string;
  params?: ModelParamChoice[];
}

export interface ModelParameterInfo {
  id: string;
  displayName?: string;
  values: Array<{ value: string; displayName?: string }>;
}

export interface ModelInfo {
  id: string;
  displayName: string;
  description?: string;
  parameters?: ModelParameterInfo[];
}

/** Options collected by the "New agent" form. */
export interface SessionConfig {
  name: string;
  runtime: Runtime;
  model: ModelChoice;
  mode: ConversationMode;
  /** Local runtime: absolute workspace path. */
  cwd?: string;
  /** Cloud runtime: repository to clone. Empty for a no-repo cloud agent. */
  repoUrl?: string;
  startingRef?: string;
  autoCreatePR?: boolean;
}

export type SessionStatus = "idle" | "creating" | "running" | "error";

export interface Session {
  id: string;
  /** Cursor SDK agent id (`agent-` local, `bc-` cloud). Set once created. */
  agentId?: string;
  name: string;
  runtime: Runtime;
  model: ModelChoice;
  mode: ConversationMode;
  cwd?: string;
  repoUrl?: string;
  startingRef?: string;
  autoCreatePR?: boolean;
  status: SessionStatus;
  lastError?: string;
  branch?: string;
  prUrl?: string;
  createdAt: number;
  lastActivityAt: number;
}

export type ToolStatus = "running" | "completed" | "error";

export type TranscriptItem =
  | { id: string; kind: "user"; text: string; ts: number }
  | { id: string; kind: "assistant"; text: string; ts: number }
  | { id: string; kind: "thinking"; text: string; durationMs?: number; ts: number }
  | {
      id: string;
      kind: "tool";
      callId: string;
      name: string;
      status: ToolStatus;
      args?: string;
      result?: string;
      ts: number;
    }
  | { id: string; kind: "status"; text: string; ts: number }
  | { id: string; kind: "error"; text: string; ts: number }
  | {
      id: string;
      kind: "result";
      text: string;
      durationMs?: number;
      branch?: string;
      prUrl?: string;
      ts: number;
    };

/** Push events from main -> renderer. */
export type GlassEvent =
  | { type: "transcript"; sessionId: string; item: TranscriptItem }
  | { type: "session"; session: Session }
  | { type: "session-removed"; sessionId: string };

export interface Settings {
  apiKey?: string;
  defaultModelId?: string;
}

export interface AccountInfo {
  apiKeyName: string;
  userEmail?: string;
}

export interface VerifyResult {
  ok: boolean;
  account?: AccountInfo;
  error?: string;
}
