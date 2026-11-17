import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/prisma.js", () => ({
  prisma: { team: { findUnique: vi.fn() } },
}));

import { prisma } from "../../db/prisma.js";
import {
  parseIfMatch,
  readRosterVersion,
  bumpRosterVersionIfCurrent,
  incrementRosterVersion,
  StaleRosterError,
} from "../rosterVersion.js";

const findUnique = (prisma as any).team.findUnique as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

describe("parseIfMatch (todo #181)", () => {
  it("reads an integer token", () => {
    expect(parseIfMatch("5")).toEqual({ kind: "exact", version: 5 });
    expect(parseIfMatch("0")).toEqual({ kind: "exact", version: 0 });
  });
  it("accepts an HTTP-quoted etag", () => {
    expect(parseIfMatch('"5"')).toEqual({ kind: "exact", version: 5 });
  });
  it("* means any version", () => {
    expect(parseIfMatch("*")).toEqual({ kind: "any" });
  });
  it("absent or blank is missing", () => {
    expect(parseIfMatch(undefined)).toEqual({ kind: "missing" });
    expect(parseIfMatch("")).toEqual({ kind: "missing" });
    expect(parseIfMatch("   ")).toEqual({ kind: "missing" });
  });
  it("non-numeric junk is malformed, never a pass", () => {
    expect(parseIfMatch("abc")).toEqual({ kind: "malformed" });
    expect(parseIfMatch("-1")).toEqual({ kind: "malformed" });
    expect(parseIfMatch("5.5")).toEqual({ kind: "malformed" });
  });
});

describe("readRosterVersion", () => {
  it("selects rosterVersion for exactly that team", async () => {
    findUnique.mockResolvedValue({ rosterVersion: 4 });
    expect(await readRosterVersion(12)).toBe(4);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 12 }, select: { rosterVersion: true } });
  });
  it("is 0 for a missing team", async () => {
    findUnique.mockResolvedValue(null);
    expect(await readRosterVersion(12)).toBe(0);
  });
});

describe("bumpRosterVersionIfCurrent", () => {
  it("conditionally increments on the tx client, keyed on the expected version", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const next = await bumpRosterVersionIfCurrent(12, 4, { team: { updateMany } } as any);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 12, rosterVersion: 4 },
      data: { rosterVersion: { increment: 1 } },
    });
    expect(next).toBe(5);
  });
  it("throws StaleRosterError when no row matched (lost the race)", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    await expect(bumpRosterVersionIfCurrent(12, 4, { team: { updateMany } } as any)).rejects.toBeInstanceOf(
      StaleRosterError,
    );
  });
});

describe("incrementRosterVersion", () => {
  it("increments on the transaction client and returns the new version", async () => {
    const update = vi.fn().mockResolvedValue({ rosterVersion: 6 });
    expect(await incrementRosterVersion(12, { team: { update } } as any)).toBe(6);
    expect(update).toHaveBeenCalledWith({
      where: { id: 12 },
      data: { rosterVersion: { increment: 1 } },
      select: { rosterVersion: true },
    });
  });
});
