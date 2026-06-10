import { useEffect, useRef, useState } from "react";
import type { Session } from "@shared/types";
import { glass } from "../api";
import { useGlass } from "../store";
import { timeAgo } from "../util";
import { Icon } from "./Icon";

function statusClass(session: Session): string {
  if (session.status === "running" || session.status === "creating") return "dot dot-running";
  if (session.status === "error") return "dot dot-error";
  return "dot dot-idle";
}

function SessionRow({ session, active }: { session: Session; active: boolean }) {
  const selectSession = useGlass((state) => state.selectSession);
  const removeSession = useGlass((state) => state.removeSession);
  const renameSession = useGlass((state) => state.renameSession);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(session.name);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, session.name]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== session.name) {
      void renameSession(session.id, draft.trim());
    }
  };

  return (
    <button
      type="button"
      className={`session-row${active ? " session-row-active" : ""}`}
      onClick={() => selectSession(session.id)}
    >
      <span className={statusClass(session)} />
      <span className="session-row-body">
        {editing ? (
          <input
            ref={inputRef}
            className="session-rename"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") setEditing(false);
            }}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <span
            className="session-row-name"
            title="Double-click to rename"
            onDoubleClick={(event) => {
              event.stopPropagation();
              setEditing(true);
            }}
          >
            {session.name}
          </span>
        )}
        <span className="session-row-meta">
          <span className={`chip chip-${session.runtime}`}>
            <Icon name={session.runtime === "cloud" ? "cloud" : "folder"} size={11} />
            {session.runtime}
          </span>
          {session.mode === "plan" && <span className="chip chip-plan">plan</span>}
          <span className="session-row-time">{timeAgo(session.lastActivityAt)}</span>
        </span>
      </span>
      <span
        className="session-row-delete"
        title="Remove from Glass"
        onClick={(event) => {
          event.stopPropagation();
          void removeSession(session.id);
        }}
      >
        <Icon name="trash" size={13} />
      </span>
    </button>
  );
}

export function Sidebar() {
  const sessions = useGlass((state) => state.sessions);
  const activeSessionId = useGlass((state) => state.activeSessionId);
  const account = useGlass((state) => state.account);
  const demo = useGlass((state) => state.demo);
  const automations = useGlass((state) => state.automations);
  const collapsed = useGlass((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useGlass((state) => state.setSidebarCollapsed);
  const setShowNewAgent = useGlass((state) => state.setShowNewAgent);
  const setShowSettings = useGlass((state) => state.setShowSettings);
  const setShowAutomations = useGlass((state) => state.setShowAutomations);
  const [query, setQuery] = useState("");

  const running = sessions.filter(
    (session) => session.status === "running" || session.status === "creating",
  ).length;

  const visible = query.trim()
    ? sessions.filter((session) =>
        session.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : sessions;

  const enabledAutomations = automations.filter((automation) => automation.enabled).length;

  if (collapsed) {
    return (
      <aside className={`sidebar sidebar-collapsed${glass.platform === "darwin" ? " sidebar-mac" : ""}`}>
        <div className="sidebar-brand drag">
          <button
            type="button"
            className="brand-mark no-drag brand-mark-button"
            title="Expand sidebar"
            onClick={() => setSidebarCollapsed(false)}
          >
            <Icon name="spark" size={16} />
          </button>
        </div>
        <button
          type="button"
          className="btn-icon sidebar-rail-button"
          title="New agent"
          onClick={() => setShowNewAgent(true)}
        >
          <Icon name="plus" size={15} />
        </button>
        <div className="sidebar-rail-list">
          {sessions.slice(0, 12).map((session) => (
            <button
              key={session.id}
              type="button"
              title={session.name}
              className={`sidebar-rail-session${session.id === activeSessionId ? " active" : ""}`}
              onClick={() => useGlass.getState().selectSession(session.id)}
            >
              <span className={statusClass(session)} />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn-icon sidebar-rail-button"
          title="Automations"
          onClick={() => setShowAutomations(true)}
        >
          <Icon name="zap" size={15} />
        </button>
        <button
          type="button"
          className="btn-icon sidebar-rail-button"
          style={{ marginBottom: 12 }}
          title="Settings"
          onClick={() => setShowSettings(true)}
        >
          <Icon name="settings" size={15} />
        </button>
      </aside>
    );
  }

  return (
    <aside className={`sidebar${glass.platform === "darwin" ? " sidebar-mac" : ""}`}>
      <div className="sidebar-brand drag">
        <span className="brand-mark">
          <Icon name="spark" size={16} />
        </span>
        <span className="brand-name">Glass</span>
        {demo && <span className="chip chip-demo no-drag">demo</span>}
        <button
          type="button"
          className="sidebar-collapse no-drag"
          title="Collapse sidebar"
          onClick={() => setSidebarCollapsed(true)}
        >
          <Icon name="panel" size={14} />
        </button>
      </div>

      <button type="button" className="btn btn-accent new-agent no-drag" onClick={() => setShowNewAgent(true)}>
        <Icon name="plus" size={15} />
        New agent
      </button>

      <div className="sidebar-search">
        <Icon name="search" size={13} />
        <input
          type="text"
          value={query}
          placeholder="Search agents…"
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button type="button" className="sidebar-search-clear" onClick={() => setQuery("")}>
            <Icon name="x" size={12} />
          </button>
        )}
      </div>

      <div className="sidebar-section">
        <span>Agents</span>
        {running > 0 && <span className="sidebar-running">{running} running</span>}
      </div>

      <div className="session-list">
        {visible.length === 0 && (
          <div className="session-list-empty">
            {query ? "No agents match your search." : (
              <>
                No agents yet.
                <br />
                Spin one up to get started.
              </>
            )}
          </div>
        )}
        {visible.map((session) => (
          <SessionRow key={session.id} session={session} active={session.id === activeSessionId} />
        ))}
      </div>

      <button type="button" className="sidebar-tool" onClick={() => setShowAutomations(true)}>
        <Icon name="zap" size={14} />
        <span>Automations</span>
        {enabledAutomations > 0 && <span className="sidebar-tool-badge">{enabledAutomations}</span>}
      </button>

      <button type="button" className="sidebar-footer" onClick={() => setShowSettings(true)}>
        <span className="avatar">{(account?.userEmail ?? account?.apiKeyName ?? "?")[0]?.toUpperCase()}</span>
        <span className="sidebar-footer-text">
          <span className="sidebar-footer-title">{account?.userEmail ?? "Not connected"}</span>
          <span className="sidebar-footer-sub">{account ? account.apiKeyName : "Add API key"}</span>
        </span>
        <Icon name="settings" size={15} className="sidebar-footer-gear" />
      </button>
    </aside>
  );
}
