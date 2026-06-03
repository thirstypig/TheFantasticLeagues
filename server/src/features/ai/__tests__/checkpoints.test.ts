import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: { period: { findMany: vi.fn() } },
}));

import { prisma } from "../../../db/prisma.js";
import { resolveCheckpoint, isCheckpoint, checkpointCount } from "../lib/checkpoints.js";

const mockPrisma = prisma as unknown as {
  period: { findMany: ReturnType<typeof vi.fn> };
};

function period(id: number, startISO: string, endISO: string, status = "completed") {
  return { id, startDate: new Date(startISO), endDate: new Date(endISO), status };
}

beforeEach(() => {
  mockPrisma.period.findMany.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isCheckpoint", () => {
  it("accepts the three known values", () => {
    expect(isCheckpoint("one_third")).toBe(true);
    expect(isCheckpoint("two_thirds")).toBe(true);
    expect(isCheckpoint("end")).toBe(true);
  });
  it("rejects unknown strings", () => {
    expect(isCheckpoint("half")).toBe(false);
    expect(isCheckpoint(null)).toBe(false);
    expect(isCheckpoint(undefined)).toBe(false);
  });
});

describe("checkpointCount", () => {
  it("maps to the documented spans", () => {
    expect(checkpointCount("one_third")).toBe(3);
    expect(checkpointCount("two_thirds")).toBe(5);
    expect(checkpointCount("end")).toBe(7);
  });
});

describe("resolveCheckpoint", () => {
  it("returns null when no periods exist for the league", async () => {
    mockPrisma.period.findMany.mockResolvedValueOnce([]);
    const result = await resolveCheckpoint(1, "one_third", new Date("2026-06-02"));
    expect(result).toBeNull();
  });

  it("returns unlocksAt-only when fewer periods exist than the checkpoint needs", async () => {
    // 2 periods exist, one_third asks for 3
    mockPrisma.period.findMany.mockResolvedValueOnce([
      period(1, "2026-04-01", "2026-04-30"),
      period(2, "2026-05-01", "2026-05-31"),
    ]);
    const result = await resolveCheckpoint(1, "one_third", new Date("2026-06-02"));
    expect(result).toEqual({ unlocksAt: new Date("2026-05-31") });
  });

  it("returns unlocksAt-only when the last period in the span hasn't started yet", async () => {
    // First period started, but period 3 is still in the future — checkpoint
    // is LOCKED (not preview) so we don't return a duplicate of the previous
    // checkpoint's data with misleading preview framing.
    mockPrisma.period.findMany.mockResolvedValueOnce([
      period(1, "2026-04-01", "2026-04-30", "completed"),
      period(2, "2026-05-01", "2026-05-31", "completed"),
      period(3, "2026-07-01", "2026-07-30", "upcoming"),
    ]);
    const result = await resolveCheckpoint(1, "one_third", new Date("2026-06-02"));
    expect(result).toEqual({ unlocksAt: new Date("2026-07-01") });
  });

  it("returns unlocksAt-only when the first period hasn't started yet", async () => {
    mockPrisma.period.findMany.mockResolvedValueOnce([
      period(1, "2027-04-01", "2027-04-30"),
      period(2, "2027-05-01", "2027-05-31"),
      period(3, "2027-06-01", "2027-06-30"),
    ]);
    const result = await resolveCheckpoint(1, "one_third", new Date("2026-06-02"));
    expect(result).toEqual({ unlocksAt: new Date("2027-04-01") });
  });

  it("flags isPreview=true and surfaces unlocksAt when last period is active", async () => {
    // Today is 2026-06-02; period 3 ends 2026-06-06 (in future)
    mockPrisma.period.findMany.mockResolvedValueOnce([
      period(1, "2026-04-01", "2026-04-30", "completed"),
      period(2, "2026-05-01", "2026-05-15", "completed"),
      period(3, "2026-05-16", "2026-06-06", "active"),
    ]);
    const result = await resolveCheckpoint(1, "one_third", new Date("2026-06-02"));
    expect(result).not.toBeNull();
    if (result === null || !("periodIds" in result)) throw new Error("expected resolution");
    expect(result.periodIds).toEqual([1, 2, 3]);
    expect(result.isPreview).toBe(true);
    expect(result.unlocksAt).toEqual(new Date("2026-06-06"));
    expect(result.label).toBe("1/3 Season");
  });

  it("flags isPreview=false when all periods are completed", async () => {
    mockPrisma.period.findMany.mockResolvedValueOnce([
      period(1, "2026-04-01", "2026-04-30", "completed"),
      period(2, "2026-05-01", "2026-05-15", "completed"),
      period(3, "2026-05-16", "2026-06-01", "completed"),
    ]);
    const result = await resolveCheckpoint(1, "one_third", new Date("2026-06-15"));
    expect(result).not.toBeNull();
    if (result === null || !("periodIds" in result)) throw new Error("expected resolution");
    expect(result.isPreview).toBe(false);
    expect(result.unlocksAt).toBeNull();
  });

  it("falls back to date math when status is missing", async () => {
    mockPrisma.period.findMany.mockResolvedValueOnce([
      period(1, "2026-04-01", "2026-04-30", "unknown"),
      period(2, "2026-05-01", "2026-05-31", "unknown"),
      period(3, "2026-06-01", "2026-06-30", "unknown"),
    ]);
    // Today inside period 3 → preview
    const result = await resolveCheckpoint(1, "one_third", new Date("2026-06-15"));
    if (result === null || !("periodIds" in result)) throw new Error("expected resolution");
    expect(result.isPreview).toBe(true);
  });

  it("uses two_thirds → take 5 and end → take 7", async () => {
    mockPrisma.period.findMany.mockResolvedValueOnce([]);
    await resolveCheckpoint(1, "two_thirds", new Date());
    expect(mockPrisma.period.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
    mockPrisma.period.findMany.mockReset();
    mockPrisma.period.findMany.mockResolvedValueOnce([]);
    await resolveCheckpoint(1, "end", new Date());
    expect(mockPrisma.period.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 7 }),
    );
  });
});
