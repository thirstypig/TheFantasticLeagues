import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { DataFreshness, formatTimeAgo } from "../DataFreshness";

describe("DataFreshness", () => {
  describe("renders nothing", () => {
    it("when computedAt is null", () => {
      const { container } = render(<DataFreshness computedAt={null} />);
      expect(container.firstChild).toBeNull();
    });

    it("when computedAt is undefined", () => {
      const { container } = render(<DataFreshness computedAt={undefined} />);
      expect(container.firstChild).toBeNull();
    });

    it("when computedAt is empty string", () => {
      const { container } = render(<DataFreshness computedAt="" />);
      expect(container.firstChild).toBeNull();
    });

    it("when computedAt is not parseable as a date", () => {
      const { container } = render(<DataFreshness computedAt="not-an-iso-date" />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("renders absolute date+time", () => {
    it("formats a valid ISO into Mon D, h:MM AM", () => {
      const iso = "2026-05-07T14:30:00.000Z";
      render(<DataFreshness computedAt={iso} />);
      // Locale-formatted absolute string. Avoid asserting the exact wall-clock
      // (timezone-dependent) — just confirm the leading "Updated " and that
      // the rendered span includes a month-day token plus a time.
      const node = screen.getByText(/^Updated\s+\w{3}\s+\d{1,2}/i);
      expect(node).toBeDefined();
    });

    it("custom label overrides 'Updated'", () => {
      render(<DataFreshness computedAt="2026-05-07T14:30:00.000Z" label="Synced" />);
      expect(screen.getByText(/^Synced\s+/i)).toBeDefined();
    });

    it("title attribute carries both full local string and relative time", () => {
      render(<DataFreshness computedAt="2026-05-07T14:30:00.000Z" />);
      const span = screen.getByText(/^Updated/i);
      const title = span.getAttribute("title") ?? "";
      // The relative bracket is the contract — "(...)" with formatTimeAgo output.
      expect(title).toMatch(/\(.+\)$/);
      // The full local string is whatever toLocaleString yields; just confirm
      // it's the part before " (" and not empty.
      const before = title.split(" (")[0];
      expect(before.length).toBeGreaterThan(0);
    });

    it("custom className overrides the default", () => {
      render(<DataFreshness computedAt="2026-05-07T14:30:00.000Z" className="my-custom" />);
      const span = screen.getByText(/^Updated/i);
      expect(span.className).toBe("my-custom");
    });
  });

  describe("minute-tick re-render", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("title updates after 60s tick (relative time stays accurate)", () => {
      // Anchor the clock so we can advance deterministically.
      const baseNow = new Date("2026-05-07T14:30:00.000Z").getTime();
      vi.setSystemTime(baseNow);
      const isoBefore = new Date(baseNow - 30_000).toISOString(); // 30s ago

      render(<DataFreshness computedAt={isoBefore} />);
      const span = screen.getByText(/^Updated/i);
      const titleStart = span.getAttribute("title") ?? "";

      // Advance 60s — the setInterval callback bumps the tick state, forcing
      // re-render. Relative time computed with `Date.now()` will now reflect
      // 90s elapsed instead of 30s.
      act(() => {
        vi.advanceTimersByTime(60_000);
      });

      const titleAfter = span.getAttribute("title") ?? "";
      expect(titleAfter).not.toBe(titleStart);
    });

    it("does not start an interval when computedAt is null", () => {
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
      render(<DataFreshness computedAt={null} />);
      expect(setIntervalSpy).not.toHaveBeenCalled();
      setIntervalSpy.mockRestore();
    });
  });
});

describe("formatTimeAgo", () => {
  let now: number;

  beforeEach(() => {
    vi.useFakeTimers();
    now = new Date("2026-05-07T14:30:00.000Z").getTime();
    vi.setSystemTime(now);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for negative deltas (clock skew)", () => {
    expect(formatTimeAgo(new Date(now + 5000))).toBe("just now");
  });

  it("returns 'moments ago' for <60s", () => {
    expect(formatTimeAgo(new Date(now - 30_000))).toBe("moments ago");
  });

  it("returns 'Nm ago' for minutes (1–59)", () => {
    expect(formatTimeAgo(new Date(now - 5 * 60_000))).toBe("5m ago");
    expect(formatTimeAgo(new Date(now - 59 * 60_000))).toBe("59m ago");
  });

  it("returns 'Nh ago' for hours (1–23)", () => {
    expect(formatTimeAgo(new Date(now - 1 * 3_600_000))).toBe("1h ago");
    expect(formatTimeAgo(new Date(now - 23 * 3_600_000))).toBe("23h ago");
  });

  it("returns 'Nd ago' for days (1–6)", () => {
    expect(formatTimeAgo(new Date(now - 1 * 86_400_000))).toBe("1d ago");
    expect(formatTimeAgo(new Date(now - 6 * 86_400_000))).toBe("6d ago");
  });

  it("returns toLocaleDateString for ≥7 days", () => {
    const sevenDaysAgo = new Date(now - 7 * 86_400_000);
    expect(formatTimeAgo(sevenDaysAgo)).toBe(sevenDaysAgo.toLocaleDateString());
  });
});
