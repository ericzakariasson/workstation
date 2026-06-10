import { create } from "zustand";
import type {
  AccountInfo,
  GlassEvent,
  ModelInfo,
  Session,
  SessionConfig,
  Settings,
  TranscriptItem,
  VerifyResult,
} from "@shared/types";
import { glass } from "./api";
import { demoModels, demoSessions, demoTranscripts } from "./demo";

interface GlassState {
  ready: boolean;
  demo: boolean;
  settings: Settings;
  account: AccountInfo | null;
  models: ModelInfo[];
  sessions: Session[];
  activeSessionId: string | null;
  transcripts: Record<string, TranscriptItem[]>;
  showNewAgent: boolean;
  showSettings: boolean;
  toast: string | null;

  init: () => Promise<void>;
  selectSession: (id: string) => void;
  createSession: (config: SessionConfig) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  cancelActiveRun: () => Promise<void>;
  saveApiKey: (apiKey: string) => Promise<VerifyResult>;
  setShowNewAgent: (show: boolean) => void;
  setShowSettings: (show: boolean) => void;
  showToast: (message: string) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useGlass = create<GlassState>((set, get) => {
  function applyEvent(event: GlassEvent): void {
    if (event.type === "transcript") {
      set((state) => {
        const items = state.transcripts[event.sessionId] ?? [];
        const index = items.findIndex((item) => item.id === event.item.id);
        const next =
          index === -1
            ? [...items, event.item]
            : items.map((item, i) => (i === index ? event.item : item));
        return { transcripts: { ...state.transcripts, [event.sessionId]: next } };
      });
    } else if (event.type === "session") {
      set((state) => {
        const exists = state.sessions.some((session) => session.id === event.session.id);
        const sessions = exists
          ? state.sessions.map((session) =>
              session.id === event.session.id ? event.session : session,
            )
          : [event.session, ...state.sessions];
        return { sessions };
      });
    } else if (event.type === "session-removed") {
      set((state) => ({
        sessions: state.sessions.filter((session) => session.id !== event.sessionId),
        activeSessionId:
          state.activeSessionId === event.sessionId ? null : state.activeSessionId,
      }));
    }
  }

  async function loadTranscript(sessionId: string): Promise<void> {
    if (get().demo || get().transcripts[sessionId]) return;
    try {
      const items = await glass.getTranscript(sessionId);
      set((state) => ({
        transcripts: {
          ...state.transcripts,
          // Live events may have landed while we were fetching; keep them.
          [sessionId]: mergeById(items, state.transcripts[sessionId] ?? []),
        },
      }));
    } catch {
      // transcript stays empty
    }
  }

  return {
    ready: false,
    demo: glass.demo,
    settings: {},
    account: null,
    models: [],
    sessions: [],
    activeSessionId: null,
    transcripts: {},
    showNewAgent: false,
    showSettings: false,
    toast: null,

    init: async () => {
      if (glass.demo) {
        set({
          ready: true,
          settings: { apiKey: "demo" },
          account: { apiKeyName: "demo-key", userEmail: "you@example.com" },
          models: demoModels,
          sessions: demoSessions,
          transcripts: demoTranscripts,
          activeSessionId: demoSessions[0]?.id ?? null,
        });
        return;
      }

      glass.onEvent(applyEvent);
      const [settings, sessions] = await Promise.all([glass.getSettings(), glass.listSessions()]);
      set({ settings, sessions, ready: true, activeSessionId: sessions[0]?.id ?? null });
      if (sessions[0]) void loadTranscript(sessions[0].id);

      if (settings.apiKey) {
        void glass
          .verifyApiKey(settings.apiKey)
          .then((result) => result.ok && set({ account: result.account ?? null }));
        void glass
          .listModels()
          .then((models) => set({ models }))
          .catch(() => get().showToast("Could not load model catalog"));
      }
    },

    selectSession: (id) => {
      set({ activeSessionId: id });
      void loadTranscript(id);
    },

    createSession: async (config) => {
      if (get().demo) {
        get().showToast("Demo mode: connect an API key to create agents");
        return;
      }
      const session = await glass.createSession(config);
      set((state) => ({
        activeSessionId: session.id,
        transcripts: { ...state.transcripts, [session.id]: state.transcripts[session.id] ?? [] },
        showNewAgent: false,
      }));
    },

    removeSession: async (id) => {
      if (!get().demo) await glass.removeSession(id);
      set((state) => ({
        sessions: state.sessions.filter((session) => session.id !== id),
        activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
      }));
    },

    send: async (text) => {
      const { activeSessionId, demo, showToast } = get();
      if (!activeSessionId) return;
      if (demo) {
        showToast("Demo mode: connect an API key to talk to agents");
        return;
      }
      try {
        await glass.sendMessage(activeSessionId, text);
      } catch (error) {
        showToast(error instanceof Error ? error.message : String(error));
      }
    },

    cancelActiveRun: async () => {
      const { activeSessionId, demo } = get();
      if (!activeSessionId || demo) return;
      await glass.cancelRun(activeSessionId);
    },

    saveApiKey: async (apiKey) => {
      const result = await glass.verifyApiKey(apiKey);
      if (result.ok) {
        const settings = await glass.setSettings({ apiKey });
        set({ settings, account: result.account ?? null });
        void glass
          .listModels()
          .then((models) => set({ models }))
          .catch(() => {});
      }
      return result;
    },

    setShowNewAgent: (show) => set({ showNewAgent: show }),
    setShowSettings: (show) => set({ showSettings: show }),

    showToast: (message) => {
      if (toastTimer) clearTimeout(toastTimer);
      set({ toast: message });
      toastTimer = setTimeout(() => set({ toast: null }), 4200);
    },
  };
});

function mergeById(base: TranscriptItem[], updates: TranscriptItem[]): TranscriptItem[] {
  if (updates.length === 0) return base;
  const merged = [...base];
  for (const update of updates) {
    const index = merged.findIndex((item) => item.id === update.id);
    if (index === -1) merged.push(update);
    else merged[index] = update;
  }
  return merged;
}
