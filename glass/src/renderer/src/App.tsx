import { useEffect } from "react";
import type { Session } from "@shared/types";
import { AutomationsModal } from "./components/AutomationsModal";
import { BrowserPanel } from "./components/BrowserPanel";
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

function startBrowserResize(event: React.MouseEvent): void {
  event.preventDefault();
  document.body.classList.add("resizing");
  const onMove = (move: MouseEvent) => {
    const max = Math.floor(window.innerWidth * 0.65);
    const width = Math.min(max, Math.max(320, window.innerWidth - move.clientX));
    useGlass.getState().setBrowserWidth(width);
  };
  const onUp = () => {
    document.body.classList.remove("resizing");
    window.removeEventListener("mousemove", onMove);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp, { once: true });
}

function MainPane() {
  const sessions = useGlass((state) => state.sessions);
  const activeSessionId = useGlass((state) => state.activeSessionId);
  const transcripts = useGlass((state) => state.transcripts);
  const setShowNewAgent = useGlass((state) => state.setShowNewAgent);
  const browserOpen = useGlass((state) => state.browserOpen);
  const browserWidth = useGlass((state) => state.browserWidth);
  const setBrowserOpen = useGlass((state) => state.setBrowserOpen);

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
          <button
            type="button"
            className={`btn-icon btn-icon-small${browserOpen ? " btn-icon-active" : ""}`}
            title={browserOpen ? "Close built-in browser" : "Open built-in browser"}
            onClick={() => setBrowserOpen(!browserOpen)}
          >
            <Icon name="globe" size={14} />
          </button>
        </div>
      </header>
      <div className="main-body">
        <section className="main-chat">
          <Conversation session={session} items={transcripts[session.id] ?? []} />
          <Composer session={session} />
        </section>
        {browserOpen && (
          <>
            <div className="splitter" onMouseDown={startBrowserResize} />
            <div className="browser-host" style={{ width: browserWidth }}>
              <BrowserPanel />
            </div>
          </>
        )}
      </div>
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
