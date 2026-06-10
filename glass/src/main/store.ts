import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Session, Settings, TranscriptItem } from "@shared/types";

/**
 * Flat-file persistence for Glass: settings, the session index, and one
 * transcript file per session. Writes are debounced per file.
 */
export class GlassStore {
  private readonly dir: string;
  private readonly transcriptsDir: string;

  private settings: Settings = {};
  private sessions = new Map<string, Session>();
  private transcripts = new Map<string, TranscriptItem[]>();
  private pendingWrites = new Map<string, NodeJS.Timeout>();

  constructor(userDataDir: string) {
    this.dir = userDataDir;
    this.transcriptsDir = join(this.dir, "transcripts");
    mkdirSync(this.transcriptsDir, { recursive: true });
    this.settings = this.readJson<Settings>(this.settingsPath()) ?? {};
    const sessions = this.readJson<Session[]>(this.sessionsPath()) ?? [];
    for (const session of sessions) {
      // A run can't survive an app restart; normalize stale statuses.
      if (session.status === "running" || session.status === "creating") {
        session.status = "idle";
      }
      this.sessions.set(session.id, session);
    }
  }

  // -- settings -------------------------------------------------------------

  getSettings(): Settings {
    return { ...this.settings };
  }

  patchSettings(patch: Partial<Settings>): Settings {
    this.settings = { ...this.settings, ...patch };
    this.scheduleWrite(this.settingsPath(), () => this.settings);
    return this.getSettings();
  }

  // -- sessions ---------------------------------------------------------------

  listSessions(): Session[] {
    return [...this.sessions.values()].sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  upsertSession(session: Session): void {
    this.sessions.set(session.id, session);
    this.scheduleWrite(this.sessionsPath(), () => this.listSessions());
  }

  removeSession(id: string): void {
    this.sessions.delete(id);
    this.transcripts.delete(id);
    this.scheduleWrite(this.sessionsPath(), () => this.listSessions());
    try {
      rmSync(this.transcriptPath(id), { force: true });
    } catch {
      // best effort
    }
  }

  // -- transcripts ------------------------------------------------------------

  getTranscript(sessionId: string): TranscriptItem[] {
    let items = this.transcripts.get(sessionId);
    if (!items) {
      items = this.readJson<TranscriptItem[]>(this.transcriptPath(sessionId)) ?? [];
      this.transcripts.set(sessionId, items);
    }
    return items;
  }

  /** Insert the item, or merge it into an existing item with the same id. */
  upsertTranscriptItem(sessionId: string, item: TranscriptItem): TranscriptItem {
    const items = this.getTranscript(sessionId);
    const index = items.findIndex((existing) => existing.id === item.id);
    let merged = item;
    if (index === -1) {
      items.push(item);
    } else {
      merged = { ...items[index], ...stripUndefined(item) } as TranscriptItem;
      items[index] = merged;
    }
    this.scheduleWrite(this.transcriptPath(sessionId), () => items);
    return merged;
  }

  // -- IO ---------------------------------------------------------------------

  flush(): void {
    for (const [, timer] of this.pendingWrites) clearTimeout(timer);
    this.pendingWrites.clear();
    this.writeJson(this.settingsPath(), this.settings);
    this.writeJson(this.sessionsPath(), this.listSessions());
    for (const [sessionId, items] of this.transcripts) {
      this.writeJson(this.transcriptPath(sessionId), items);
    }
  }

  private settingsPath(): string {
    return join(this.dir, "settings.json");
  }

  private sessionsPath(): string {
    return join(this.dir, "sessions.json");
  }

  private transcriptPath(sessionId: string): string {
    return join(this.transcriptsDir, `${sessionId}.json`);
  }

  private scheduleWrite(path: string, data: () => unknown): void {
    const existing = this.pendingWrites.get(path);
    if (existing) clearTimeout(existing);
    this.pendingWrites.set(
      path,
      setTimeout(() => {
        this.pendingWrites.delete(path);
        this.writeJson(path, data());
      }, 400),
    );
  }

  private readJson<T>(path: string): T | undefined {
    try {
      if (!existsSync(path)) return undefined;
      return JSON.parse(readFileSync(path, "utf8")) as T;
    } catch {
      return undefined;
    }
  }

  private writeJson(path: string, data: unknown): void {
    try {
      writeFileSync(path, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
    } catch (error) {
      console.error(`[glass] failed to write ${path}`, error);
    }
  }
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val !== undefined) out[key] = val;
  }
  return out as Partial<T>;
}
