import type { HubPeriod } from "../api";
import { CLOSE_READY_HOUR_UTC } from "./needsYou";

export type PeriodStep = "play" | "close" | "meeting" | "start" | "setup";

export interface PeriodState {
  step: PeriodStep;
  /** The period the tracker is about: active, last completed, or the one due to start. */
  period: HubPeriod | null;
  /** The next pending period (meeting and start steps); null when none is set up. */
  next: HubPeriod | null;
}

function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Derived only from period rows: nothing is stored or guessed. */
export function derivePeriodState(periods: HubPeriod[], now: Date): PeriodState {
  const byStart = (a: HubPeriod, b: HubPeriod) => a.startDate.localeCompare(b.startDate);
  const active = periods.filter((p) => p.status === "active").sort(byStart)[0];
  const pending = periods.filter((p) => p.status === "pending").sort(byStart);
  const lastCompleted = periods
    .filter((p) => p.status === "completed")
    .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];

  if (active) {
    const e = new Date(active.endDate);
    const readyAt = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate() + 1, CLOSE_READY_HOUR_UTC);
    return { step: now.getTime() >= readyAt ? "close" : "play", period: active, next: pending[0] ?? null };
  }
  const due = pending.find((p) => utcDay(new Date(p.startDate)) <= utcDay(now));
  if (due) return { step: "start", period: due, next: due };
  if (lastCompleted || pending.length > 0) {
    return { step: "meeting", period: lastCompleted ?? null, next: pending[0] ?? null };
  }
  return { step: "setup", period: null, next: null };
}
