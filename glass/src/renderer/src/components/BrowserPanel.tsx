import { useEffect, useRef, useState } from "react";
import { glass } from "../api";
import { useGlass } from "../store";
import { Icon } from "./Icon";
import type { WebviewElement } from "../webview";

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\d+\.\d+\.\d+\.\d+)(:\d+)?([/?#].*)?$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

const QUICK_LINKS = ["localhost:3000", "localhost:5173", "localhost:8080"];

export function BrowserPanel() {
  const setBrowserUrl = useGlass((state) => state.setBrowserUrl);
  const setBrowserOpen = useGlass((state) => state.setBrowserOpen);
  const setPendingAttachment = useGlass((state) => state.setPendingAttachment);
  const showToast = useGlass((state) => state.showToast);

  // The webview's src is set exactly once; all later navigation goes through
  // loadURL so React prop updates can't trigger duplicate loads.
  const [src, setSrc] = useState(() => useGlass.getState().browserUrl);
  const webviewRef = useRef<WebviewElement | null>(null);
  const [address, setAddress] = useState(src);
  const [loading, setLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const hasView = src !== "";

  useEffect(() => {
    const view = webviewRef.current;
    if (!view) return;

    const syncNav = () => {
      try {
        const url = view.getURL();
        setAddress(url);
        setCanGoBack(view.canGoBack());
        setCanGoForward(view.canGoForward());
        setBrowserUrl(url);
      } catch {
        // not attached yet
      }
    };
    const onStart = () => setLoading(true);
    const onStop = () => {
      setLoading(false);
      syncNav();
    };
    const onFail = (event: Event) => {
      const { errorCode, errorDescription } = event as Event & {
        errorCode: number;
        errorDescription: string;
      };
      // -3 is an aborted load (e.g. user navigated away); not an error.
      if (errorCode !== -3) {
        setLoading(false);
        showToast(`Page failed to load: ${errorDescription || errorCode}`);
      }
    };

    view.addEventListener("did-start-loading", onStart);
    view.addEventListener("did-stop-loading", onStop);
    view.addEventListener("did-navigate", syncNav);
    view.addEventListener("did-navigate-in-page", syncNav);
    view.addEventListener("did-fail-load", onFail);
    return () => {
      view.removeEventListener("did-start-loading", onStart);
      view.removeEventListener("did-stop-loading", onStop);
      view.removeEventListener("did-navigate", syncNav);
      view.removeEventListener("did-navigate-in-page", syncNav);
      view.removeEventListener("did-fail-load", onFail);
    };
  }, [hasView, setBrowserUrl, showToast]);

  const navigate = (input: string) => {
    const url = normalizeUrl(input);
    if (!url) return;
    setAddress(url);
    setBrowserUrl(url);
    if (hasView) {
      void webviewRef.current?.loadURL(url).catch(() => {});
    } else {
      setSrc(url);
    }
  };

  const call = (method: "reload" | "stop" | "goBack" | "goForward") => {
    try {
      webviewRef.current?.[method]();
    } catch {
      // not attached yet
    }
  };

  const capture = async () => {
    const view = webviewRef.current;
    if (!view) return;
    setCapturing(true);
    try {
      const attachment = await glass.captureBrowser(view.getWebContentsId());
      setPendingAttachment(attachment);
      showToast("Screenshot attached — add a note and send it to the agent");
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
    setCapturing(false);
  };

  return (
    <section className="browser-panel">
      <div className="browser-toolbar">
        <button
          type="button"
          className="btn-icon btn-icon-small"
          title="Back"
          disabled={!canGoBack}
          onClick={() => call("goBack")}
        >
          <Icon name="arrow-left" size={13} />
        </button>
        <button
          type="button"
          className="btn-icon btn-icon-small"
          title="Forward"
          disabled={!canGoForward}
          onClick={() => call("goForward")}
        >
          <Icon name="arrow-right" size={13} />
        </button>
        <button
          type="button"
          className="btn-icon btn-icon-small"
          title={loading ? "Stop" : "Reload"}
          disabled={!hasView}
          onClick={() => call(loading ? "stop" : "reload")}
        >
          <Icon name={loading ? "x" : "refresh"} size={13} />
        </button>

        <div className="browser-address">
          {loading && <span className="spinner" />}
          <input
            type="text"
            value={address}
            placeholder="Enter URL — localhost:3000, example.com…"
            spellCheck={false}
            onChange={(event) => setAddress(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") navigate(address);
            }}
            onFocus={(event) => event.target.select()}
          />
        </div>

        <button
          type="button"
          className="btn-icon btn-icon-small"
          title="Send screenshot to agent"
          disabled={!hasView || capturing}
          onClick={() => void capture()}
        >
          {capturing ? <span className="spinner" /> : <Icon name="camera" size={13} />}
        </button>
        <button
          type="button"
          className="btn-icon btn-icon-small"
          title="Open in system browser"
          disabled={!hasView}
          onClick={() => address && void glass.openExternal(address)}
        >
          <Icon name="external" size={13} />
        </button>
        <button
          type="button"
          className="btn-icon btn-icon-small"
          title="Close browser"
          onClick={() => setBrowserOpen(false)}
        >
          <Icon name="x" size={13} />
        </button>
      </div>

      {hasView ? (
        <webview
          ref={(element: HTMLElement | null) => {
            webviewRef.current = element as WebviewElement | null;
          }}
          className="browser-view"
          src={src}
          partition="persist:glass-browser"
        />
      ) : (
        <div className="browser-start">
          <div className="browser-start-icon">
            <Icon name="globe" size={24} />
          </div>
          <h3>Built-in browser</h3>
          <p>Preview what your agents are building without leaving Glass.</p>
          <div className="browser-start-links">
            {QUICK_LINKS.map((link) => (
              <button key={link} type="button" className="btn btn-small" onClick={() => navigate(link)}>
                {link}
              </button>
            ))}
          </div>
          <p className="browser-start-hint">
            Use the camera to send a screenshot of the page to your agent.
          </p>
        </div>
      )}
    </section>
  );
}
