import { describe, it, expect, vi } from "vitest";
import { classifyPeriodAudit, summarizeClosedPeriodAudit } from "../services/closedPeriodAudit.js";

/**
 * todo #301 — `reconcileRecentlyClosedPeriods` only looks back `windowDays: 5`.
 * Once a period is more than five days closed nothing re-checks it, so a late
 * MLB scoring revision (earned/unearned, hit/error — routine, days-to-weeks
 * after the game) freezes into the stored PSP permanently.
 *
 * Confirmed live 2026-07-24: Period 4 held Sean Manaea at ER 17 / BB+H 36 while
 * MLB.com, Baseball Reference and FanGraphs all said 14 / 35 on identical
 * IP / SO / W. Three sources against one, and nothing was watching.
 *
 * This sweep is ALERT-ONLY by design. Silently rewriting a closed period's stats
 * changes standings owners have already seen and acted on; a human decides.
 */

describe("classifyPeriodAudit", () => {
  it("clean when there are no mismatches and no fetch errors", () => {
    expect(classifyPeriodAudit({ mismatches: [], fetchErrors: 0 })).toBe("clean");
  });

  it("drift when stored stats disagree with the MLB record", () => {
    expect(classifyPeriodAudit({ mismatches: [{ playerId: 1 }], fetchErrors: 0 })).toBe("drift");
  });

  it("fetch_error when MLB was unreachable and nothing could be compared", () => {
    // Distinct from clean: we learned nothing, which is not the same as "fine".
    expect(classifyPeriodAudit({ mismatches: [], fetchErrors: 3 })).toBe("fetch_error");
  });

  it("reports DRIFT, not fetch_error, when both occur — real mismatches outrank a partial fetch", () => {
    expect(classifyPeriodAudit({ mismatches: [{ playerId: 1 }], fetchErrors: 2 })).toBe("drift");
  });
});

describe("summarizeClosedPeriodAudit", () => {
  const entry = (periodId: number, status: string, mismatches = 0) => ({
    periodId, periodName: `Period ${periodId}`, status, mismatches,
  });

  it("is silent when every period is clean", () => {
    const s = summarizeClosedPeriodAudit([entry(35, "clean"), entry(36, "clean")]);
    expect(s.needsAttention).toBe(false);
    expect(s.drifted).toEqual([]);
  });

  it("flags drift and names the periods", () => {
    const s = summarizeClosedPeriodAudit([entry(35, "clean"), entry(38, "drift", 6)]);
    expect(s.needsAttention).toBe(true);
    expect(s.drifted.map((d) => d.periodId)).toEqual([38]);
    expect(s.totalMismatches).toBe(6);
  });

  it("treats a fetch error as needing attention — an unchecked period is not a passing one", () => {
    // The audit skill's rule: INCOMPLETE is not a pass.
    const s = summarizeClosedPeriodAudit([entry(35, "fetch_error")]);
    expect(s.needsAttention).toBe(true);
    expect(s.unchecked.map((d) => d.periodId)).toEqual([35]);
  });

  it("counts an empty sweep as nothing to report, not as a failure", () => {
    const s = summarizeClosedPeriodAudit([]);
    expect(s.needsAttention).toBe(false);
    expect(s.checked).toBe(0);
  });

  it("reports how many periods were actually checked", () => {
    const s = summarizeClosedPeriodAudit([entry(35, "clean"), entry(36, "drift", 1), entry(37, "fetch_error")]);
    expect(s.checked).toBe(3);
  });
});
