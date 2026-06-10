import { useState } from "react";
import { useGlass } from "../store";
import { Icon } from "./Icon";

export function Onboarding() {
  const saveApiKey = useGlass((state) => state.saveApiKey);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    if (!apiKey.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await saveApiKey(apiKey.trim());
    if (!result.ok) setError(result.error ?? "Could not verify API key");
    setBusy(false);
  };

  return (
    <div className="onboarding drag">
      <div className="onboarding-card no-drag">
        <div className="onboarding-mark">
          <Icon name="spark" size={26} />
        </div>
        <h1>Glass</h1>
        <p className="onboarding-tagline">
          Orchestrate Cursor agents — local and cloud — from one cockpit.
        </p>
        <div className="onboarding-form">
          <input
            type="password"
            value={apiKey}
            placeholder="Paste your Cursor API key"
            onChange={(event) => setApiKey(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void connect()}
          />
          <button
            type="button"
            className="btn btn-accent"
            disabled={!apiKey.trim() || busy}
            onClick={() => void connect()}
          >
            {busy ? "Verifying…" : "Connect"}
          </button>
        </div>
        {error && (
          <div className="error-line">
            <Icon name="alert" size={14} />
            <span>{error}</span>
          </div>
        )}
        <p className="onboarding-help">
          Get a key from <strong>cursor.com → Dashboard → API Keys</strong>. It stays on this
          machine and is only sent to Cursor's API.
        </p>
      </div>
    </div>
  );
}
