import { useState } from "react";
import type { TranscriptItem } from "@shared/types";
import { glass } from "../api";
import { formatDuration, toolIcon, toolLabel, toolSubtitle } from "../util";
import { Icon } from "./Icon";
import { Markdown } from "./Markdown";

function ToolItem({ item }: { item: Extract<TranscriptItem, { kind: "tool" }> }) {
  const [open, setOpen] = useState(false);
  const subtitle = toolSubtitle(item.args);

  return (
    <div className={`tool-card tool-${item.status}`}>
      <button type="button" className="tool-head" onClick={() => setOpen((value) => !value)}>
        <Icon name="chevron" size={12} className={`tool-chevron${open ? " open" : ""}`} />
        <span className="tool-icon">
          <Icon name={toolIcon(item.name)} size={13} />
        </span>
        <span className="tool-name">{toolLabel(item.name)}</span>
        {subtitle && <span className="tool-subtitle">{subtitle}</span>}
        <span className="tool-status">
          {item.status === "running" && <span className="spinner" />}
          {item.status === "completed" && <Icon name="check" size={13} />}
          {item.status === "error" && <Icon name="x" size={13} />}
        </span>
      </button>
      {open && (
        <div className="tool-detail">
          {item.args && (
            <div className="tool-detail-block">
              <div className="tool-detail-label">Arguments</div>
              <pre>{item.args}</pre>
            </div>
          )}
          {item.result && (
            <div className="tool-detail-block">
              <div className="tool-detail-label">Result</div>
              <pre>{item.result}</pre>
            </div>
          )}
          {!item.args && !item.result && <div className="tool-detail-label">No payload</div>}
        </div>
      )}
    </div>
  );
}

function ThinkingItem({ item }: { item: Extract<TranscriptItem, { kind: "thinking" }> }) {
  const [open, setOpen] = useState(false);
  const duration = formatDuration(item.durationMs);

  return (
    <div className="thinking-block">
      <button type="button" className="thinking-head" onClick={() => setOpen((value) => !value)}>
        <Icon name="chevron" size={12} className={`tool-chevron${open ? " open" : ""}`} />
        <Icon name="brain" size={13} />
        <span>{duration ? `Thought for ${duration}` : "Thinking"}</span>
      </button>
      {open && <div className="thinking-body">{item.text}</div>}
    </div>
  );
}

function ResultItem({ item }: { item: Extract<TranscriptItem, { kind: "result" }> }) {
  const duration = formatDuration(item.durationMs);
  return (
    <div className="result-card">
      <span className="result-check">
        <Icon name="check" size={13} />
      </span>
      <span>{item.text}</span>
      {duration && <span className="result-meta">in {duration}</span>}
      {item.branch && (
        <span className="result-meta result-branch">
          <Icon name="branch" size={12} />
          {item.branch}
        </span>
      )}
      {item.prUrl && (
        <button
          type="button"
          className="result-pr"
          onClick={() => void glass.openExternal(item.prUrl!)}
        >
          <Icon name="link" size={12} />
          View PR
        </button>
      )}
    </div>
  );
}

export function TranscriptItemView({ item }: { item: TranscriptItem }) {
  switch (item.kind) {
    case "user":
      return (
        <div className="msg msg-user">
          <div className="msg-user-bubble">
            {item.attachments ? (
              <span className="msg-attachment">
                <Icon name="camera" size={11} /> screenshot
              </span>
            ) : null}
            {item.text}
          </div>
        </div>
      );
    case "assistant":
      return (
        <div className="msg msg-assistant">
          <Markdown text={item.text} />
        </div>
      );
    case "thinking":
      return <ThinkingItem item={item} />;
    case "tool":
      return <ToolItem item={item} />;
    case "status":
      return <div className="status-line">{item.text}</div>;
    case "error":
      return (
        <div className="error-line">
          <Icon name="alert" size={14} />
          <span>{item.text}</span>
        </div>
      );
    case "result":
      return <ResultItem item={item} />;
  }
}
