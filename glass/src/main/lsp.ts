import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { LspServerEntry } from "@shared/types";

interface LspDiagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity?: number;
  message: string;
  source?: string;
  code?: string | number;
}

const SEVERITIES: Record<number, string> = { 1: "error", 2: "warning", 3: "info", 4: "hint" };

const LANGUAGE_IDS: Record<string, string> = {
  ts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
  jsx: "javascriptreact",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  go: "go",
  rs: "rust",
  rb: "ruby",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  json: "json",
  css: "css",
  scss: "scss",
  html: "html",
  md: "markdown",
  yaml: "yaml",
  yml: "yaml",
};

/**
 * Minimal LSP client: spawn a server over stdio, initialize against a
 * workspace root, open documents, and collect publishDiagnostics.
 */
class LspClient {
  private process: ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, (result: unknown) => void>();
  private diagnostics = new Map<string, LspDiagnostic[]>();
  private diagnosticWaiters = new Map<string, Array<() => void>>();
  private openDocuments = new Set<string>();
  private initialized: Promise<void>;
  private failed?: string;

  constructor(
    entry: LspServerEntry,
    private readonly rootDir: string,
  ) {
    this.process = spawn(entry.command, entry.args ?? [], {
      cwd: rootDir,
      stdio: "pipe",
      env: process.env,
    });
    this.process.stdout.on("data", (chunk: Buffer) => this.onData(chunk));
    this.process.on("error", (error) => {
      this.failed = `Failed to start ${entry.command}: ${error.message}`;
    });
    this.process.on("exit", () => {
      this.failed = this.failed ?? `${entry.name} exited`;
    });

    this.initialized = this.initialize();
  }

  get alive(): boolean {
    return !this.failed && this.process.exitCode === null;
  }

  private async initialize(): Promise<void> {
    const rootUri = pathToFileURL(this.rootDir).toString();
    await this.request("initialize", {
      processId: process.pid,
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: "workspace" }],
      capabilities: {
        textDocument: { publishDiagnostics: { relatedInformation: false } },
        workspace: { configuration: true },
      },
    });
    this.notify("initialized", {});
  }

  /** Open (or refresh) a file and wait for the server to publish diagnostics. */
  async diagnosticsFor(filePath: string, timeoutMs = 10_000): Promise<string> {
    if (this.failed) throw new Error(this.failed);
    await withTimeout(this.initialized, timeoutMs, "LSP server did not finish initializing");

    const uri = pathToFileURL(filePath).toString();
    const text = readFileSync(filePath, "utf8");
    const languageId = LANGUAGE_IDS[extname(filePath).slice(1).toLowerCase()] ?? "plaintext";

    const received = new Promise<void>((resolve) => {
      const waiters = this.diagnosticWaiters.get(uri) ?? [];
      waiters.push(resolve);
      this.diagnosticWaiters.set(uri, waiters);
    });

    if (this.openDocuments.has(uri)) {
      this.notify("textDocument/didClose", { textDocument: { uri } });
      this.openDocuments.delete(uri);
    }
    this.notify("textDocument/didOpen", {
      textDocument: { uri, languageId, version: 1, text },
    });
    this.openDocuments.add(uri);

    // Servers publish diagnostics asynchronously; give slow ones a chance but
    // fall back to whatever is cached when the timeout passes.
    await Promise.race([received, sleep(timeoutMs)]);

    return formatDiagnostics(filePath, this.diagnostics.get(uri) ?? []);
  }

  dispose(): void {
    try {
      this.process.kill();
    } catch {
      // already dead
    }
  }

  // -- JSON-RPC plumbing -----------------------------------------------------

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const promise = new Promise<unknown>((resolve) => this.pending.set(id, resolve));
    this.write({ jsonrpc: "2.0", id, method, params });
    return promise;
  }

  private notify(method: string, params: unknown): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private respond(id: number | string, result: unknown): void {
    this.write({ jsonrpc: "2.0", id, result });
  }

  private write(message: object): void {
    if (!this.alive) return;
    const body = Buffer.from(JSON.stringify(message), "utf8");
    this.process.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    this.process.stdin.write(body);
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = this.buffer.subarray(0, headerEnd).toString("utf8");
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) {
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }
      const length = Number(lengthMatch[1]);
      const messageEnd = headerEnd + 4 + length;
      if (this.buffer.length < messageEnd) return;
      const body = this.buffer.subarray(headerEnd + 4, messageEnd).toString("utf8");
      this.buffer = this.buffer.subarray(messageEnd);
      try {
        this.onMessage(JSON.parse(body));
      } catch {
        // malformed frame; skip
      }
    }
  }

  private onMessage(message: {
    id?: number | string;
    method?: string;
    params?: unknown;
    result?: unknown;
  }): void {
    // Response to one of our requests.
    if (message.id !== undefined && message.method === undefined) {
      const resolve = this.pending.get(Number(message.id));
      if (resolve) {
        this.pending.delete(Number(message.id));
        resolve(message.result);
      }
      return;
    }

    // Server -> client request: answer generically so servers don't stall.
    if (message.id !== undefined && message.method) {
      if (message.method === "workspace/configuration") {
        const items = (message.params as { items?: unknown[] })?.items ?? [];
        this.respond(message.id, items.map(() => null));
      } else {
        this.respond(message.id, null);
      }
      return;
    }

    if (message.method === "textDocument/publishDiagnostics") {
      const params = message.params as { uri: string; diagnostics: LspDiagnostic[] };
      this.diagnostics.set(params.uri, params.diagnostics ?? []);
      const waiters = this.diagnosticWaiters.get(params.uri);
      if (waiters) {
        this.diagnosticWaiters.delete(params.uri);
        for (const wake of waiters) wake();
      }
    }
  }
}

