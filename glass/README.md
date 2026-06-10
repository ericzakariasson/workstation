# Glass

Agent orchestration for Cursor — a Codex-style desktop cockpit built with **Electron** and powered by the [Cursor TypeScript SDK](https://cursor.com/docs/sdk/typescript).

Spin up parallel coding agents — **local** against folders on your machine, or **cloud** in isolated Cursor-hosted VMs — and watch them think, run tools, and ship branches/PRs in real time.

## Features

- **Multi-agent sidebar** — run any number of agents in parallel with live status, search, collapse-to-rail, and double-click rename
- **Local + cloud runtimes** — local agents work directly on a folder you pick; cloud agents clone a GitHub repo into a Cursor-hosted VM and can auto-open PRs
- **Live transcript** — streamed assistant output (markdown), collapsible thinking blocks, tool-call cards with arguments/results, and run lifecycle events
- **Run control** — cancel an in-flight run, follow up on the same conversation, switch between Agent and Plan modes
- **Model picker** — model catalog and per-model parameters (e.g. thinking effort) discovered live via `Cursor.models.list()`
- **MCP servers** — manage stdio/HTTP MCP servers in Settings; they're passed inline to every agent (local + cloud). Local agents also load `.cursor/mcp.json` from the project and your home dir
- **Skills** — local agents load Cursor skills from `.cursor/skills/` (project + user) via `settingSources`; detected skills are shown on each agent's start screen
- **LSP integration** — configure language servers (e.g. `typescript-language-server --stdio`) and local agents get an `lsp_diagnostics` custom tool to verify their edits compile before finishing
- **Close laptop / resume on open** — cloud runs keep executing while you're away; Glass reattaches their streams on wake (`powerMonitor`) and on app relaunch, pulling whatever finished in the meantime
- **Voice to text** — dictate prompts from the composer mic; audio is transcribed through an OpenAI-compatible `/audio/transcriptions` endpoint configured in Settings
- **Automations (local)** — recurring prompts on an interval or daily schedule, dispatched to any agent while Glass is open, with run-now and enable/disable toggles
- **Auto-named chats** — leave the name blank and Glass titles the session from your first message (one-shot `Agent.prompt()`)
- **Persistent sessions** — sessions and transcripts survive restarts; agents are reattached with `Agent.resume()`
- **Git awareness** — branch and PR links surfaced from cloud run results

## Quick start

```bash
cd glass
npm install
npm run dev
```

On first launch, paste a Cursor API key (cursor.com → Dashboard → API Keys). The key is verified via `Cursor.me()` and stored locally in Electron's user-data directory.

### Demo mode (no API key)

Explore the full UI with seeded agents and transcripts:

```bash
GLASS_DEMO=1 npm run dev
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Launch with HMR (electron-vite) |
| `npm run build` | Build main / preload / renderer bundles into `out/` |
| `npm start` | Run the built app (`electron-vite preview`) |
| `npm run typecheck` | Typecheck the node (main/preload) and web (renderer) projects |
| `npm run smoke` | Build, then boot headless in demo mode and write a screenshot (`GLASS_SMOKE=1`) |

## Architecture

```
src/
  main/               Electron main process (the only place the SDK runs)
    agent-manager.ts  Owns SDKAgent/Run handles; maps run.stream() events -> transcript items;
                      MCP/LSP wiring, chat naming, sleep/restart reattach
    automations.ts    Local scheduler for recurring prompts
    lsp.ts            Minimal LSP client (stdio JSON-RPC) behind the lsp_diagnostics custom tool
    skills.ts         .cursor/skills scanner (project + user)
    voice.ts          OpenAI-compatible audio transcription
    store.ts          Flat-file persistence: settings, sessions, automations, transcripts
    ipc.ts            ipcMain.handle() endpoints
    index.ts          Window/lifecycle, powerMonitor resume hook, headless smoke-test hook
  preload/            contextBridge -> window.glass (typed by src/shared/api.ts)
  shared/             Types + IPC channel names shared by all processes
  renderer/           React UI (zustand store, glassmorphism styling)
```

Design notes:

- **SDK stays in the main process.** `@cursor/sdk` is Node-first (native sandbox/ripgrep binary, sqlite default store), so the renderer only ever sees plain serializable `Session` / `TranscriptItem` objects over IPC.
- **JSONL agent store.** The SDK's default local checkpoint store is `sqlite3`, a native addon that would need an Electron ABI rebuild. Glass configures `JsonlLocalAgentStore` instead (`Cursor.configure`), which is pure JS and keeps local agents resumable with zero native compilation.
- **One ordered event source.** Each run is consumed via `run.stream()`; `tool_call` events arrive twice (running → completed) and are merged into a single transcript card by `call_id`. Final result metadata (duration, branch, PR URL) is read from `run.wait()`.
- **Sleep/restart resilience.** Each session persists its `activeRunId`. Cloud sessions still marked running are reattached via `Agent.getRun()` on startup and on `powerMonitor` resume — streaming again if the run is alive, or finalizing the result if it ended while the lid was closed. Inline MCP servers and custom tools are re-passed on every `Agent.resume()` because the SDK does not persist them.
- **LSP as a custom tool.** Rather than a separate UI, language servers plug into the agent loop: `local.customTools.lsp_diagnostics` spawns the configured server per workspace (lazily, reused across calls), opens the file over stdio JSON-RPC, and returns `publishDiagnostics` results to the model.
- **Removal is non-destructive.** Deleting a session only removes Glass's local records; cloud agents remain visible at cursor.com/agents (SDK-created agents are under Filter → Source → SDK).

## Caveats

- The local runtime executes tool calls (shell, edits) without approval prompts — same as the SDK's headless default. Point local agents at workspaces you trust it to modify.
- The API key is stored as plaintext JSON (mode 600) in the user-data dir.
