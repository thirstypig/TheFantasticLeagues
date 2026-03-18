import { describe, it, expect, afterEach } from "vitest";
import { RateLimiter } from "../src/rateLimiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  afterEach(() => {
    limiter?.destroy();
  });

  it("allows requests within capacity", async () => {
    limiter = new RateLimiter(5, 10, 50);
    // Should not throw for first 5 requests
    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }
    expect(limiter.totalRequests).toBe(5);
    expect(limiter.throttledRequests).toBe(0);
  });

  it("tracks metrics correctly", async () => {
    limiter = new RateLimiter(2, 10, 50);
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.totalRequests).toBe(2);
    expect(limiter.availableTokens).toBeLessThanOrEqual(2);
  });

  it("rejects when queue is full", async () => {
    limiter = new RateLimiter(1, 0.01, 2); // very slow refill, queue max 2
    await limiter.acquire(); // takes the 1 token

    // These 2 will queue
    const p1 = limiter.acquire();
    const p2 = limiter.acquire();

    // This should reject — queue is full (max 2)
    await expect(limiter.acquire()).rejects.toThrow("queue full");
    expect(limiter.rejectedRequests).toBe(1);

    // Clean up queued promises
    limiter.destroy();
  });

  it("reports queue depth", async () => {
    limiter = new RateLimiter(1, 0.01, 10);
    await limiter.acquire(); // takes the 1 token

    // Queue a request (won't resolve immediately)
    limiter.acquire();
    expect(limiter.queueDepth).toBe(1);

    limiter.destroy();
  });

  it("refills tokens over time", async () => {
    limiter = new RateLimiter(5, 100, 50); // 100 tokens/sec refill
    // Drain all tokens
    for (let i = 0; i < 5; i++) await limiter.acquire();

    // Wait a bit for refill
    await new Promise((r) => setTimeout(r, 100));

    // Should have refilled some tokens
    expect(limiter.availableTokens).toBeGreaterThan(0);
  });
});
