import { create } from "zustand";
import type {
  AccountInfo,
  Automation,
  GlassEvent,
  ImageAttachment,
  ModelInfo,
  Session,
  SessionConfig,
  Settings,
  TranscriptItem,
  VerifyResult,
} from "@shared/types";
import { glass } from "./api";
import { demoAutomations, demoModels, demoSessions, demoTranscripts } from "./demo";

interface GlassState {
  ready: boolean;
  demo: boolean;
  settings: Settings;
  account: AccountInfo | null;
  models: ModelInfo[];
  sessions: Session[];
  automations: Automation[];
  activeSessionId: string | null;
  transcripts: Record<string, TranscriptItem[]>;
  sidebarCollapsed: boolean;
  showNewAgent: boolean;
  showSettings: boolean;
  showAutomations: boolean;
  browserOpen: boolean;
  browserUrl: string;
  browserWidth: number;
  pendingAttachment: ImageAttachment | null;
  toast: string | null;

  init: () => Promise<void>;
  selectSession: (id: string) => void;
  createSession: (config: SessionConfig) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  renameSession: (id: string, name: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  cancelActiveRun: () => Promise<void>;
  removeQueuedMessage: (sessionId: string, messageId: string) => Promise<void>;
  saveApiKey: (apiKey: string) => Promise<VerifyResult>;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
  saveAutomation: (automation: Automation) => Promise<void>;
  removeAutomation: (id: string) => Promise<void>;
  runAutomationNow: (id: string) => Promise<void>;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setShowNewAgent: (show: boolean) => void;
  setShowSettings: (show: boolean) => void;
  setShowAutomations: (show: boolean) => void;
  setBrowserOpen: (open: boolean) => void;
  setBrowserUrl: (url: string) => void;
  setBrowserWidth: (width: number) => void;
  setPendingAttachment: (attachment: ImageAttachment | null) => void;
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
    } else if (event.type === "automations") {
      set({ automations: event.automations });
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
    automations: [],
    activeSessionId: null,
    transcripts: {},
    sidebarCollapsed: false,
    showNewAgent: false,
    showSettings: false,
    showAutomations: false,
    browserOpen: glass.smokeView === "browser",
    browserUrl: glass.smokeUrl ?? "",
    browserWidth: 460,
    pendingAttachment: null,
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
          automations: demoAutomations,
          activeSessionId: demoSessions[0]?.id ?? null,
          showSettings: glass.smokeView === "settings",
          showAutomations: glass.smokeView === "automations",
        });
        return;
      }

      glass.onEvent(applyEvent);
      const [settings, sessions, automations] = await Promise.all([
        glass.getSettings(),
        glass.listSessions(),
        glass.listAutomations(),
      ]);
      set({ settings, sessions, automations, ready: true, activeSessionId: sessions[0]?.id ?? null });
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

    renameSession: async (id, name) => {
      if (!name.trim()) return;
      set((state) => ({
        sessions: state.sessions.map((session) =>
          session.id === id ? { ...session, name: name.trim() } : session,
        ),
      }));
      if (!get().demo) await glass.renameSession(id, name);
    },

    send: async (text) => {
      const { activeSessionId, demo, showToast, pendingAttachment } = get();
      if (!activeSessionId) return;
      if (demo) {
        showToast("Demo mode: connect an API key to talk to agents");
        return;
      }
      const images = pendingAttachment ? [pendingAttachment] : undefined;
      set({ pendingAttachment: null });
      try {
        await glass.sendMessage(activeSessionId, text, images);
      } catch (error) {
        showToast(error instanceof Error ? error.message : String(error));
      }
    },

    cancelActiveRun: async () => {
      const { activeSessionId, demo } = get();
      if (!activeSessionId || demo) return;
      await glass.cancelRun(activeSessionId);
    },

    removeQueuedMessage: async (sessionId, messageId) => {
      set((state) => ({
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? { ...session, queue: (session.queue ?? []).filter((m) => m.id !== messageId) }
            : session,
        ),
      }));
      if (!get().demo) await glass.removeQueuedMessage(sessionId, messageId);
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

    saveSettings: async (patch) => {
      if (get().demo) {
        set((state) => ({ settings: { ...state.settings, ...patch } }));
        return;
      }
      const settings = await glass.setSettings(patch);
      set({ settings });
    },

    saveAutomation: async (automation) => {
      if (get().demo) {
        set((state) => {
          const exists = state.automations.some((item) => item.id === automation.id);
          return {
            automations: exists
              ? state.automations.map((item) => (item.id === automation.id ? automation : item))
              : [...state.automations, automation],
          };
        });
        return;
      }
      const automations = await glass.saveAutomation(automation);
      set({ automations });
    },

    removeAutomation: async (id) => {
      if (get().demo) {
        set((state) => ({ automations: state.automations.filter((item) => item.id !== id) }));
        return;
      }
      const automations = await glass.removeAutomation(id);
      set({ automations });
    },

    runAutomationNow: async (id) => {
      if (get().demo) {
        get().showToast("Demo mode: connect an API key to run automations");
        return;
      }
      try {
        await glass.runAutomationNow(id);
        get().showToast("Automation dispatched");
      } catch (error) {
        get().showToast(error instanceof Error ? error.message : String(error));
      }
    },

    setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    setShowNewAgent: (show) => set({ showNewAgent: show }),
    setShowSettings: (show) => set({ showSettings: show }),
    setShowAutomations: (show) => set({ showAutomations: show }),
    setBrowserOpen: (open) => set({ browserOpen: open }),
    setBrowserUrl: (url) => set({ browserUrl: url }),
    setBrowserWidth: (width) => set({ browserWidth: width }),
    setPendingAttachment: (attachment) => set({ pendingAttachment: attachment }),

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
