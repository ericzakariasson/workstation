import { useEffect, useRef, useState } from "react";
import type { Session } from "@shared/types";
import { glass } from "../api";
import { useGlass } from "../store";
import { Icon } from "./Icon";

type VoiceState = "idle" | "recording" | "transcribing";

export function Composer({ session }: { session: Session }) {
  const send = useGlass((state) => state.send);
  const cancelActiveRun = useGlass((state) => state.cancelActiveRun);
  const removeQueuedMessage = useGlass((state) => state.removeQueuedMessage);
  const pendingAttachment = useGlass((state) => state.pendingAttachment);
  const setPendingAttachment = useGlass((state) => state.setPendingAttachment);
  const settings = useGlass((state) => state.settings);
  const showToast = useGlass((state) => state.showToast);
  const setShowSettings = useGlass((state) => state.setShowSettings);
  const [text, setText] = useState("");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
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

  useEffect(() => {
    return () => {
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Sending while busy queues the message; main dispatches FIFO as runs end.
  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (isBusy && pendingAttachment) {
      showToast("Screenshots can't be queued — wait for the current run to finish");
      return;
    }
    setText("");
    void send(trimmed);
  };

  const startRecording = async () => {
    if (!settings.voice?.apiKey && !glass.demo) {
      showToast("Configure voice transcription in Settings → Voice first");
      setShowSettings(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 1000) {
          setVoiceState("idle");
          return;
        }
        setVoiceState("transcribing");
        try {
          const transcript = await glass.transcribe(await blob.arrayBuffer(), blob.type);
          if (transcript) {
            setText((current) => (current ? `${current.trimEnd()} ${transcript}` : transcript));
            textareaRef.current?.focus();
          }
        } catch (error) {
          showToast(error instanceof Error ? error.message : String(error));
        }
        setVoiceState("idle");
      };
      recorderRef.current = recorder;
      recorder.start();
      setVoiceState("recording");
    } catch {
      showToast("Microphone unavailable or permission denied");
      setVoiceState("idle");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  const queue = session.queue ?? [];

  return (
    <div className="composer">
      {queue.length > 0 && (
        <div className="queue-list">
          <span className="queue-label">
            <Icon name="clock" size={11} /> Queued · {queue.length}
          </span>
          {queue.map((message) => (
            <div key={message.id} className="queue-row" title={message.text}>
              <span className="queue-row-text">{message.text}</span>
              <button
                type="button"
                className="queue-row-remove"
                title="Remove from queue"
                onClick={() => void removeQueuedMessage(session.id, message.id)}
              >
                <Icon name="x" size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className={`composer-box${voiceState === "recording" ? " composer-recording" : ""}`}>
        {pendingAttachment && (
          <div className="attachment-chip">
            <img
              src={`data:${pendingAttachment.mimeType};base64,${pendingAttachment.data}`}
              alt="Screenshot attachment"
            />
            <span>Browser screenshot</span>
            <button
              type="button"
              title="Remove attachment"
              onClick={() => setPendingAttachment(null)}
            >
              <Icon name="x" size={11} />
            </button>
          </div>
        )}
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          placeholder={
            voiceState === "recording"
              ? "Listening… click the mic to stop"
              : isBusy
                ? "Queue a message — it sends when the agent is free…"
                : `Message ${session.name}…`
          }
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
          <button
            type="button"
            className={`btn-icon btn-mic${voiceState === "recording" ? " btn-mic-recording" : ""}`}
            title={
              voiceState === "recording"
                ? "Stop recording"
                : voiceState === "transcribing"
                  ? "Transcribing…"
                  : "Dictate (voice to text)"
            }
            disabled={voiceState === "transcribing"}
            onClick={() => (voiceState === "recording" ? stopRecording() : void startRecording())}
          >
            {voiceState === "transcribing" ? <span className="spinner" /> : <Icon name="mic" size={14} />}
          </button>
          <button
            type="button"
            className={`btn-icon ${isBusy ? "btn-queue" : "btn-send"}`}
            title={isBusy ? "Queue message (Enter)" : "Send (Enter)"}
            disabled={!text.trim()}
            onClick={submit}
          >
            <Icon name={isBusy ? "clock" : "send"} size={14} />
          </button>
          {isBusy && (
            <button
              type="button"
              className="btn-icon btn-stop"
              title="Cancel run"
              onClick={() => void cancelActiveRun()}
            >
              <Icon name="stop" size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="composer-hint">
        {isBusy ? "Enter to queue" : "Enter to send"} · Shift+Enter for a new line
      </div>
    </div>
  );
}
