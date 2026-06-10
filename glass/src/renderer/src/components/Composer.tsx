import { useEffect, useRef, useState } from "react";
import type { Session } from "@shared/types";
import { useGlass } from "../store";
import { Icon } from "./Icon";

export function Composer({ session }: { session: Session }) {
  const send = useGlass((state) => state.send);
  const cancelActiveRun = useGlass((state) => state.cancelActiveRun);
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isBusy = session.status === "running" || session.status === "creating";

  useEffect(() => {
    textareaRef.current?.focus();
  }, [session.id]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    setText("");
    void send(trimmed);
  };

  return (
    <div className="composer">
      <div className="composer-box">
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          placeholder={isBusy ? "Agent is working…" : `Message ${session.name}…`}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer-actions">
          <span className="composer-model">{session.model.id}</span>
          {isBusy ? (
            <button
              type="button"
              className="btn-icon btn-stop"
              title="Cancel run"
              onClick={() => void cancelActiveRun()}
            >
              <Icon name="stop" size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="btn-icon btn-send"
              title="Send (Enter)"
              disabled={!text.trim()}
              onClick={submit}
            >
              <Icon name="send" size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="composer-hint">Enter to send · Shift+Enter for a new line</div>
    </div>
  );
}
