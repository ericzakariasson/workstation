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

  return (
    <button
      type="button"
      className={`session-row${active ? " session-row-active" : ""}`}
      onClick={() => selectSession(session.id)}
    >
      <span className={statusClass(session)} />
      <span className="session-row-body">
        <span className="session-row-name">{session.name}</span>
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
  const setShowNewAgent = useGlass((state) => state.setShowNewAgent);
  const setShowSettings = useGlass((state) => state.setShowSettings);

  const running = sessions.filter(
    (session) => session.status === "running" || session.status === "creating",
  ).length;

  return (
    <aside className={`sidebar${glass.platform === "darwin" ? " sidebar-mac" : ""}`}>
      <div className="sidebar-brand drag">
        <span className="brand-mark">
          <Icon name="spark" size={16} />
        </span>
        <span className="brand-name">Glass</span>
        {demo && <span className="chip chip-demo no-drag">demo</span>}
      </div>

      <button type="button" className="btn btn-accent new-agent no-drag" onClick={() => setShowNewAgent(true)}>
        <Icon name="plus" size={15} />
        New agent
      </button>

      <div className="sidebar-section">
        <span>Agents</span>
        {running > 0 && <span className="sidebar-running">{running} running</span>}
      </div>

      <div className="session-list">
        {sessions.length === 0 && (
          <div className="session-list-empty">
            No agents yet.
            <br />
            Spin one up to get started.
          </div>
        )}
        {sessions.map((session) => (
          <SessionRow key={session.id} session={session} active={session.id === activeSessionId} />
        ))}
      </div>

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