function formatDiagnostics(filePath: string, diagnostics: LspDiagnostic[]): string {
  if (diagnostics.length === 0) return `No diagnostics for ${filePath}. The file looks clean.`;
  const lines = diagnostics.slice(0, 50).map((diagnostic) => {
    const severity = SEVERITIES[diagnostic.severity ?? 1] ?? "error";
    const position = `${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1}`;
    const source = diagnostic.source ? ` [${diagnostic.source}]` : "";
    return `${severity} ${filePath}:${position}${source} ${diagnostic.message.replace(/\s+/g, " ")}`;
  });
  if (diagnostics.length > 50) lines.push(`… and ${diagnostics.length - 50} more`);
  return lines.join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

/** One client per (workspace, server config), started lazily. */
export class LspManager {
  private clients = new Map<string, LspClient>();

  async diagnostics(
    rootDir: string,
    requestedPath: string,
    servers: LspServerEntry[],
  ): Promise<string> {
    const filePath = isAbsolute(requestedPath) ? requestedPath : join(rootDir, requestedPath);
    const extension = extname(filePath).slice(1).toLowerCase();

    const server =
      servers.find((candidate) =>
        candidate.extensions.some((item) => item.replace(/^\./, "").toLowerCase() === extension),
      ) ?? servers[0];
    if (!server) throw new Error("No LSP servers configured. Add one in Settings → LSP.");

    const key = `${server.id}::${rootDir}`;
    let client = this.clients.get(key);
    if (!client || !client.alive) {
      client?.dispose();
      client = new LspClient(server, rootDir);
      this.clients.set(key, client);
    }
    return client.diagnosticsFor(filePath);
  }

  disposeWorkspace(rootDir: string): void {
    for (const [key, client] of this.clients) {
      if (key.endsWith(`::${rootDir}`)) {
        client.dispose();
        this.clients.delete(key);
      }
    }
  }

  disposeAll(): void {
    for (const [, client] of this.clients) client.dispose();
    this.clients.clear();
  }
}
