import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Run, SDKAgent, SDKMessage } from "@cursor/sdk";
import type {
  GlassEvent,
  ModelInfo,
  Session,
  SessionConfig,
  TranscriptItem,
  VerifyResult,
} from "@shared/types";
import type { GlassStore } from "./store";

type CursorSdk = typeof import("@cursor/sdk");

const PAYLOAD_LIMIT = 20_000;

/**
 * Owns every live Cursor SDK agent handle and run. The renderer only ever
 * sees plain `Session` / `TranscriptItem` data flowing over IPC.
 */
export class AgentManager {
  private sdkPromise?: Promise<CursorSdk>;
  private live = new Map<string, { agent?: SDKAgent; run?: Run }>();

  constructor(
    private readonly store: GlassStore,
    private readonly userDataDir: string,
    private readonly broadcast: (event: GlassEvent) => void,
  ) {}

  // -- SDK bootstrap ---------------------------------------------------------

  private loadSdk(): Promise<CursorSdk> {
    if (!this.sdkPromise) {
      this.sdkPromise = import("@cursor/sdk").then((sdk) => {
        // The default local store is sqlite3, a native Node addon that is not
        // ABI-compatible with Electron without a rebuild. The JSONL store is
        // pure JS, so local agents persist without any native compilation.
        sdk.Cursor.configure({
          local: { store: new sdk.JsonlLocalAgentStore(join(this.userDataDir, "agent-store")) },
        });
        return sdk;
      });
    }
    return this.sdkPromise;
  }

  private requireApiKey(): string {
    const apiKey = this.store.getSettings().apiKey;
    if (!apiKey) throw new Error("No Cursor API key configured. Add one in Settings.");
    return apiKey;
  }

  // -- account / catalog -------------------------------------------------------

