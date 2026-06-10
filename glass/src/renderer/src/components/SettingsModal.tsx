import { useState } from "react";
import type { LspServerEntry, McpServerEntry } from "@shared/types";
import { useGlass } from "../store";
import { Icon } from "./Icon";

function parseKeyValues(text: string): Record<string, string> | undefined {
  const record: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([^=\s]+)\s*=\s*(.*)$/);
    if (match) record[match[1]] = match[2].trim();
  }
  return Object.keys(record).length > 0 ? record : undefined;
}

function parseArgs(text: string): string[] | undefined {
  const args = text.trim().split(/\s+/).filter(Boolean);
  return args.length > 0 ? args : undefined;
}

function McpSection({
  servers,
  onChange,
}: {
  servers: McpServerEntry[];
  onChange: (servers: McpServerEntry[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"stdio" | "http">("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [extra, setExtra] = useState("");

  const reset = () => {
    setAdding(false);
    setName("");
    setCommand("");
    setArgs("");
    setUrl("");
    setExtra("");
  };

  const add = () => {
    if (!name.trim()) return;
    if (transport === "stdio" && !command.trim()) return;
    if (transport === "http" && !url.trim()) return;
    const entry: McpServerEntry = {
      id: crypto.randomUUID(),
      name: name.trim().replace(/\s+/g, "-"),
      enabled: true,
      transport,
      command: transport === "stdio" ? command.trim() : undefined,
      args: transport === "stdio" ? parseArgs(args) : undefined,
      env: transport === "stdio" ? parseKeyValues(extra) : undefined,
      url: transport === "http" ? url.trim() : undefined,
      headers: transport === "http" ? parseKeyValues(extra) : undefined,
    };
    onChange([...servers, entry]);
    reset();
  };

  return (
    <div className="settings-section">
      <div className="settings-section-head">
        <Icon name="plug" size={14} />
        <h3>MCP servers</h3>
        {!adding && (
          <button type="button" className="btn btn-small" onClick={() => setAdding(true)}>
            <Icon name="plus" size={12} /> Add
          </button>
        )}
      </div>
      <span className="field-help">
        Passed inline to every agent (local and cloud). Local agents also load
        <code> .cursor/mcp.json</code> from the workspace and your home directory.
      </span>

      {servers.map((server) => (
        <div key={server.id} className="config-row">
          <label className="switch" title={server.enabled ? "Enabled" : "Disabled"}>
            <input
              type="checkbox"
              checked={server.enabled}
              onChange={(event) =>
                onChange(
                  servers.map((item) =>
                    item.id === server.id ? { ...item, enabled: event.target.checked } : item,
                  ),
                )
              }
            />
            <span className="switch-track" />
          </label>
          <span className="config-row-name">{server.name}</span>
          <span className="config-row-detail">
            {server.transport === "stdio"
              ? `${server.command ?? ""} ${(server.args ?? []).join(" ")}`.trim()
              : server.url}
          </span>
          <button
            type="button"
            className="config-row-delete"
            onClick={() => onChange(servers.filter((item) => item.id !== server.id))}
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      ))}
      {servers.length === 0 && !adding && <div className="config-empty">No MCP servers configured.</div>}

      {adding && (
        <div className="config-form">
          <div className="field-row">
            <label className="field field-grow">
              <span className="field-label">Name</span>
              <input type="text" value={name} placeholder="linear" onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Transport</span>
              <select value={transport} onChange={(e) => setTransport(e.target.value as "stdio" | "http")}>
                <option value="stdio">stdio</option>
                <option value="http">http</option>
              </select>
            </label>
          </div>
          {transport === "stdio" ? (
            <div className="field-row">
              <label className="field">
                <span className="field-label">Command</span>
                <input type="text" value={command} placeholder="npx" onChange={(e) => setCommand(e.target.value)} />
              </label>
              <label className="field field-grow">
                <span className="field-label">Arguments</span>
                <input
                  type="text"
                  value={args}
                  placeholder="-y @modelcontextprotocol/server-github"
                  onChange={(e) => setArgs(e.target.value)}
                />
              </label>
            </div>
          ) : (
            <label className="field">
              <span className="field-label">URL</span>
              <input
                type="text"
                value={url}
                placeholder="https://mcp.linear.app/sse"
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
          )}
          <label className="field">
            <span className="field-label">{transport === "stdio" ? "Environment (KEY=value per line)" : "Headers (KEY=value per line)"}</span>
            <textarea
              className="config-textarea"
              rows={2}
              value={extra}
              placeholder={transport === "stdio" ? "GITHUB_TOKEN=ghp_…" : "Authorization=Bearer …"}
              onChange={(e) => setExtra(e.target.value)}
            />
          </label>
          <div className="config-form-actions">
            <button type="button" className="btn btn-small" onClick={reset}>
              Cancel
            </button>
            <button type="button" className="btn btn-small btn-accent" onClick={add}>
              Add server
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LspSection({
  servers,
  onChange,
}: {
  servers: LspServerEntry[];
  onChange: (servers: LspServerEntry[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [extensions, setExtensions] = useState("");

  const reset = () => {
    setAdding(false);
    setName("");
    setCommand("");
    setArgs("");
    setExtensions("");
  };

  const add = () => {
    if (!name.trim() || !command.trim()) return;
    onChange([
      ...servers,
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        command: command.trim(),
        args: parseArgs(args),
        extensions: extensions
          .split(/[,\s]+/)
          .map((ext) => ext.replace(/^\./, "").trim().toLowerCase())
          .filter(Boolean),
      },
    ]);
    reset();
  };

  return (
    <div className="settings-section">
      <div className="settings-section-head">
        <Icon name="code" size={14} />
        <h3>LSP servers</h3>
        {!adding && (
          <button type="button" className="btn btn-small" onClick={() => setAdding(true)}>
            <Icon name="plus" size={12} /> Add
          </button>
        )}
      </div>
      <span className="field-help">
        Local agents get an <code>lsp_diagnostics</code> tool backed by these language servers, so
        they can verify their edits compile before finishing.
      </span>

      {servers.map((server) => (
        <div key={server.id} className="config-row">
          <span className="config-row-name">{server.name}</span>
          <span className="config-row-detail">
            {server.command} {(server.args ?? []).join(" ")}
            {server.extensions.length > 0 && ` · .${server.extensions.join(" .")}`}
          </span>
          <button
            type="button"
            className="config-row-delete"
            onClick={() => onChange(servers.filter((item) => item.id !== server.id))}
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      ))}
      {servers.length === 0 && !adding && <div className="config-empty">No LSP servers configured.</div>}

      {adding && (
        <div className="config-form">
          <div className="field-row">
            <label className="field field-grow">
              <span className="field-label">Name</span>
              <input
                type="text"
                value={name}
                placeholder="TypeScript"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Extensions</span>
              <input
                type="text"
                value={extensions}
                placeholder="ts, tsx"
                onChange={(e) => setExtensions(e.target.value)}
              />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Command</span>
              <input
                type="text"
                value={command}
                placeholder="typescript-language-server"
                onChange={(e) => setCommand(e.target.value)}
              />
            </label>
            <label className="field field-grow">
              <span className="field-label">Arguments</span>
              <input type="text" value={args} placeholder="--stdio" onChange={(e) => setArgs(e.target.value)} />
            </label>
          </div>
          <div className="config-form-actions">
            <button type="button" className="btn btn-small" onClick={reset}>
              Cancel
            </button>
            <button type="button" className="btn btn-small btn-accent" onClick={add}>
              Add server
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsModal() {
  const settings = useGlass((state) => state.settings);
  const account = useGlass((state) => state.account);
  const models = useGlass((state) => state.models);
  const saveApiKey = useGlass((state) => state.saveApiKey);
  const saveSettings = useGlass((state) => state.saveSettings);
  const setShowSettings = useGlass((state) => state.setShowSettings);
  const showToast = useGlass((state) => state.showToast);

  const [apiKey, setApiKey] = useState(settings.apiKey ?? "");
  const [defaultModelId, setDefaultModelId] = useState(settings.defaultModelId ?? "");
  const [voiceApiKey, setVoiceApiKey] = useState(settings.voice?.apiKey ?? "");
  const [voiceBaseUrl, setVoiceBaseUrl] = useState(settings.voice?.baseUrl ?? "");
  const [voiceModel, setVoiceModel] = useState(settings.voice?.model ?? "");
  const [mcpServers, setMcpServers] = useState<McpServerEntry[]>(settings.mcpServers ?? []);
  const [lspServers, setLspServers] = useState<LspServerEntry[]>(settings.lspServers ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (apiKey.trim() && apiKey.trim() !== settings.apiKey) {
        const result = await saveApiKey(apiKey.trim());
        if (!result.ok) {
          setError(result.error ?? "Could not verify API key");
          setBusy(false);
          return;
        }
      }
      await saveSettings({
        defaultModelId: defaultModelId || undefined,
        mcpServers,
        lspServers,
        voice: {
          apiKey: voiceApiKey.trim() || undefined,
          baseUrl: voiceBaseUrl.trim() || undefined,
          model: voiceModel.trim() || undefined,
        },
      });
      showToast("Settings saved — applies to newly started agents");
      setShowSettings(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && setShowSettings(false)}
    >
      <div className="modal modal-wide">
        <div className="modal-header">
          <h2>Settings</h2>
          <button type="button" className="btn-icon" onClick={() => setShowSettings(false)}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="modal-body">
          <div className="settings-section">
            <div className="settings-section-head">
              <Icon name="spark" size={14} />
              <h3>Account</h3>
            </div>
            <label className="field">
              <span className="field-label">Cursor API key</span>
              <input
                type="password"
                value={apiKey}
                placeholder="key_…"
                onChange={(event) => setApiKey(event.target.value)}
              />
              <span className="field-help">
                Create one at cursor.com → Dashboard → API Keys. Stored locally on this machine.
              </span>
            </label>
            {account && (
              <div className="account-line">
                <Icon name="check" size={13} />
                Connected as <strong>{account.userEmail ?? account.apiKeyName}</strong>
              </div>
            )}
            <label className="field">
              <span className="field-label">Default model</span>
              <select value={defaultModelId} onChange={(event) => setDefaultModelId(event.target.value)}>
                <option value="">No default</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="settings-section">
            <div className="settings-section-head">
              <Icon name="mic" size={14} />
              <h3>Voice to text</h3>
            </div>
            <span className="field-help">
              Dictation in the composer uses an OpenAI-compatible transcription endpoint.
            </span>
            <label className="field">
              <span className="field-label">API key</span>
              <input
                type="password"
                value={voiceApiKey}
                placeholder="sk-…"
                onChange={(event) => setVoiceApiKey(event.target.value)}
              />
            </label>
            <div className="field-row">
              <label className="field field-grow">
                <span className="field-label">Base URL</span>
                <input
                  type="text"
                  value={voiceBaseUrl}
                  placeholder="https://api.openai.com/v1"
                  onChange={(event) => setVoiceBaseUrl(event.target.value)}
                />
              </label>
              <label className="field field-grow">
                <span className="field-label">Model</span>
                <input
                  type="text"
                  value={voiceModel}
                  placeholder="gpt-4o-mini-transcribe"
                  onChange={(event) => setVoiceModel(event.target.value)}
                />
              </label>
            </div>
          </div>

          <McpSection servers={mcpServers} onChange={setMcpServers} />
          <LspSection servers={lspServers} onChange={setLspServers} />

          {error && (
            <div className="error-line">
              <Icon name="alert" size={14} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={() => setShowSettings(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
