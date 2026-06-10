import type { Automation, ModelInfo, Session, TranscriptItem } from "@shared/types";

/**
 * Seed data for GLASS_DEMO=1 — lets the full UI render (and be screenshotted
 * headlessly) without a Cursor API key or live agents.
 */

const now = Date.now();
const min = 60_000;

export const demoModels: ModelInfo[] = [
  {
    id: "composer-2.5",
    displayName: "Composer 2.5",
    description: "Cursor's frontier agent model",
    parameters: [
      {
        id: "thinking",
        displayName: "Thinking",
        values: [
          { value: "low", displayName: "Low" },
          { value: "high", displayName: "High" },
        ],
      },
    ],
  },
  { id: "auto", displayName: "Auto", description: "Let Cursor pick" },
];

export const demoSessions: Session[] = [
  {
    id: "demo-1",
    agentId: "agent-demo-1",
    name: "Fix flaky auth tests",
    runtime: "local",
    model: { id: "composer-2.5", params: [{ id: "thinking", value: "high" }] },
    mode: "agent",
    cwd: "~/code/acme-api",
    status: "running",
    queue: [
      {
        id: "q1",
        text: "When the tests pass, also add a CI step that runs them with --runInBand.",
        ts: now - 2 * min,
      },
      {
        id: "q2",
        text: "Then update CONTRIBUTING.md with a note about fake timers.",
        ts: now - 1 * min,
      },
    ],
    createdAt: now - 42 * min,
    lastActivityAt: now - 0.2 * min,
  },
  {
    id: "demo-2",
    agentId: "bc-demo-2",
    name: "Dark mode for settings",
    runtime: "cloud",
    model: { id: "composer-2.5" },
    mode: "agent",
    repoUrl: "https://github.com/acme/web",
    autoCreatePR: true,
    status: "idle",
    branch: "cursor/dark-mode-settings",
    prUrl: "https://github.com/acme/web/pull/482",
    createdAt: now - 190 * min,
    lastActivityAt: now - 31 * min,
  },
  {
    id: "demo-3",
    agentId: "bc-demo-3",
    name: "Plan: billing migration",
    runtime: "cloud",
    model: { id: "composer-2.5" },
    mode: "plan",
    repoUrl: "https://github.com/acme/billing",
    status: "error",
    lastError: "Usage limit exceeded",
    createdAt: now - 400 * min,
    lastActivityAt: now - 220 * min,
  },
];

export const demoAutomations: Automation[] = [
  {
    id: "auto-1",
    name: "Morning CI triage",
    sessionId: "demo-1",
    prompt: "Check CI for failures on main and investigate any new ones.",
    schedule: { kind: "daily", hour: 9, minute: 0 },
    enabled: true,
    lastRunAt: now - 290 * min,
    nextRunAt: now + 600 * min,
  },
  {
    id: "auto-2",
    name: "Dependency audit",
    sessionId: "demo-2",
    prompt: "Run npm audit and summarize anything actionable.",
    schedule: { kind: "interval", minutes: 240 },
    enabled: false,
  },
];

export const demoTranscripts: Record<string, TranscriptItem[]> = {
  "demo-1": [
    {
      id: "t1",
      kind: "user",
      text: "The auth integration tests fail intermittently on CI. Find the race and fix it.",
      ts: now - 41 * min,
    },
    {
      id: "t2",
      kind: "thinking",
      text: "The failures cluster around token refresh. I should look at how the test harness seeds the clock and whether refresh timers leak between cases.",
      durationMs: 9_400,
      ts: now - 40 * min,
    },
    {
      id: "t3",
      kind: "tool",
      callId: "c1",
      name: "grep",
      status: "completed",
      args: '{\n  "pattern": "refreshToken",\n  "glob": "tests/**/*.ts"\n}',
      result: "tests/auth/refresh.test.ts:14\ntests/auth/session.test.ts:88\ntests/helpers/clock.ts:31",
      ts: now - 39 * min,
    },
    {
      id: "t4",
      kind: "tool",
      callId: "c2",
      name: "read",
      status: "completed",
      args: '{\n  "path": "tests/helpers/clock.ts"\n}',
      result: "export function freezeClock() {\n  jest.useFakeTimers();\n  // …\n}",
      ts: now - 38 * min,
    },
    {
      id: "t5",
      kind: "assistant",
      text: "Found it. `freezeClock()` installs fake timers but the `afterEach` in `refresh.test.ts` never restores them, so the refresh interval from one test fires during the next test's login flow.\n\nI'll:\n\n1. Restore real timers in a shared `afterEach`\n2. Make the refresh scheduler idempotent so duplicate timers can't stack",
      ts: now - 37 * min,
    },
    {
      id: "t6",
      kind: "tool",
      callId: "c3",
      name: "edit",
      status: "completed",
      args: '{\n  "path": "tests/helpers/clock.ts"\n}',
      result: "Applied 2 edits",
      ts: now - 35 * min,
    },
    {
      id: "t7",
      kind: "tool",
      callId: "c4",
      name: "shell",
      status: "running",
      args: '{\n  "command": "npm test -- tests/auth --runInBand"\n}',
      ts: now - 1 * min,
    },
  ],
  "demo-2": [
    {
      id: "u1",
      kind: "user",
      text: "Add a dark mode toggle to the settings screen. Respect the OS preference by default.",
      ts: now - 180 * min,
    },
    {
      id: "u2",
      kind: "status",
      text: "Provisioning cloud VM and cloning repo…",
      ts: now - 179 * min,
    },
    {
      id: "u3",
      kind: "assistant",
      text: "Done. I added a `ThemeProvider` backed by `prefers-color-scheme`, a tri-state toggle (System / Light / Dark) in **Settings → Appearance**, and persisted the choice to `localStorage`.",
      ts: now - 40 * min,
    },
    {
      id: "u4",
      kind: "result",
      text: "Run finished",
      durationMs: 8_340_000,
      branch: "cursor/dark-mode-settings",
      prUrl: "https://github.com/acme/web/pull/482",
      ts: now - 31 * min,
    },
  ],
  "demo-3": [
    {
      id: "p1",
      kind: "user",
      text: "Draft a migration plan from our homegrown billing to Stripe. Plan only, no changes.",
      ts: now - 260 * min,
    },
    {
      id: "p2",
      kind: "error",
      text: "Usage limit exceeded (RateLimitError)",
      ts: now - 220 * min,
    },
  ],
};
