import { describe, it, expect } from "vitest";
import { derivePeriodState } from "../lib/periodState";
import type { HubPeriod } from "../api";

const p = (id: number, status: string, start: string, end: string): HubPeriod => ({
  id, name: `Period ${id}`, startDate: `${start}T00:00:00.000Z`, endDate: `${end}T00:00:00.000Z`, status,
});

describe("derivePeriodState", () => {
  const periods = [p(7, "active", "2026-06-01", "2026-06-14"), p(8, "pending", "2026-06-15", "2026-06-28")];

  it("active and before its end + 1 day at 14:00 UTC -> play", () => {
    expect(derivePeriodState(periods, new Date("2026-06-15T13:59:00Z")).step).toBe("play");
    const s = derivePeriodState(periods, new Date("2026-06-10T09:00:00Z"));
    expect(s.period?.id).toBe(7);
    expect(s.next?.id).toBe(8);
  });

  it("active and past that moment -> close", () => {
    expect(derivePeriodState(periods, new Date("2026-06-15T14:00:00Z")).step).toBe("close");
  });

  it("no active, last completed, next pending in the future -> meeting", () => {
    const s = derivePeriodState([p(7, "completed", "2026-06-01", "2026-06-14"), p(8, "pending", "2026-06-20", "2026-06-28")], new Date("2026-06-16T10:00:00Z"));
    expect(s.step).toBe("meeting");
    expect(s.period?.id).toBe(7);
    expect(s.next?.id).toBe(8);
  });

  it("pending period whose start date has arrived with no active -> start", () => {
    const s = derivePeriodState([p(7, "completed", "2026-06-01", "2026-06-14"), p(8, "pending", "2026-06-15", "2026-06-28")], new Date("2026-06-15T10:00:00Z"));
    expect(s.step).toBe("start");
    expect(s.next?.id).toBe(8);
  });

  it("no periods -> setup", () => {
    expect(derivePeriodState([], new Date("2026-06-15T10:00:00Z")).step).toBe("setup");
  });

  it("all completed, none pending -> meeting with next null", () => {
    const s = derivePeriodState([p(7, "completed", "2026-06-01", "2026-06-14")], new Date("2026-06-20T10:00:00Z"));
    expect(s.step).toBe("meeting");
    expect(s.next).toBeNull();
  });
});
