import { useEffect } from "react";
import type { Session } from "@shared/types";
import { AutomationsModal } from "./components/AutomationsModal";
import { Composer } from "./components/Composer";
import { Conversation } from "./components/Conversation";
import { Icon } from "./components/Icon";
import { NewAgentModal } from "./components/NewAgentModal";
import { Onboarding } from "./components/Onboarding";
import { SettingsModal } from "./components/SettingsModal";
import { Sidebar } from "./components/Sidebar";
import { useGlass } from "./store";

function statusLabel(session: Session): string {
  switch (session.status) {
    case "creating":
      return "Creating";
    case "running":
      return "Running";
    case "error":
      return "Error";
    default:
      return "Idle";
  }
}

function MainPane() {
  const sessions = useGlass((state) => state.sessions);
  const activeSessionId = useGlass((state) => state.activeSessionId);
  const transcripts = useGlass((state) => state.transcripts);
  const setShowNewAgent = useGlass((state) => state.setShowNewAgent);

  const session = sessions.find((candidate) => candidate.id === activeSessionId);

  if (!session) {
    return (
      <main className="main">
        <header className="topbar drag" />
        <div className="hero">
          <div className="hero-mark">
            <Icon name="spark" size={30} />
          </div>
          <h1>Agent orchestration for Cursor</h1>
          <p>
            Spin up parallel agents — local against your working tree, or cloud in isolated VMs —
            and watch them work in real time.
          </p>
          <button type="button" className="btn btn-accent" onClick={() => setShowNewAgent(true)}>
            <Icon name="plus" size={15} />
            New agent
          </button>
        </div>
      </main>
    );
  }

  const workspace =
    session.runtime === "local"
      ? session.cwd
      : session.repoUrl?.replace(/^https?:\/\/(www\.)?github\.com\//, "") ?? "cloud workspace";

  return (
    <main className="main">
      <header className="topbar drag">
        <div className="topbar-info no-drag">
          <span className={`dot dot-${session.status === "error" ? "error" : session.status === "idle" ? "idle" : "running"}`} />
          <span className="topbar-name">{session.name}</span>
          <span className={`chip chip-${session.runtime}`}>
            <Icon name={session.runtime === "cloud" ? "cloud" : "folder"} size={11} />
            {session.runtime}
          </span>
          {workspace && <span className="topbar-workspace">{workspace}</span>}
        </div>
        <div className="topbar-right no-drag">
          {session.branch && (
            <span className="chip chip-branch">
              <Icon name="branch" size={11} />
              {session.branch}
            </span>
          )}
          <span className={`topbar-status status-${session.status}`}>{statusLabel(session)}</span>
        </div>
      </header>
      <Conversation session={session} items={transcripts[session.id] ?? []} />
      <Composer session={session} />
    </main>
  );
}

export default function App() {
  const ready = useGlass((state) => state.ready);
  const demo = useGlass((state) => state.demo);
  const settings = useGlass((state) => state.settings);
  const showNewAgent = useGlass((state) => state.showNewAgent);
  const showSettings = useGlass((state) => state.showSettings);
  const showAutomations = useGlass((state) => state.showAutomations);
  const toast = useGlass((state) => state.toast);
  const init = useGlass((state) => state.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (!ready) {
    return <div className="boot" />;
  }

  if (!demo && !settings.apiKey) {
    return (
      <>
        <div className="bg-field" aria-hidden="true">
          <div className="bg-blob bg-blob-a" />
          <div className="bg-blob bg-blob-b" />
        </div>
        <Onboarding />
      </>
    );
  }

  return (
    <>
      <div className="bg-field" aria-hidden="true">
        <div className="bg-blob bg-blob-a" />
        <div className="bg-blob bg-blob-b" />
      </div>
      <div className="app">
        <Sidebar />
        <MainPane />
      </div>
      {showNewAgent && <NewAgentModal />}
      {showSettings && <SettingsModal />}
      {showAutomations && <AutomationsModal />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
