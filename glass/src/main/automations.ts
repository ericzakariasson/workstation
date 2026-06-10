import type { Automation, AutomationSchedule, GlassEvent } from "@shared/types";
import type { AgentManager } from "./agent-manager";
import type { GlassStore } from "./store";

const TICK_MS = 30_000;
const BUSY_RETRY_MS = 5 * 60_000;

export function computeNextRun(schedule: AutomationSchedule, from: number): number {
  if (schedule.kind === "interval") {
    const minutes = Math.max(1, schedule.minutes);
    return from + minutes * 60_000;
  }
  const next = new Date(from);
  next.setHours(schedule.hour, schedule.minute, 0, 0);
  if (next.getTime() <= from) next.setDate(next.getDate() + 1);
  return next.getTime();
}

/**
 * Local automation scheduler: recurring prompts dispatched to existing
 * sessions while Glass is running.
 */
export class AutomationScheduler {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly store: GlassStore,
    private readonly agents: AgentManager,
    private readonly broadcast: (event: GlassEvent) => void,
  ) {}

  start(): void {
    // Re-anchor schedules that went stale while the app was closed.
    const now = Date.now();
    let changed = false;
    for (const automation of this.store.listAutomations()) {
      if (automation.enabled && (!automation.nextRunAt || automation.nextRunAt < now)) {
        automation.nextRunAt = computeNextRun(automation.schedule, now);
        this.store.saveAutomation(automation);
        changed = true;
      }
    }
    if (changed) this.emit();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  save(automation: Automation): Automation[] {
    automation.nextRunAt = automation.enabled
      ? computeNextRun(automation.schedule, Date.now())
      : undefined;
    this.store.saveAutomation(automation);
    this.emit();
    return this.store.listAutomations();
  }

  remove(id: string): Automation[] {
    this.store.removeAutomation(id);
    this.emit();
    return this.store.listAutomations();
  }

  async runNow(id: string): Promise<void> {
    const automation = this.store.listAutomations().find((item) => item.id === id);
    if (!automation) throw new Error("Unknown automation");
    await this.fire(automation, true);
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    for (const automation of this.store.listAutomations()) {
      if (!automation.enabled || !automation.nextRunAt || automation.nextRunAt > now) continue;
      await this.fire(automation, false);
    }
  }

  private async fire(automation: Automation, manual: boolean): Promise<void> {
    const session = this.store.getSession(automation.sessionId);

    if (!session) {
      automation.enabled = false;
      automation.nextRunAt = undefined;
      this.store.saveAutomation(automation);
      this.emit();
      return;
    }

    // Scheduled fires skip busy targets and retry shortly (queuing every cycle
    // could pile up). Manual runs fall through: send() queues the prompt.
    if (!manual && (session.status === "running" || session.status === "creating")) {
      automation.nextRunAt = Date.now() + BUSY_RETRY_MS;
      this.store.saveAutomation(automation);
      this.emit();
      return;
    }

    automation.lastRunAt = Date.now();
    automation.nextRunAt =
      automation.enabled && !manual
        ? computeNextRun(automation.schedule, automation.lastRunAt)
        : automation.nextRunAt;
    this.store.saveAutomation(automation);
    this.emit();

    try {
      await this.agents.send(session.id, automation.prompt, {
        automationName: automation.name,
      });
    } catch (error) {
      console.error(`[glass] automation "${automation.name}" failed`, error);
    }
  }

  private emit(): void {
    this.broadcast({ type: "automations", automations: this.store.listAutomations() });
  }
}
