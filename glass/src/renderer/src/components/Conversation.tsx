import { useEffect, useRef, useState } from "react";
import type { Session, SkillInfo, TranscriptItem } from "@shared/types";
import { glass } from "../api";
import { Icon } from "./Icon";
import { TranscriptItemView } from "./Transcript";

function workspaceLabel(session: Session): string | null {
  if (session.runtime === "local") return session.cwd ?? null;
  if (session.repoUrl) return session.repoUrl.replace(/^https?:\/\/(www\.)?github\.com\//, "");
  return "cloud workspace";
}

function SkillsHint({ session }: { session: Session }) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    glass
      .listSkills(session.runtime === "local" ? session.cwd : undefined)
      .then((found) => !cancelled && setSkills(found))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session.id, session.cwd, session.runtime]);

  if (skills.length === 0) return null;
  return (
    <div className="skills-hint">
      <span className="skills-hint-label">
        <Icon name="spark" size={11} /> Skills
      </span>
      {skills.slice(0, 6).map((skill) => (
        <span key={skill.name} className="chip chip-skill" title={skill.description}>
          {skill.name}
        </span>
      ))}
      {skills.length > 6 && <span className="chip">+{skills.length - 6}</span>}
    </div>
  );
}

export function Conversation({ session, items }: { session: Session; items: TranscriptItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const isBusy = session.status === "running" || session.status === "creating";

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [items, session.id]);

  useEffect(() => {
    stickToBottom.current = true;
  }, [session.id]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  };

  return (
    <div className="conversation" ref={scrollRef} onScroll={handleScroll}>
      <div className="conversation-inner">
        {items.length === 0 && (
          <div className="conversation-empty">
            <div className="conversation-empty-icon">
              <Icon name={session.runtime === "cloud" ? "cloud" : "folder"} size={22} />
            </div>
            <h3>{session.name}</h3>
            <p>
              {session.runtime === "cloud"
                ? "This agent runs in an isolated Cursor-hosted VM."
                : "This agent works directly against your local files."}
              {workspaceLabel(session) && <code> {workspaceLabel(session)}</code>}
            </p>
            <SkillsHint session={session} />
            <p className="conversation-empty-hint">Send a task below to put it to work.</p>
          </div>
        )}
        {items.map((item) => (
          <TranscriptItemView key={item.id} item={item} />
        ))}
        {isBusy && (
          <div className="working-line">
            <span className="spinner" />
            {session.status === "creating" ? "Creating agent…" : "Working…"}
          </div>
        )}
      </div>
    </div>
  );
}
