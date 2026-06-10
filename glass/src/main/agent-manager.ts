import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { McpServerConfig, Run, SDKAgent, SDKCustomTool, SDKMessage } from "@cursor/sdk";
import type {
  GlassEvent,
  ModelInfo,
  Session,
  SessionConfig,
  TranscriptItem,
  VerifyResult,
} from "@shared/types";
import { LspManager } from "./lsp";
import type { GlassStore } from "./store";

type CursorSdk = typeof import("@cursor/sdk");

const PAYLOAD_LIMIT = 20_000;
const NAME_PROMPT_LIMIT = 600;

export interface SendOptions {
  automationName?: string;
  /** The user message is already in the transcript; don't echo it again. */
  skipUserEcho?: boolean;
}

/**
 * Owns every live Cursor SDK agent handle and run. The renderer only ever
 * sees plain `Session` / `TranscriptItem` data flowing over IPC.
 */
export class AgentManager {
  private sdkPromise?: Promise<CursorSdk>;
  private live = new Map<string, { agent?: SDKAgent; run?: Run }>();
  readonly lsp = new LspManager();

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

  // -- agent configuration ------------------------------------------------------

  /** Enabled MCP servers from settings, in the SDK's inline config shape. */
  private buildMcpServers(): Record<string, McpServerConfig> | undefined {
    const entries = this.store.getSettings().mcpServers?.filter((entry) => entry.enabled) ?? [];
    if (entries.length === 0) return undefined;
    const servers: Record<string, McpServerConfig> = {};
    for (const entry of entries) {
      if (entry.transport === "stdio") {
        if (!entry.command) continue;
        servers[entry.name] = {
          type: "stdio",
          command: entry.command,
          args: entry.args,
          env: entry.env,
        };
      } else {
        if (!entry.url) continue;
        servers[entry.name] = { type: "http", url: entry.url, headers: entry.headers };
      }
    }
    return Object.keys(servers).length > 0 ? servers : undefined;
  }

