import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression cover for the commissioner's direct roster-assignment path.
 *
 * `assignPlayer` created its Roster row without setting `assignedPosition` at
 * all. The column is `String?`, so it landed NULL — and the client narrows an
 * unrecognised slot code to "BN" (`toHubPlayer.ts` → `narrowSlot`), silently
 * benching any assigned hitter.
 *
 * This is the SAME defect PR #435 fixed for the two trade paths, in a third
 * endpoint that was never in that PR's search. The rule those paths share now
 * lives in `rosterSlotFor`, and the real invariant is broader than trades:
 * **every path that inserts a Roster row must write a valid slot code.**
 */

const { mockPrisma, mockTx } = vi.hoisted(() => {
  const mockTx = {
    roster: { findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  };
  return {
    mockTx,
    mockPrisma: {
      team: { findUnique: vi.fn() },
      player: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(mockTx)),
    },
  };
});

vi.mock("../../../db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/rosterWindow.js", () => ({
  resolveEffectiveDate: vi.fn(() => new Date("2026-08-31T00:00:00.000Z")),
  assertNoOwnershipConflict: vi.fn(),
}));

import { CommissionerService } from "../services/CommissionerService.js";

const service = new CommissionerService();
const LEAGUE = 20;
const TEAM = 143;

function arrange(posPrimary: string, posList?: string) {
  mockPrisma.team.findUnique.mockResolvedValue({ id: TEAM, leagueId: LEAGUE });
  mockPrisma.player.findFirst.mockResolvedValue({
    id: 900, mlbId: 111, name: "Test Player", posPrimary, posList: posList ?? posPrimary,
  });
  mockPrisma.player.update.mockResolvedValue({
    id: 900, mlbId: 111, name: "Test Player", posPrimary, posList: posList ?? posPrimary,
  });
  mockTx.roster.findMany.mockResolvedValue([]);
  mockTx.roster.create.mockResolvedValue({ id: 5001 });
}

const call = (posPrimary: string) =>
  service.assignPlayer(LEAGUE, { teamId: TEAM, mlbId: 111, name: "Test Player", posPrimary });

beforeEach(() => vi.clearAllMocks());

describe("CommissionerService.assignPlayer — slot assignment", () => {
  it("never creates a roster row with a null slot", async () => {
    arrange("LF");
    await call("LF");
    const created = mockTx.roster.create.mock.calls[0][0].data;
    expect(created.assignedPosition).not.toBeNull();
    expect(created.assignedPosition).not.toBeUndefined();
  });

  it("assigns an outfielder the OF-eligible primary position, not BN", async () => {
    arrange("LF");
    await call("LF");
    expect(mockTx.roster.create.mock.calls[0][0].data.assignedPosition).toBe("LF");
  });

  it("maps a pitcher to the P slot", async () => {
    arrange("SP");
    await call("SP");
    expect(mockTx.roster.create.mock.calls[0][0].data.assignedPosition).toBe("P");
  });

  it("maps a two-way player to P rather than the non-slot code TWP", async () => {
    arrange("TWP");
    await call("TWP");
    expect(mockTx.roster.create.mock.calls[0][0].data.assignedPosition).toBe("P");
  });
});
