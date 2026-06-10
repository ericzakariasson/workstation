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

/** A message waiting for the current run to finish. */
export interface QueuedMessage {
  id: string;
  text: string;
  ts: number;
  /** Already echoed to the transcript (requeued after a busy collision). */
  echoed?: boolean;
}

export interface Session {
  id: string;
  /** Cursor SDK agent id (`agent-` local, `bc-` cloud). Set once created. */
  agentId?: string;
  name: string;
  /** True until a title is auto-generated from the first message. */
  nameIsAuto?: boolean;
  runtime: Runtime;
  model: ModelChoice;
  mode: ConversationMode;
  cwd?: string;
  repoUrl?: string;
  startingRef?: string;
  autoCreatePR?: boolean;
  status: SessionStatus;
  /** SDK run id of the in-flight run, used to reattach after sleep/restart. */
  activeRunId?: string;
  /** Messages queued while a run is in flight, dispatched FIFO. */
  queue?: QueuedMessage[];
  lastError?: string;
  branch?: string;
  prUrl?: string;
  createdAt: number;
  lastActivityAt: number;
}

export type ToolStatus = "running" | "completed" | "error";

/** Base64 image payload, matching the SDK's SDKImage data form. */
export interface ImageAttachment {
  data: string;
  mimeType: string;
}

export type TranscriptItem =
  | { id: string; kind: "user"; text: string; attachments?: number; ts: number }
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
  | { type: "session-removed"; sessionId: string }
  | { type: "automations"; automations: Automation[] };

// -- MCP -----------------------------------------------------------------

export interface McpServerEntry {
  id: string;
  name: string;
  enabled: boolean;
  transport: "stdio" | "http";
  /** stdio */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** http */
  url?: string;
  headers?: Record<string, string>;
}

// -- LSP -----------------------------------------------------------------

export interface LspServerEntry {
  id: string;
  name: string;
  command: string;
  args?: string[];
  /** File extensions this server handles, e.g. ["ts", "tsx"]. */
  extensions: string[];
}

// -- Voice ----------------------------------------------------------------

export interface VoiceSettings {
  /** API key for an OpenAI-compatible transcription endpoint. */
  apiKey?: string;
  /** Base URL, defaults to https://api.openai.com/v1 */
  baseUrl?: string;
  /** Model id, defaults to gpt-4o-mini-transcribe */
  model?: string;
}

// -- Automations ------------------------------------------------------------

export type AutomationSchedule =
  | { kind: "interval"; minutes: number }
  | { kind: "daily"; hour: number; minute: number };

export interface Automation {
  id: string;
  name: string;
  sessionId: string;
  prompt: string;
  schedule: AutomationSchedule;
  enabled: boolean;
  lastRunAt?: number;
  nextRunAt?: number;
}

// -- Skills ------------------------------------------------------------------

export interface SkillInfo {
  name: string;
  description?: string;
  source: "project" | "user";
}

// -- Settings -----------------------------------------------------------------

export interface Settings {
  apiKey?: string;
  defaultModelId?: string;
  mcpServers?: McpServerEntry[];
  lspServers?: LspServerEntry[];
  voice?: VoiceSettings;
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