  /**
   * Custom tools for local agents. When LSP servers are configured, the agent
   * gets `lsp_diagnostics` to verify its edits with a real language server.
   */
  private buildCustomTools(session: Session): Record<string, SDKCustomTool> | undefined {
    const lspServers = this.store.getSettings().lspServers ?? [];
    if (lspServers.length === 0 || !session.cwd) return undefined;
    const cwd = session.cwd;
    return {
      lsp_diagnostics: {
        description:
          "Get language-server diagnostics (errors, warnings) for a file in the workspace. " +
          "Use this after editing files to verify they compile and pass language checks.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File path, absolute or relative to the workspace root",
            },
          },
          required: ["path"],
        },
        execute: async (args) => {
          const path = String(args.path ?? "");
          if (!path) return { content: [{ type: "text", text: "Missing path" }], isError: true };
          try {
            return await this.lsp.diagnostics(cwd, path, this.store.getSettings().lspServers ?? []);
          } catch (error) {
            return {
              content: [{ type: "text", text: describeError(error) }],
              isError: true,
            };
          }
        },
      },
    };
  }

  /**
   * settingSources makes local agents load `.cursor/` config from the project
   * and home dir: skills, file-based MCP servers, hooks, and subagents.
   */
  private buildLocalOptions(session: Session) {
    return {
      cwd: session.cwd!,
      settingSources: ["project", "user"] as ("project" | "user")[],
      customTools: this.buildCustomTools(session),
    };
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
      name: config.name.trim() || "New agent",
      nameIsAuto: config.name.trim().length === 0,
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
      const mcpServers = this.buildMcpServers();
      const agent =
        config.runtime === "local"
          ? await sdk.Agent.create({
              apiKey,
              name: session.name,
              model: session.model,
              mode: session.mode,
              mcpServers,
              local: this.buildLocalOptions(session),
            })
          : await sdk.Agent.create({
              apiKey,
              name: session.name,
              model: session.model,
              mode: session.mode,
              mcpServers,
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
    const session = this.store.getSession(sessionId);
    const entry = this.live.get(sessionId);
    try {
      entry?.run?.cancel().catch(() => {});
      entry?.agent?.close();
    } finally {
      this.live.delete(sessionId);
    }
    if (session?.cwd) this.lsp.disposeWorkspace(session.cwd);
    // Only Glass's local records are removed; the underlying Cursor agent
    // (and any cloud transcript) stays available from cursor.com/agents.
    this.store.removeSession(sessionId);
    this.broadcast({ type: "session-removed", sessionId });
  }

  renameSession(sessionId: string, name: string): void {
    const session = this.store.getSession(sessionId);
    if (!session || !name.trim()) return;
    this.updateSession(session, { name: name.trim().slice(0, 80), nameIsAuto: false });
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
    this.lsp.disposeAll();
  }

  // -- messaging ----------------------------------------------------------------

  /**
   * Queue-aware send: while a run is in flight, messages line up on the
   * session and dispatch FIFO as runs finish.
   */
  async send(sessionId: string, text: string, options?: SendOptions): Promise<void> {
    const session = this.store.getSession(sessionId);
    if (!session) throw new Error("Unknown session");

    const busy =
      session.status === "running" ||
      session.status === "creating" ||
      this.live.get(sessionId)?.run !== undefined;
    if (busy) {
      this.enqueue(session, text);
      return;
    }

    if (session.queue?.length) {
      // Idle with leftovers (e.g. after an error): keep write order by
      // appending, then drain from the head.
      this.enqueue(session, text);
      await this.dispatchNext(sessionId);
      return;
    }

    await this.dispatch(session, text, options);
  }

  removeQueuedMessage(sessionId: string, messageId: string): void {
    const session = this.store.getSession(sessionId);
    if (!session) return;
    this.updateSession(session, {
      queue: (session.queue ?? []).filter((message) => message.id !== messageId),
    });
  }

  private enqueue(session: Session, text: string): void {
    this.updateSession(session, {
      queue: [...(session.queue ?? []), { id: randomUUID(), text, ts: Date.now() }],
    });
  }

  /**
   * Drain the queue shortly after a run finalizes — deferred so finalizeRun's
   * cleanup (clearing the live run handle) lands before the next dispatch.
   */
  private scheduleQueueDispatch(sessionId: string): void {
    setTimeout(() => void this.dispatchNext(sessionId), 50);
  }

  /** Send the next queued message if the session is idle. */
  private async dispatchNext(sessionId: string): Promise<void> {
    const session = this.store.getSession(sessionId);
    if (!session) return;
    if (session.status === "running" || session.status === "creating") return;
    if (this.live.get(sessionId)?.run) return;
    const [next, ...rest] = session.queue ?? [];
    if (!next) return;
    this.updateSession(session, { queue: rest });
    try {
      await this.dispatch(session, next.text, { skipUserEcho: next.echoed });
    } catch {
      // dispatch already recorded the failure on the session
    }
  }

  private async dispatch(session: Session, text: string, options?: SendOptions): Promise<void> {
    const agent = await this.ensureAgent(session);
    const isFirstMessage = this.store.getTranscript(session.id).length === 0;

    if (options?.automationName) {
      this.pushItem(session, {
        id: randomUUID(),
        kind: "status",
        text: `Automation "${options.automationName}" triggered`,
        ts: Date.now(),
      });
    }
    if (!options?.skipUserEcho) {
      this.pushItem(session, { id: randomUUID(), kind: "user", text, ts: Date.now() });
    }
    this.updateSession(session, { status: "running", lastError: undefined });

    let run: Run;
    try {
      run = await agent.send(text);
    } catch (error) {
      const message = describeError(error);
      if (isBusyError(error)) {
        // A run is still active server-side (e.g. cloud 409). Requeue at the
        // head so the message goes out as soon as the agent frees up.
        this.updateSession(session, {
          status: "running",
          queue: [
            { id: randomUUID(), text, ts: Date.now(), echoed: true },
            ...(session.queue ?? []),
          ],
        });
        return;
      }
      this.pushItem(session, { id: randomUUID(), kind: "error", text: message, ts: Date.now() });
      this.updateSession(session, { status: "error", lastError: message });
      throw new Error(message);
    }

    const entry = this.live.get(session.id) ?? {};
    entry.run = run;
    this.live.set(session.id, entry);
    this.updateSession(session, { activeRunId: run.id });

    if (isFirstMessage && session.nameIsAuto) this.generateName(session, text);

    void this.consumeRun(session.id, run);
  }

  private async ensureAgent(session: Session): Promise<SDKAgent> {
    const entry = this.live.get(session.id);
    if (entry?.agent) return entry.agent;
    if (!session.agentId) throw new Error("Session has no agent id");

    const sdk = await this.loadSdk();
    // Inline MCP servers and custom tools are not persisted by the SDK across
    // resume, so pass the current settings again.
    const agent = await sdk.Agent.resume(session.agentId, {
      apiKey: this.requireApiKey(),
      model: session.model,
      mcpServers: this.buildMcpServers(),
      ...(session.runtime === "local" ? { local: this.buildLocalOptions(session) } : {}),
    });
    this.live.set(session.id, { ...(entry ?? {}), agent });
    return agent;
  }

  // -- resume after sleep / restart ------------------------------------------------

  /**
   * Reattach to cloud runs that kept going while the laptop lid was closed or
   * the app was quit. Local runs live in this process and can't be revived.
   */
  reattachRunningSessions(reason: "startup" | "wake"): void {
    for (const session of this.store.listSessions()) {
      if (session.runtime !== "cloud" || !session.agentId) continue;
      if (session.status !== "running" || !session.activeRunId) continue;
      const entry = this.live.get(session.id);
      if (reason === "startup" && entry?.run) continue; // already attached
      void this.reattach(session, reason);
    }
  }

  private async reattach(session: Session, reason: "startup" | "wake"): Promise<void> {
    try {
      const sdk = await this.loadSdk();
      await this.ensureAgent(session);
      const run = await sdk.Agent.getRun(session.activeRunId!, {
        runtime: "cloud",
        agentId: session.agentId!,
        apiKey: this.requireApiKey(),
      });

      if (run.status === "running" && run.supports("stream")) {
        // After a wake, the pre-sleep stream is often still attached and will
        // simply resume; only open a new one when no live handle exists.
        if (reason === "wake" && this.live.get(session.id)?.run) return;
        const entry = this.live.get(session.id) ?? {};
        entry.run = run;
        this.live.set(session.id, entry);
        this.pushItem(session, {
          id: randomUUID(),
          kind: "status",
          text: reason === "wake" ? "Reconnected after sleep" : "Reconnected to running agent",
          ts: Date.now(),
        });
        void this.consumeRun(session.id, run);
      } else if (this.store.getSession(session.id)?.status === "running") {
        // The run ended while we were away; pull the final result.
        const entry = this.live.get(session.id) ?? {};
        entry.run = run;
        this.live.set(session.id, entry);
        void this.finalizeRun(session.id, run);
      }
    } catch (error) {
      this.updateSession(session, {
        status: "error",
        lastError: `Could not reattach: ${describeError(error)}`,
        activeRunId: undefined,
      });
    }
  }

  // -- chat naming --------------------------------------------------------------

  /** Generate a short title from the first message, Codex-style. */
  private generateName(session: Session, firstMessage: string): void {
    this.updateSession(session, { nameIsAuto: false });
    void (async () => {
      try {
        const sdk = await this.loadSdk();
        const namingDir = join(this.userDataDir, "naming-workspace");
        mkdirSync(namingDir, { recursive: true });
        const result = await sdk.Agent.prompt(
          "Generate a concise 3-6 word title for the coding task below. " +
            "Reply with ONLY the title text. No quotes, no trailing punctuation, no tools.\n\n" +
            `Task: ${firstMessage.slice(0, NAME_PROMPT_LIMIT)}`,
          {
            apiKey: this.requireApiKey(),
            model: { id: session.model.id },
            local: { cwd: namingDir },
          },
        );
        const title = (result.result ?? "")
          .trim()
          .split("\n")[0]
          .replace(/^["'`#*\s]+|["'`*.\s]+$/g, "")
          .slice(0, 64);
        const current = this.store.getSession(session.id);
        if (title && current) this.updateSession(current, { name: title });
      } catch {
        // keep the placeholder name
      }
    })();
  }

  // -- run consumption -------------------------------------------------------------

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

    await this.finalizeRun(sessionId, run);
  }

  private async finalizeRun(sessionId: string, run: Run): Promise<void> {
    const session = () => this.store.getSession(sessionId);
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
        this.updateSession(current, { status: "idle", activeRunId: undefined });
        this.scheduleQueueDispatch(sessionId);
      } else if (result.status === "cancelled") {
        this.pushItem(current, {
          id: randomUUID(),
          kind: "status",
          text: "Run cancelled",
          ts: Date.now(),
        });
        this.updateSession(current, { status: "idle", activeRunId: undefined });
        this.scheduleQueueDispatch(sessionId);
      } else {
        const message = result.result || "Run failed";
        this.pushItem(current, { id: randomUUID(), kind: "error", text: message, ts: Date.now() });
        this.updateSession(current, {
          status: "error",
          lastError: message,
          activeRunId: undefined,
        });
      }
    } catch (error) {
      const current = session();
      if (current) {
        const message = describeError(error);
        this.pushItem(current, { id: randomUUID(), kind: "error", text: message, ts: Date.now() });
        this.updateSession(current, {
          status: "error",
          lastError: message,
          activeRunId: undefined,
        });
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

function isBusyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code ?? "";
  return (
    error.constructor.name === "AgentBusyError" ||
    /agent_?busy/i.test(code) ||
    /agent is busy/i.test(error.message)
  );
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
