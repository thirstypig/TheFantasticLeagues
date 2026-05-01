import { describe, it, expect, vi } from "vitest";
import { runWithConcurrency } from "../services/statsService.js";

/**
 * Direct tests for the `runWithConcurrency` helper that powers the cold-start
 * MLB batch loop (todo #137). Pre-fix the loop was sequential
 * `for (const batch of batches) await mlbGetJson(...)` with a 100ms sleep
 * between batches — ~6s on cold containers. Post-fix runs 4 batches in
 * parallel.
 *
 * These tests assert the runner's invariants: in-flight count never exceeds
 * the limit, every item is processed exactly once, errors propagate.
 */
describe("runWithConcurrency", () => {
  it("processes all items exactly once", async () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const seen: number[] = [];

    await runWithConcurrency(items, 4, async (n) => {
      seen.push(n);
    });

    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });

  it("respects the concurrency limit — no more than `limit` workers in flight", async () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    let inFlight = 0;
    let maxObserved = 0;

    await runWithConcurrency(items, 4, async () => {
      inFlight++;
      maxObserved = Math.max(maxObserved, inFlight);
      // Yield so other workers can race.
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });

    expect(maxObserved).toBeLessThanOrEqual(4);
    // And we must hit the cap when there are enough items — proving we're
    // running in parallel, not sequentially.
    expect(maxObserved).toBeGreaterThanOrEqual(2);
  });

  it("dispatches the first `limit` items concurrently (not sequentially)", async () => {
    // Each worker holds a controllable promise. We expect all 4 workers to
    // start before any of them finishes — proving the dispatch is parallel.
    const items = [0, 1, 2, 3, 4, 5];
    const started: number[] = [];
    const releases: Array<() => void> = [];
    const pendings: Promise<void>[] = [];

    for (let i = 0; i < items.length; i++) {
      pendings.push(new Promise<void>((resolve) => releases.push(resolve)));
    }

    const run = runWithConcurrency(items, 4, async (n) => {
      started.push(n);
      await pendings[n];
    });

    // Yield to the microtask queue so all workers can begin.
    await new Promise((r) => setTimeout(r, 10));

    // 4 workers started concurrently — none of the 6 items is past `await pendings[n]`.
    expect(started.length).toBe(4);

    // Release everything to let the runner finish cleanly.
    releases.forEach((r) => r());
    await run;
  });

  it("propagates worker errors", async () => {
    const items = [1, 2, 3, 4];

    await expect(
      runWithConcurrency(items, 2, async (n) => {
        if (n === 3) throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("handles empty input", async () => {
    const worker = vi.fn();
    await runWithConcurrency([], 4, worker);
    expect(worker).not.toHaveBeenCalled();
  });

  it("clamps concurrency to item count when limit > items.length", async () => {
    const items = [1, 2];
    let inFlight = 0;
    let maxObserved = 0;

    await runWithConcurrency(items, 10, async () => {
      inFlight++;
      maxObserved = Math.max(maxObserved, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
    });

    expect(maxObserved).toBeLessThanOrEqual(2);
  });
});
