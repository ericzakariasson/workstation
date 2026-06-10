import { useState } from "react";
import type { Automation, AutomationSchedule } from "@shared/types";
import { useGlass } from "../store";
import { timeAgo } from "../util";
import { Icon } from "./Icon";

function scheduleSummary(schedule: AutomationSchedule): string {
  if (schedule.kind === "interval") {
    if (schedule.minutes % 60 === 0 && schedule.minutes >= 60) {
      const hours = schedule.minutes / 60;
      return `Every ${hours === 1 ? "hour" : `${hours} hours`}`;
    }
    return `Every ${schedule.minutes} min`;
  }
  return `Daily at ${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
}

function AutomationForm({
  initial,
  onDone,
}: {
  initial?: Automation;
  onDone: () => void;
}) {
  const sessions = useGlass((state) => state.sessions);
  const saveAutomation = useGlass((state) => state.saveAutomation);

  const [name, setName] = useState(initial?.name ?? "");
  const [sessionId, setSessionId] = useState(initial?.sessionId ?? sessions[0]?.id ?? "");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [kind, setKind] = useState<AutomationSchedule["kind"]>(initial?.schedule.kind ?? "daily");
  const [minutes, setMinutes] = useState(
    initial?.schedule.kind === "interval" ? String(initial.schedule.minutes) : "60",
  );
  const [time, setTime] = useState(
    initial?.schedule.kind === "daily"
      ? `${String(initial.schedule.hour).padStart(2, "0")}:${String(initial.schedule.minute).padStart(2, "0")}`
      : "09:00",
  );

  const canSave = name.trim() && sessionId && prompt.trim();

  const save = async () => {
    if (!canSave) return;
    const [hour, minute] = time.split(":").map(Number);
    const schedule: AutomationSchedule =
      kind === "interval"
        ? { kind: "interval", minutes: Math.max(1, Number(minutes) || 60) }
        : { kind: "daily", hour: hour || 0, minute: minute || 0 };
    await saveAutomation({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      sessionId,
      prompt: prompt.trim(),
      schedule,
      enabled: initial?.enabled ?? true,
      lastRunAt: initial?.lastRunAt,
    });
    onDone();
  };

  return (
    <div className="config-form">
      <div className="field-row">
        <label className="field field-grow">
          <span className="field-label">Name</span>
          <input
            type="text"
            value={name}
            placeholder="Morning triage"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field field-grow">
          <span className="field-label">Agent</span>
          <select value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field-label">Prompt</span>
        <textarea
          className="config-textarea"
          rows={3}
          value={prompt}
          placeholder="Check CI for failures on main and investigate any new ones."
          onChange={(event) => setPrompt(event.target.value)}
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Schedule</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as AutomationSchedule["kind"])}
          >
            <option value="daily">Daily at…</option>
            <option value="interval">Every N minutes</option>
          </select>
        </label>
        {kind === "daily" ? (
          <label className="field">
            <span className="field-label">Time</span>
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
        ) : (
          <label className="field">
            <span className="field-label">Minutes</span>
            <input
              type="number"
              min={1}
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </label>
        )}
      </div>
      <div className="config-form-actions">
        <button type="button" className="btn btn-small" onClick={onDone}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-small btn-accent"
          disabled={!canSave}
          onClick={() => void save()}
        >
          {initial ? "Save" : "Create automation"}
        </button>
      </div>
    </div>
  );
}

export function AutomationsModal() {
  const automations = useGlass((state) => state.automations);
  const sessions = useGlass((state) => state.sessions);
  const saveAutomation = useGlass((state) => state.saveAutomation);
  const removeAutomation = useGlass((state) => state.removeAutomation);
  const runAutomationNow = useGlass((state) => state.runAutomationNow);
  const setShowAutomations = useGlass((state) => state.setShowAutomations);
  const [editing, setEditing] = useState<Automation | "new" | null>(null);

  const sessionName = (id: string) =>
    sessions.find((session) => session.id === id)?.name ?? "(removed agent)";

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && setShowAutomations(false)}
    >
      <div className="modal modal-wide">
        <div className="modal-header">
          <h2>
            <Icon name="zap" size={16} className="modal-title-icon" /> Automations
          </h2>
          <button type="button" className="btn-icon" onClick={() => setShowAutomations(false)}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="modal-body">
          <span className="field-help">
            Recurring prompts dispatched to your agents on a schedule. Automations run locally
            while Glass is open; schedules that lapse while it's closed fire on next launch's
            cadence.
          </span>

          {automations.length === 0 && editing === null && (
            <div className="config-empty">No automations yet. Create one to put an agent on a schedule.</div>
          )}

          {automations.map((automation) =>
            editing !== "new" && editing?.id === automation.id ? (
              <AutomationForm key={automation.id} initial={automation} onDone={() => setEditing(null)} />
            ) : (
              <div key={automation.id} className="automation-row">
                <label className="switch" title={automation.enabled ? "Enabled" : "Disabled"}>
                  <input
                    type="checkbox"
                    checked={automation.enabled}
                    onChange={(event) =>
                      void saveAutomation({ ...automation, enabled: event.target.checked })
                    }
                  />
                  <span className="switch-track" />
                </label>
                <button type="button" className="automation-body" onClick={() => setEditing(automation)}>
                  <span className="automation-name">{automation.name}</span>
                  <span className="automation-meta">
                    <Icon name="clock" size={11} /> {scheduleSummary(automation.schedule)}
                    <span className="automation-sep">·</span>
                    {sessionName(automation.sessionId)}
                    {automation.lastRunAt && (
                      <>
                        <span className="automation-sep">·</span>
                        last run {timeAgo(automation.lastRunAt)}
                      </>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn-icon btn-icon-small"
                  title="Run now"
                  onClick={() => void runAutomationNow(automation.id)}
                >
                  <Icon name="play" size={12} />
                </button>
                <button
                  type="button"
                  className="btn-icon btn-icon-small config-row-delete"
                  title="Delete"
                  onClick={() => void removeAutomation(automation.id)}
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            ),
          )}

          {editing === "new" ? (
            <AutomationForm onDone={() => setEditing(null)} />
          ) : (
            <button type="button" className="btn" onClick={() => setEditing("new")}>
              <Icon name="plus" size={13} /> New automation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
