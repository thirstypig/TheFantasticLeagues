import { describe, it, expect, vi, beforeEach } from "vitest";
import { runTrackedJob, __setJobRunStore } from "../runTrackedJob.js";

interface Row { id: number; job: string; startedAt: Date; finishedAt: Date | null; ok: boolean; rowsWritten: number | null; error: string | null }

let rows: Row[] = [];
let nextId = 1;

const store = {
  async create(data: { job: string; startedAt: Date }) {
    const row: Row = { id: nextId++, job: data.job, startedAt: data.startedAt, finishedAt: null, ok: false, rowsWritten: null, error: null };
    rows.push(row);
    return { id: row.id };
  },
  async finish(id: number, data: { finishedAt: Date; ok: boolean; rowsWritten: number | null; error: string | null }) {
    const row = rows.find((r) => r.id === id)!;
    Object.assign(row, data);
  },
};

beforeEach(() => {
  rows = [];
  nextId = 1;
  __setJobRunStore(store);
});

describe("runTrackedJob", () => {
  it("records a successful run with the row count the job reported", async () => {
    await runTrackedJob("stats-sync", async () => ({ rowsWritten: 17 }), { expectsRows: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(true);
    expect(rows[0].rowsWritten).toBe(17);
    expect(rows[0].finishedAt).not.toBeNull();
    expect(rows[0].error).toBeNull();
  });

  it("records a failure and its message when the job throws", async () => {
    await runTrackedJob("stats-sync", async () => { throw new Error("MLB timeout"); }, { expectsRows: true });
    expect(rows[0].ok).toBe(false);
    expect(rows[0].error).toContain("MLB timeout");
    expect(rows[0].finishedAt).not.toBeNull();
  });

  it("NEVER rethrows — a cron callback must not crash the process", async () => {
    await expect(
      runTrackedJob("stats-sync", async () => { throw new Error("boom"); }, { expectsRows: true }),
    ).resolves.not.toThrow();
  });

  it("records zero rows as a FAILURE when the job expects rows", async () => {
    await runTrackedJob("stats-sync", async () => ({ rowsWritten: 0 }), { expectsRows: true });
    expect(rows[0].ok).toBe(false);
    expect(rows[0].error).toMatch(/0 rows/i);
  });

  it("records zero rows as success when the job does not expect rows", async () => {
    await runTrackedJob("reconcile", async () => ({ rowsWritten: 0 }), { expectsRows: false });
    expect(rows[0].ok).toBe(true);
  });

  it("still writes a JobRun row when the job throws before reporting anything", async () => {
    // The failure mode that made #298 invisible: a job that dies leaves no trace.
    await runTrackedJob("stats-sync", async () => { throw new Error("x"); }, { expectsRows: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].startedAt).toBeInstanceOf(Date);
  });

  it("survives a store that fails to record — tracking must not break the job", async () => {
    __setJobRunStore({
      async create() { throw new Error("db down"); },
      async finish() { throw new Error("db down"); },
    });
    const fn = vi.fn(async () => ({ rowsWritten: 5 }));
    await expect(runTrackedJob("stats-sync", fn, { expectsRows: true })).resolves.not.toThrow();
    expect(fn).toHaveBeenCalledOnce();
  });

  it("returns the job's own result to the caller", async () => {
    const r = await runTrackedJob("x", async () => ({ rowsWritten: 3, extra: "kept" }), { expectsRows: true });
    expect(r?.extra).toBe("kept");
  });
});
