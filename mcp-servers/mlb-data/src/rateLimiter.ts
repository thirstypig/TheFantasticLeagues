/**
 * Token bucket rate limiter with request queuing.
 *
 * - Refills at `refillRate` tokens per second up to `capacity`.
 * - Queued requests wait until a token becomes available.
 * - Rejects when queue exceeds `maxQueueSize`.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private queue: Array<() => void> = [];
  private drainTimer: ReturnType<typeof setInterval> | null = null;

  // Metrics
  totalRequests = 0;
  throttledRequests = 0;
  rejectedRequests = 0;

  constructor(
    private capacity: number = 20,
    private refillRate: number = 10, // tokens per second
    private maxQueueSize: number = 50
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  /**
   * Acquire a token. Resolves when a token is available.
   * Throws if the queue is full.
   */
  async acquire(): Promise<void> {
    this.totalRequests++;
    this.refill();

    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }

    // Queue the request
    if (this.queue.length >= this.maxQueueSize) {
      this.rejectedRequests++;
      throw new Error("Rate limiter queue full — too many pending requests");
    }

    this.throttledRequests++;
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.startDrain();
    });
  }

  private startDrain(): void {
    if (this.drainTimer) return;
    this.drainTimer = setInterval(() => {
      this.refill();
      while (this.tokens >= 1 && this.queue.length > 0) {
        this.tokens--;
        const next = this.queue.shift()!;
        next();
      }
      if (this.queue.length === 0 && this.drainTimer) {
        clearInterval(this.drainTimer);
        this.drainTimer = null;
      }
    }, 100); // drain check every 100ms
  }

  get queueDepth(): number {
    return this.queue.length;
  }

  get availableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  destroy(): void {
    if (this.drainTimer) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }
    // Reject any pending requests
    while (this.queue.length > 0) {
      this.queue.shift(); // resolve without action (request abandoned)
    }
  }
}