  async verifyApiKey(apiKey: string): Promise<VerifyResult> {
    try {
      const sdk = await this.loadSdk();
      const user = await sdk.Cursor.me({ apiKey });
      return { ok: true, account: { apiKeyName: user.apiKeyName, userEmail: user.userEmail } };
    } catch (error) {
      return { ok: false, error: describeError(error) };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const sdk = await this.loadSdk();
    const models = await sdk.Cursor.models.list({ apiKey: this.requireApiKey() });
    return models.map((model) => ({
      id: model.id,
      displayName: model.displayName,
      description: model.description,
      parameters: model.parameters?.map((parameter) => ({
        id: parameter.id,
        displayName: parameter.displayName,
        values: parameter.values.map((value) => ({
          value: value.value,
          displayName: value.displayName,
        })),
      })),
    }));
  }

  // -- session lifecycle --------------------------------------------------------

  async createSession(config: SessionConfig): Promise<Session> {
    const sdk = await this.loadSdk();
    const apiKey = this.requireApiKey();
    const now = Date.now();
    const session: Session = {
      id: randomUUID(),
      name: config.name.trim() || "Untitled agent",
      runtime: config.runtime,
      model: config.model,
      mode: config.mode,
      cwd: config.cwd,
      repoUrl: config.repoUrl?.trim() || undefined,
      startingRef: config.startingRef?.trim() || undefined,
      autoCreatePR: config.autoCreatePR,
      status: "creating",
      createdAt: now,
      lastActivityAt: now,
    };
    this.store.upsertSession(session);
    this.broadcast({ type: "session", session });

    try {
      const agent =
        config.runtime === "local"
          ? await sdk.Agent.create({
              apiKey,
              name: session.name,
              model: session.model,
              mode: session.mode,
              local: { cwd: config.cwd! },
            })
          : await sdk.Agent.create({
              apiKey,
              name: session.name,
              model: session.model,
              mode: session.mode,
              cloud: {
                repos: session.repoUrl
                  ? [{ url: session.repoUrl, startingRef: session.startingRef }]
                  : undefined,
                autoCreatePR: session.autoCreatePR,
              },
            });
      session.agentId = agent.agentId;
      session.status = "idle";
      this.live.set(session.id, { agent });
      this.store.upsertSession(session);
      this.broadcast({ type: "session", session });
      return session;
    } catch (error) {
      this.store.removeSession(session.id);
      this.broadcast({ type: "session-removed", sessionId: session.id });
      throw new Error(describeError(error));
    }
  }

  async removeSession(sessionId: string): Promise<void> {
    const entry = this.live.get(sessionId);
    try {
      entry?.run?.cancel().catch(() => {});
      entry?.agent?.close();
    } finally {
      this.live.delete(sessionId);
    }
    // Only Glass's local records are removed; the underlying Cursor agent
    // (and any cloud transcript) stays available from cursor.com/agents.
    this.store.removeSession(sessionId);
    this.broadcast({ type: "session-removed", sessionId });
  }

  async cancelRun(sessionId: string): Promise<void> {
    const run = this.live.get(sessionId)?.run;
    if (run) await run.cancel();
  }

  async disposeAll(): Promise<void> {
    for (const [, entry] of this.live) {
      try {
        entry.agent?.close();
      } catch {
        // best effort on shutdown
      }
    }
    this.live.clear();
  }

  // -- messaging ----------------------------------------------------------------

  async send(sessionId: string, text: string): Promise<void> {
    const session = this.store.getSession(sessionId);
    if (!session) throw new Error("Unknown session");

    const agent = await this.ensureAgent(session);
    this.pushItem(session, { id: randomUUID(), kind: "user", text, ts: Date.now() });
    this.updateSession(session, { status: "running", lastError: undefined });

    let run: Run;
    try {
      run = await agent.send(text);
    } catch (error) {
      const message = describeError(error);
      this.pushItem(session, { id: randomUUID(), kind: "error", text: message, ts: Date.now() });
      this.updateSession(session, { status: "error", lastError: message });
      throw new Error(message);
    }

    const entry = this.live.get(session.id) ?? {};
    entry.run = run;
    this.live.set(session.id, entry);
    void this.consumeRun(session.id, run);
  }

  private async ensureAgent(session: Session): Promise<SDKAgent> {
    const entry = this.live.get(session.id);
    if (entry?.agent) return entry.agent;
    if (!session.agentId) throw new Error("Session has no agent id");

    const sdk = await this.loadSdk();
    const agent = await sdk.Agent.resume(session.agentId, {
      apiKey: this.requireApiKey(),
      model: session.model,
    });
    this.live.set(session.id, { ...(entry ?? {}), agent });
    return agent;
  }

  /** Drains the run's event stream, mirroring it into the transcript. */
  private async consumeRun(sessionId: string, run: Run): Promise<void> {
    const toolItemIds = new Map<string, string>();
    const session = () => this.store.getSession(sessionId);

    try {
      for await (const event of run.stream()) {
        const current = session();
        if (!current) return; // session was removed mid-run
        this.handleStreamEvent(current, event, toolItemIds);
      }
    } catch (error) {
      const current = session();
      if (current) {
        const message = describeError(error);
        this.pushItem(current, { id: randomUUID(), kind: "error", text: message, ts: Date.now() });
        this.updateSession(current, { status: "error", lastError: message });
      }
      return;
    }

    try {
      const result = await run.wait();
      const current = session();
      if (!current) return;

      const gitBranch = result.git?.branches?.[0];
      if (gitBranch?.branch || gitBranch?.prUrl) {
        this.updateSession(current, { branch: gitBranch.branch, prUrl: gitBranch.prUrl });
      }

      if (result.status === "finished") {
        this.pushItem(current, {
          id: randomUUID(),
          kind: "result",
          text: "Run finished",
          durationMs: result.durationMs,
          branch: gitBranch?.branch,
          prUrl: gitBranch?.prUrl,
          ts: Date.now(),
        });
        this.updateSession(current, { status: "idle" });
      } else if (result.status === "cancelled") {
        this.pushItem(current, {
          id: randomUUID(),
          kind: "status",
          text: "Run cancelled",
          ts: Date.now(),
        });
        this.updateSession(current, { status: "idle" });
      } else {
        const message = result.result || "Run failed";
        this.pushItem(current, { id: randomUUID(), kind: "error", text: message, ts: Date.now() });
        this.updateSession(current, { status: "error", lastError: message });
      }
    } catch (error) {
      const current = session();
      if (current) {
        const message = describeError(error);
        this.pushItem(current, { id: randomUUID(), kind: "error", text: message, ts: Date.now() });
        this.updateSession(current, { status: "error", lastError: message });
      }
    } finally {
      const entry = this.live.get(sessionId);
      if (entry) entry.run = undefined;
    }
  }

  private handleStreamEvent(
    session: Session,
    event: SDKMessage,
    toolItemIds: Map<string, string>,
  ): void {
    switch (event.type) {
      case "assistant": {
        const text = event.message.content
          .filter((block): block is { type: "text"; text: string } => block.type === "text")
          .map((block) => block.text)
          .join("");
        if (text.trim()) {
          this.pushItem(session, { id: randomUUID(), kind: "assistant", text, ts: Date.now() });
        }
        break;
      }
      case "thinking": {
        if (event.text?.trim()) {
          this.pushItem(session, {
            id: randomUUID(),
            kind: "thinking",
            text: event.text,
            durationMs: event.thinking_duration_ms,
            ts: Date.now(),
          });
        }
        break;
      }
      case "tool_call": {
        let itemId = toolItemIds.get(event.call_id);
        if (!itemId) {
          itemId = randomUUID();
          toolItemIds.set(event.call_id, itemId);
        }
        this.pushItem(session, {
          id: itemId,
          kind: "tool",
          callId: event.call_id,
          name: event.name,
          status: event.status,
          args: stringifyPayload(event.args),
          result: stringifyPayload(event.result),
          ts: Date.now(),
        });
        break;
      }
      case "status": {
        // Cloud lifecycle transitions; surface the interesting ones.
        if (event.status === "CREATING") {
          this.pushItem(session, {
            id: randomUUID(),
            kind: "status",
            text: "Provisioning cloud VM and cloning repo…",
            ts: Date.now(),
          });
        } else if (event.status === "EXPIRED") {
          this.pushItem(session, {
            id: randomUUID(),
            kind: "status",
            text: "Cloud agent expired",
            ts: Date.now(),
          });
        } else if (event.message) {
          this.pushItem(session, {
            id: randomUUID(),
            kind: "status",
            text: event.message,
            ts: Date.now(),
          });
        }
        break;
      }
      case "task": {
        if (event.text?.trim()) {
          this.pushItem(session, {
            id: randomUUID(),
            kind: "status",
            text: event.text,
            ts: Date.now(),
          });
        }
        break;
      }
      case "request": {
        this.pushItem(session, {
          id: randomUUID(),
          kind: "status",
          text: "Agent is waiting for input or approval",
          ts: Date.now(),
        });
        break;
      }
      default:
        // "system" and the user echo carry no UI value here.
        break;
    }
  }

  // -- bookkeeping ----------------------------------------------------------------

  private pushItem(session: Session, item: TranscriptItem): void {
    const merged = this.store.upsertTranscriptItem(session.id, item);
    session.lastActivityAt = Date.now();
    this.store.upsertSession(session);
    this.broadcast({ type: "transcript", sessionId: session.id, item: merged });
  }

  private updateSession(session: Session, patch: Partial<Session>): void {
    Object.assign(session, patch);
    session.lastActivityAt = Date.now();
    this.store.upsertSession(session);
    this.broadcast({ type: "session", session });
  }
}

/** Tool args/results are unstable, internal shapes — render them defensively. */
function stringifyPayload(payload: unknown): string | undefined {
  if (payload === undefined || payload === null) return undefined;
  let text: string;
  if (typeof payload === "string") {
    text = payload;
  } else {
    try {
      text = JSON.stringify(payload, null, 2);
    } catch {
      text = String(payload);
    }
  }
  if (text.length > PAYLOAD_LIMIT) {
    text = `${text.slice(0, PAYLOAD_LIMIT)}\n… (truncated)`;
  }
  return text;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const sdkError = error as Error & { code?: string; status?: number; helpUrl?: string };
    const parts = [error.message];
    if (sdkError.code) parts.push(`(${sdkError.code})`);
    if (sdkError.helpUrl) parts.push(`Help: ${sdkError.helpUrl}`);
    return parts.join(" ");
  }
  return String(error);
}
