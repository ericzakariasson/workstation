import { useMemo, useState } from "react";
import type { ConversationMode, ModelChoice, Runtime } from "@shared/types";
import { glass } from "../api";
import { useGlass } from "../store";
import { Icon } from "./Icon";

const FALLBACK_MODEL_ID = "composer-2.5";

export function NewAgentModal() {
  const models = useGlass((state) => state.models);
  const settings = useGlass((state) => state.settings);
  const createSession = useGlass((state) => state.createSession);
  const setShowNewAgent = useGlass((state) => state.setShowNewAgent);

  const defaultModelId = useMemo(() => {
    if (settings.defaultModelId && models.some((m) => m.id === settings.defaultModelId)) {
      return settings.defaultModelId;
    }
    if (models.some((m) => m.id === FALLBACK_MODEL_ID)) return FALLBACK_MODEL_ID;
    return models[0]?.id ?? FALLBACK_MODEL_ID;
  }, [models, settings.defaultModelId]);

  const [name, setName] = useState("");
  const [runtime, setRuntime] = useState<Runtime>("local");
  const [mode, setMode] = useState<ConversationMode>("agent");
  const [modelId, setModelId] = useState(defaultModelId);
  const [modelParams, setModelParams] = useState<Record<string, string>>({});
  const [cwd, setCwd] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [startingRef, setStartingRef] = useState("");
  const [autoCreatePR, setAutoCreatePR] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedModel = models.find((model) => model.id === modelId);

  const canCreate =
    !busy && (runtime === "local" ? cwd.trim().length > 0 : true) && modelId.length > 0;

  const pickFolder = async () => {
    const dir = await glass.pickDirectory();
    if (dir) {
      setCwd(dir);
      if (!name.trim()) {
        const base = dir.split(/[\\/]/).filter(Boolean).pop();
        if (base) setName(base);
      }
    }
  };

  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    const model: ModelChoice = {
      id: modelId,
      params: selectedModel?.parameters
        ?.filter((parameter) => modelParams[parameter.id])
        .map((parameter) => ({ id: parameter.id, value: modelParams[parameter.id] })),
    };
    try {
      await createSession({
        name:
          name.trim() ||
          (runtime === "cloud" && repoUrl.trim()
            ? repoUrl.trim().split("/").slice(-1)[0]
            : "Untitled agent"),
        runtime,
        mode,
        model,
        cwd: runtime === "local" ? cwd.trim() : undefined,
        repoUrl: runtime === "cloud" ? repoUrl.trim() || undefined : undefined,
        startingRef: runtime === "cloud" ? startingRef.trim() || undefined : undefined,
        autoCreatePR: runtime === "cloud" ? autoCreatePR : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowNewAgent(false)}>
      <div className="modal">
        <div className="modal-header">
          <h2>New agent</h2>
          <button type="button" className="btn-icon" onClick={() => setShowNewAgent(false)}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="modal-body">
          <label className="field">
            <span className="field-label">Name</span>
            <input
              type="text"
              value={name}
              placeholder="Fix flaky auth tests"
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <div className="field">
            <span className="field-label">Runtime</span>
            <div className="segmented">
              <button
                type="button"
                className={runtime === "local" ? "active" : ""}
                onClick={() => setRuntime("local")}
              >
                <Icon name="folder" size={13} /> Local
              </button>
              <button
                type="button"
                className={runtime === "cloud" ? "active" : ""}
                onClick={() => setRuntime("cloud")}
              >
                <Icon name="cloud" size={13} /> Cloud
              </button>
            </div>
            <span className="field-help">
              {runtime === "local"
                ? "Runs the agent loop in-process against a folder on this machine."
                : "Runs in an isolated Cursor-hosted VM with the repo cloned in."}
            </span>
          </div>

          {runtime === "local" ? (
            <label className="field">
              <span className="field-label">Workspace folder</span>
              <div className="field-row">
                <input
                  type="text"
                  value={cwd}
                  placeholder="/path/to/repo"
                  onChange={(event) => setCwd(event.target.value)}
                />
                <button type="button" className="btn" onClick={() => void pickFolder()}>
                  Browse…
                </button>
              </div>
            </label>
          ) : (
            <>
              <label className="field">
                <span className="field-label">Repository URL (optional)</span>
                <input
                  type="text"
                  value={repoUrl}
                  placeholder="https://github.com/your-org/your-repo"
                  onChange={(event) => setRepoUrl(event.target.value)}
                />
              </label>
              <div className="field-row">
                <label className="field field-grow">
                  <span className="field-label">Starting ref</span>
                  <input
                    type="text"
                    value={startingRef}
                    placeholder="main"
                    onChange={(event) => setStartingRef(event.target.value)}
                  />
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={autoCreatePR}
                    onChange={(event) => setAutoCreatePR(event.target.checked)}
                  />
                  <span>Auto-create PR</span>
                </label>
              </div>
            </>
          )}

          <div className="field-row">
            <label className="field field-grow">
              <span className="field-label">Model</span>
              <select value={modelId} onChange={(event) => setModelId(event.target.value)}>
                {models.length === 0 && <option value={FALLBACK_MODEL_ID}>{FALLBACK_MODEL_ID}</option>}
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Mode</span>
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as ConversationMode)}
              >
                <option value="agent">Agent</option>
                <option value="plan">Plan</option>
              </select>
            </label>
          </div>

          {selectedModel?.parameters?.map((parameter) => (
            <label key={parameter.id} className="field">
              <span className="field-label">{parameter.displayName ?? parameter.id}</span>
              <select
                value={modelParams[parameter.id] ?? ""}
                onChange={(event) =>
                  setModelParams((params) => ({ ...params, [parameter.id]: event.target.value }))
                }
              >
                <option value="">Default</option>
                {parameter.values.map((value) => (
                  <option key={value.value} value={value.value}>
                    {value.displayName ?? value.value}
                  </option>
                ))}
              </select>
            </label>
          ))}

          {error && (
            <div className="error-line">
              <Icon name="alert" size={14} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={() => setShowNewAgent(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-accent" disabled={!canCreate} onClick={() => void create()}>
            {busy ? <span className="spinner spinner-light" /> : <Icon name="spark" size={14} />}
            {busy ? "Creating…" : "Create agent"}
          </button>
        </div>
      </div>
    </div>
  );
}
