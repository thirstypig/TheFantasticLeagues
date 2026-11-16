import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: { team: { findUnique: vi.fn() } },
}));

import { prisma } from "../../../db/prisma.js";
import { checkRosterVersion, incrementRosterVersion } from "../lib/rosterVersionGuard.js";

const findUnique = (prisma as any).team.findUnique as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("checkRosterVersion (todo #181)", () => {
  it("reads rosterVersion for exactly the requested team", async () => {
    findUnique.mockResolvedValue({ rosterVersion: 4 });
    await checkRosterVersion(12, "4");
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 12 },
      select: { rosterVersion: true },
    });
  });

  it("returns stale with the CURRENT version when the token is old", async () => {
    findUnique.mockResolvedValue({ rosterVersion: 5 });
    expect(await checkRosterVersion(12, "4")).toEqual({ stale: true, current: 5 });
  });

  it("treats a token from the future as stale too (not just older ones)", async () => {
    findUnique.mockResolvedValue({ rosterVersion: 5 });
    expect(await checkRosterVersion(12, "6")).toEqual({ stale: true, current: 5 });
  });

  it("returns not-stale when the token matches", async () => {
    findUnique.mockResolvedValue({ rosterVersion: 5 });
    expect(await checkRosterVersion(12, "5")).toEqual({ stale: false });
  });

  it("accepts an HTTP-quoted etag", async () => {
    findUnique.mockResolvedValue({ rosterVersion: 5 });
    expect(await checkRosterVersion(12, '"5"')).toEqual({ stale: false });
  });

  it("treats a missing team row as version 0", async () => {
    findUnique.mockResolvedValue(null);
    expect(await checkRosterVersion(12, "0")).toEqual({ stale: false });
    expect(await checkRosterVersion(12, "1")).toEqual({ stale: true, current: 0 });
  });

  it("reports a missing header without touching the database", async () => {
    expect(await checkRosterVersion(12, undefined)).toEqual({ missing: true });
    expect(await checkRosterVersion(12, "")).toEqual({ missing: true });
    expect(await checkRosterVersion(12, "   ")).toEqual({ missing: true });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("If-Match: * passes without comparing versions", async () => {
    expect(await checkRosterVersion(12, "*")).toEqual({ stale: false });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("a non-numeric token is stale, never a pass", async () => {
    findUnique.mockResolvedValue({ rosterVersion: 5 });
    expect(await checkRosterVersion(12, "abc")).toEqual({ stale: true, current: 5 });
  });
});

describe("incrementRosterVersion (todo #181)", () => {
  it("increments on the transaction client, not the global prisma", async () => {
    const txUpdate = vi.fn().mockResolvedValue({ rosterVersion: 6 });
    const tx = { team: { update: txUpdate } } as any;
    const next = await incrementRosterVersion(12, tx);
    expect(txUpdate).toHaveBeenCalledWith({
      where: { id: 12 },
      data: { rosterVersion: { increment: 1 } },
      select: { rosterVersion: true },
    });
    expect(next).toBe(6);
    expect((prisma as any).team.update).toBeUndefined();
  });
});
