import { useState } from "react";
import { glass } from "../api";
import { useGlass } from "../store";
import { Icon } from "./Icon";

export function SettingsModal() {
  const settings = useGlass((state) => state.settings);
  const account = useGlass((state) => state.account);
  const models = useGlass((state) => state.models);
  const saveApiKey = useGlass((state) => state.saveApiKey);
  const setShowSettings = useGlass((state) => state.setShowSettings);
  const showToast = useGlass((state) => state.showToast);

  const [apiKey, setApiKey] = useState(settings.apiKey ?? "");
  const [defaultModelId, setDefaultModelId] = useState(settings.defaultModelId ?? "");
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
      await glass.setSettings({ defaultModelId: defaultModelId || undefined });
      showToast("Settings saved");
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
      <div className="modal">
        <div className="modal-header">
          <h2>Settings</h2>
          <button type="button" className="btn-icon" onClick={() => setShowSettings(false)}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="modal-body">
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
            <select
              value={defaultModelId}
              onChange={(event) => setDefaultModelId(event.target.value)}
            >
              <option value="">No default</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName}
                </option>
              ))}
            </select>
          </label>

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
