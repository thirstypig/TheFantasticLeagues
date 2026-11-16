import { describe, it, expect } from "vitest";
import { formatClock, remainingMs, skewMs } from "../clock";

describe("formatClock", () => {
  it("formats minutes and seconds", () => {
    expect(formatClock(84000)).toBe("1:24");
    expect(formatClock(5000)).toBe("0:05");
  });
  it("prefixes overtime with +", () => {
    expect(formatClock(-12000)).toBe("+0:12");
  });
});

describe("remainingMs", () => {
  it("remainingMs uses skew", () => {
    const clientNow = 1_000_000;
    const serverNow = new Date(clientNow - 90_000).toISOString(); // server 90s behind
    const skew = skewMs(serverNow, clientNow);
    expect(skew).toBe(-90_000);
    const endsAt = new Date(clientNow + 60_000).toISOString();
    const raw = remainingMs(endsAt, null, 0, clientNow)!;
    const skewed = remainingMs(endsAt, null, skew, clientNow)!;
    expect(raw).toBe(60_000);
    expect(skewed - raw).toBe(90_000);
  });
  it("returns the paused remainder, or null with no clock", () => {
    expect(remainingMs(null, 30_000, 0, 0)).toBe(30_000);
    expect(remainingMs(null, null, 0, 0)).toBeNull();
  });
});
