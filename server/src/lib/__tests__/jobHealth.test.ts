import { describe, it, expect } from "vitest";
import { classifyRun, findStaleJobs, type JobRunRecord } from "../jobHealth.js";

const NOW = new Date("2026-08-30T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);

describe("classifyRun — did this run actually succeed?", () => {
  it("a run that threw is a failure", () => {
    const r = classifyRun({ error: new Error("boom"), rowsWritten: 0, expectsRows: true });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("boom");
  });

  it("a run that wrote rows is a success", () => {
    expect(classifyRun({ error: null, rowsWritten: 42, expectsRows: true }).ok).toBe(true);
  });

  it("a run that wrote ZERO rows is a FAILURE when the job expects rows", () => {
    // The todo's core complaint: syncAllActivePeriods logged "complete" while
    // writing nothing (MLB circuit breaker open). Silent zero is the bug.
    const r = classifyRun({ error: null, rowsWritten: 0, expectsRows: true });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/0 rows/i);
  });

  it("a run that wrote zero rows is fine when the job does not expect rows", () => {
    // e.g. a reconciler that legitimately finds nothing to heal.
    expect(classifyRun({ error: null, rowsWritten: 0, expectsRows: false }).ok).toBe(true);
  });

  it("preserves a non-Error thrown value rather than losing it", () => {
    const r = classifyRun({ error: "string failure", rowsWritten: 0, expectsRows: false });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("string failure");
  });
});

describe("findStaleJobs — the dead-man's switch", () => {
  const expectations = [{ job: "stats-sync", maxAgeHours: 12 }];

  it("flags a job that has never run at all", () => {
    const stale = findStaleJobs([], expectations, NOW);
    expect(stale).toHaveLength(1);
    expect(stale[0].job).toBe("stats-sync");
    expect(stale[0].reason).toBe("never-run");
    expect(stale[0].lastSuccessAt).toBeNull();
  });

  it("flags a job whose last SUCCESS is older than its window", () => {
    const runs: JobRunRecord[] = [{ job: "stats-sync", finishedAt: hoursAgo(30), ok: true }];
    const stale = findStaleJobs(runs, expectations, NOW);
    expect(stale).toHaveLength(1);
    expect(stale[0].reason).toBe("overdue");
    expect(stale[0].hoursSince).toBeCloseTo(30, 1);
  });

  it("does not flag a job that succeeded inside its window", () => {
    const runs: JobRunRecord[] = [{ job: "stats-sync", finishedAt: hoursAgo(2), ok: true }];
    expect(findStaleJobs(runs, expectations, NOW)).toHaveLength(0);
  });

  it("IGNORES recent FAILED runs — a job failing every 5 minutes is still stale", () => {
    // The trap this exists to avoid: "it ran recently" is not "it worked".
    const runs: JobRunRecord[] = [
      { job: "stats-sync", finishedAt: hoursAgo(0.1), ok: false },
      { job: "stats-sync", finishedAt: hoursAgo(0.2), ok: false },
      { job: "stats-sync", finishedAt: hoursAgo(30), ok: true },
    ];
    const stale = findStaleJobs(runs, expectations, NOW);
    expect(stale).toHaveLength(1);
    expect(stale[0].hoursSince).toBeCloseTo(30, 1);
  });

  it("ignores an unfinished run (finishedAt null) when judging last success", () => {
    const runs: JobRunRecord[] = [
      { job: "stats-sync", finishedAt: null, ok: true },
      { job: "stats-sync", finishedAt: hoursAgo(30), ok: true },
    ];
    expect(findStaleJobs(runs, expectations, NOW)[0].hoursSince).toBeCloseTo(30, 1);
  });

  it("judges each expected job independently", () => {
    const runs: JobRunRecord[] = [{ job: "stats-sync", finishedAt: hoursAgo(1), ok: true }];
    const stale = findStaleJobs(
      runs,
      [{ job: "stats-sync", maxAgeHours: 12 }, { job: "player-sync", maxAgeHours: 36 }],
      NOW,
    );
    expect(stale.map((s) => s.job)).toEqual(["player-sync"]);
  });

  it("ignores runs of jobs nobody declared an expectation for", () => {
    const runs: JobRunRecord[] = [{ job: "some-other-job", finishedAt: hoursAgo(99), ok: true }];
    expect(findStaleJobs(runs, expectations, NOW)).toHaveLength(1);
    expect(findStaleJobs(runs, expectations, NOW)[0].job).toBe("stats-sync");
  });

  it("no expectations means nothing can be stale", () => {
    expect(findStaleJobs([], [], NOW)).toHaveLength(0);
  });
});
