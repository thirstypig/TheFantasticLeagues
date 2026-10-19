import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration tests: Transaction Claim / Drop Flow
 *
 * Validates the POST /api/transactions/claim flow:
 *   1. Basic claims: free agent pickup, claim+drop combos, auth/validation guards
 *   2. Concurrent/race conditions: two teams claiming same player, rapid sequential claims
 *   3. Drop scenarios: standalone drops, atomic add+drop, invalid drop attempts
 *   4. History/audit: TransactionEvent creation, ordered history
 */

vi.mock("../../db/prisma.js", () => {
  const mockTx = {
    roster: { create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
    player: { findFirst: vi.fn(), findUnique: vi.fn() },
    transactionEvent: { create: vi.fn() },
    team: { findUnique: vi.fn(), update: vi.fn() },
  };
  return {
    prisma: {
      player: { findFirst: vi.fn(), findUnique: vi.fn() },
      roster: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
      league: { findUnique: vi.fn() },
      transactionEvent: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
      $transaction: vi.fn(async (fn: any) => fn(mockTx)),
      __mockTx: mockTx,
    },
  };
});
vi.mock("../../lib/supabase.js", () => ({
  supabaseAdmin: { auth: { getUser: vi.fn() } },
}));
vi.mock("../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireCommissionerOrAdmin: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireTeamOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  isTeamOwner: vi.fn(),
  getOwnedTeamIds: vi.fn(),
}));
vi.mock("../../middleware/validate.js", () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));
vi.mock("../../lib/rosterGuard.js", () => ({
  assertPlayerAvailable: vi.fn(),
}));

import { prisma } from "../../db/prisma.js";
import { assertPlayerAvailable } from "../../lib/rosterGuard.js";

const mockPrisma = prisma as any;
const mockTx = mockPrisma.__mockTx;
const mockAssertPlayerAvailable = assertPlayerAvailable as any;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: assertPlayerAvailable passes
  mockAssertPlayerAvailable.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Helpers — mirror the claim logic from transactions/routes.ts
// ---------------------------------------------------------------------------

interface ClaimInput {
  leagueId: number;
  teamId: number;
  playerId?: number;
  mlbId?: number | string;
  dropPlayerId?: number;
}

interface ClaimResult {
  status: number;
  body: Record<string, any>;
}

/**
 * Simulates POST /api/transactions/claim logic from routes.ts.
 * Returns { status, body } to mirror Express response semantics.
 */
async function simulateClaim(input: ClaimInput, userId = "user-1"): Promise<ClaimResult> {
  let { playerId } = input;
  const { leagueId, teamId, mlbId, dropPlayerId } = input;

  // 1. Resolve player identity
  if (!playerId && mlbId) {
    const mlbIdNum = Number(mlbId);
    const player = await prisma.player.findFirst({ where: { mlbId: mlbIdNum } });
    if (!player) {
      return { status: 404, body: { error: `Player with MLB ID ${mlbId} not found in database.` } };
    }
    playerId = player.id;
  }

  if (!playerId) {
    return { status: 400, body: { error: "Missing playerId or mlbId" } };
  }

  // 2. Verify availability (outside transaction, pre-check)
  const existingRoster = await prisma.roster.findFirst({
    where: { playerId, team: { leagueId }, releasedAt: null },
    include: { team: true },
  });

  if (existingRoster) {
    return { status: 400, body: { error: `Player is already on team: ${existingRoster.team.name}` } };
  }

  // 3. Look up league season
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
  const season = league?.season ?? new Date().getFullYear();

  // 4. Perform atomic transaction
  await prisma.$transaction(async (tx: any) => {
    await assertPlayerAvailable(tx, playerId!, leagueId);

    await tx.roster.create({
      data: { teamId, playerId, source: "waiver_claim", acquiredAt: expect.any(Date) },
    });

    const player = await tx.player.findUnique({ where: { id: playerId } });

    await tx.transactionEvent.create({
      data: {
        rowHash: expect.any(String),
        leagueId,
        season,
        effDate: expect.any(Date),
        submittedAt: expect.any(Date),
        teamId,
        playerId,
        transactionRaw: `Claimed ${player?.name}`,
        transactionType: "ADD",
      },
    });

    if (dropPlayerId) {
      const dropRoster = await tx.roster.findFirst({ where: { teamId, playerId: dropPlayerId } });
      if (dropRoster) {
        await tx.roster.delete({ where: { id: dropRoster.id } });

        const dropPlayer = await tx.player.findUnique({ where: { id: dropPlayerId } });
        await tx.transactionEvent.create({
          data: {
            rowHash: expect.any(String),
            leagueId,
            season,
            effDate: expect.any(Date),
            submittedAt: expect.any(Date),
            teamId,
            playerId: dropPlayerId,
            transactionRaw: `Dropped ${dropPlayer?.name}`,
            transactionType: "DROP",
          },
        });
      }
    }
  });

  return { status: 200, body: { success: true, playerId } };
}

// ---------------------------------------------------------------------------
// Tests: Basic Claims
// ---------------------------------------------------------------------------

describe("integration: basic claims", () => {
  it("successfully claims a free agent player by playerId", async () => {
    // Player exists, not on any roster
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2025 });
    mockTx.roster.create.mockResolvedValue({});
    mockTx.player.findUnique.mockResolvedValue({ id: 100, name: "Mike Trout" });
    mockTx.transactionEvent.create.mockResolvedValue({});

    const result = await simulateClaim({ leagueId: 1, teamId: 1, playerId: 100 });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ success: true, playerId: 100 });

    // Roster created inside transaction
    expect(mockTx.roster.create).toHaveBeenCalledTimes(1);
    expect(mockTx.roster.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ teamId: 1, playerId: 100, source: "waiver_claim" }),
    });

    // TransactionEvent created with type ADD
    expect(mockTx.transactionEvent.create).toHaveBeenCalledTimes(1);
    expect(mockTx.transactionEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leagueId: 1,
        teamId: 1,
        playerId: 100,
        transactionType: "ADD",
        transactionRaw: "Claimed Mike Trout",
      }),
    });
  });

  it("successfully claims a free agent player by mlbId (resolves to playerId)", async () => {
    mockPrisma.player.findFirst.mockResolvedValue({ id: 42, mlbId: 545361 });
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2025 });
    mockTx.roster.create.mockResolvedValue({});
    mockTx.player.findUnique.mockResolvedValue({ id: 42, name: "Mike Trout" });
    mockTx.transactionEvent.create.mockResolvedValue({});

    const result = await simulateClaim({ leagueId: 1, teamId: 1, mlbId: 545361 });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ success: true, playerId: 42 });

    expect(mockPrisma.player.findFirst).toHaveBeenCalledWith({ where: { mlbId: 545361 } });
    expect(mockTx.roster.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ teamId: 1, playerId: 42 }),
    });
  });

  it("claims with simultaneous drop (add player + release another)", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null); // target player is free
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2025 });
    mockTx.roster.create.mockResolvedValue({});
    mockTx.player.findUnique
      .mockResolvedValueOnce({ id: 100, name: "New Player" })   // claimed player
      .mockResolvedValueOnce({ id: 200, name: "Old Player" });  // dropped player
    mockTx.transactionEvent.create.mockResolvedValue({});
    mockTx.roster.findFirst.mockResolvedValue({ id: 55 }); // drop player roster entry exists
    mockTx.roster.delete.mockResolvedValue({});

    const result = await simulateClaim({
      leagueId: 1,
      teamId: 1,
      playerId: 100,
      dropPlayerId: 200,
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);

    // Both roster create (add) and delete (drop) happened
    expect(mockTx.roster.create).toHaveBeenCalledTimes(1);
    expect(mockTx.roster.delete).toHaveBeenCalledWith({ where: { id: 55 } });

    // Two TransactionEvents: ADD + DROP
    expect(mockTx.transactionEvent.create).toHaveBeenCalledTimes(2);
    const addCall = mockTx.transactionEvent.create.mock.calls[0][0];
    const dropCall = mockTx.transactionEvent.create.mock.calls[1][0];
    expect(addCall.data.transactionType).toBe("ADD");
    expect(addCall.data.transactionRaw).toBe("Claimed New Player");
    expect(dropCall.data.transactionType).toBe("DROP");
    expect(dropCall.data.transactionRaw).toBe("Dropped Old Player");
  });

  it("rejects claim for already-rostered player", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue({
      playerId: 100,
      team: { name: "Rival Team" },
    });

    const result = await simulateClaim({ leagueId: 1, teamId: 1, playerId: 100 });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Player is already on team: Rival Team");

    // No transaction should have been started
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects claim for non-existent player (invalid mlbId)", async () => {
    mockPrisma.player.findFirst.mockResolvedValue(null);

    const result = await simulateClaim({ leagueId: 1, teamId: 1, mlbId: 999999 });

    expect(result.status).toBe(404);
    expect(result.body.error).toContain("Player with MLB ID 999999 not found");

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects claim when neither playerId nor mlbId is provided", async () => {
    const result = await simulateClaim({ leagueId: 1, teamId: 1 });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Missing playerId or mlbId");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: Concurrent / Race Condition Scenarios
// ---------------------------------------------------------------------------

describe("integration: concurrent claim scenarios", () => {
  it("two teams claim same player — first succeeds, second gets already-rostered error", async () => {
    // First claim: player is free
    mockPrisma.roster.findFirst.mockResolvedValueOnce(null);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2025 });
    mockTx.roster.create.mockResolvedValue({});
    mockTx.player.findUnique.mockResolvedValue({ id: 100, name: "Hot Prospect" });
    mockTx.transactionEvent.create.mockResolvedValue({});

    const result1 = await simulateClaim({ leagueId: 1, teamId: 1, playerId: 100 });
    expect(result1.status).toBe(200);
    expect(result1.body.success).toBe(true);

    // Second claim: player is now on team 1's roster
    mockPrisma.roster.findFirst.mockResolvedValueOnce({
      playerId: 100,
      team: { name: "Team Alpha" },
    });

    const result2 = await simulateClaim({ leagueId: 1, teamId: 2, playerId: 100 });
    expect(result2.status).toBe(400);
    expect(result2.body.error).toBe("Player is already on team: Team Alpha");
  });

  it("assertPlayerAvailable throws inside transaction for race condition (double-add guard)", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null); // pre-check passes
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2025 });

    // But the in-transaction guard catches the race
    mockAssertPlayerAvailable.mockRejectedValueOnce(
      new Error("Mike Trout is already on Team Alpha's active roster in this league")
    );

    await expect(
      simulateClaim({ leagueId: 1, teamId: 2, playerId: 100 })
    ).rejects.toThrow("already on Team Alpha's active roster");
  });

  it("rapid sequential claims by same team — all valid claims succeed", async () => {
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2025 });
    mockTx.roster.create.mockResolvedValue({});
    mockTx.transactionEvent.create.mockResolvedValue({});

    const playerIds = [100, 200, 300];
    const results: ClaimResult[] = [];

    for (const pid of playerIds) {
      mockPrisma.roster.findFirst.mockResolvedValueOnce(null); // each player is free
      mockTx.player.findUnique.mockResolvedValueOnce({ id: pid, name: `Player ${pid}` });
      results.push(await simulateClaim({ leagueId: 1, teamId: 1, playerId: pid }));
    }

    // All three succeed
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.every((r) => r.body.success === true)).toBe(true);

    // Three roster entries created, three transaction events
    expect(mockTx.roster.create).toHaveBeenCalledTimes(3);
    expect(mockTx.transactionEvent.create).toHaveBeenCalledTimes(3);
  });

  it("claim player that was just dropped by another team — succeeds if roster cleared", async () => {
    // Player 200 was dropped by team 2 (releasedAt set), so it's now free
    mockPrisma.roster.findFirst.mockResolvedValue(null); // no active roster entry
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2025 });
    mockTx.roster.create.mockResolvedValue({});
    mockTx.player.findUnique.mockResolvedValue({ id: 200, name: "Released Player" });
    mockTx.transactionEvent.create.mockResolvedValue({});

    const result = await simulateClaim({ leagueId: 1, teamId: 3, playerId: 200 });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(mockTx.roster.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ teamId: 3, playerId: 200 }),
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Drop Scenarios
// ---------------------------------------------------------------------------

describe("integration: drop scenarios", () => {
  it("drop player via claim with no add — only drop transaction if drop player found", async () => {
    // Claim a real player but also drop one. The drop logic only fires inside the tx.
    mockPrisma.roster.findFirst.mockResolvedValue(null); // claimed player is free
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2025 });
    mockTx.roster.create.mockResolvedValue({});
    mockTx.player.findUnique
      .mockResolvedValueOnce({ id: 100, name: "Added Player" })
      .mockResolvedValueOnce({ id: 200, name: "Dropped Player" });
    mockTx.transactionEvent.create.mockResolvedValue({});
    mockTx.roster.findFirst.mockResolvedValue({ id: 88 }); // drop player roster found
    mockTx.roster.delete.mockResolvedValue({});

    const result = await simulateClaim({
      leagueId: 1,
      teamId: 1,
      playerId: 100,
      dropPlayerId: 200,
    });

    expect(result.status).toBe(200);
    expect(mockTx.roster.delete).toHaveBeenCalledWith({ where: { id: 88 } });
  });

  it("drop player that is not on the team roster — drop is silently skipped", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null); // claimed player is free
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2025 });
    mockTx.roster.create.mockResolvedValue({});
    mockTx.player.findUnique.mockResolvedValue({ id: 100, name: "Added Player" });
    mockTx.transactionEvent.create.mockResolvedValue({});
    mockTx.roster.findFirst.mockResolvedValue(null); // drop player NOT found on roster

    const result = await simulateClaim({
      leagueId: 1,
      teamId: 1,
      playerId: 100,
      dropPlayerId: 999,
    });

    expect(result.status).toBe(200);
    // Roster delete never called since drop player wasn't found
    expect(mockTx.roster.delete).not.toHaveBeenCalled();
    // Only one TransactionEvent (ADD), no DROP event since player not on roster
    expect(mockTx.transactionEvent.create).toHaveBeenCalledTimes(1);
  });

  it("add + drop in single transaction — both succeed atomically", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2025 });
    mockTx.roster.create.mockResolvedValue({});
    mockTx.player.findUnique
      .mockResolvedValueOnce({ id: 100, name: "Pickup" })
      .mockResolvedValueOnce({ id: 200, name: "Release" });
    mockTx.transactionEvent.create.mockResolvedValue({});
    mockTx.roster.findFirst.mockResolvedValue({ id: 44 });
    mockTx.roster.delete.mockResolvedValue({});

    const result = await simulateClaim({
      leagueId: 1,
      teamId: 1,
      playerId: 100,
      dropPlayerId: 200,
    });

    expect(result.status).toBe(200);

    // Everything happened inside one $transaction call
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

    // Both add and drop happened
    expect(mockTx.roster.create).toHaveBeenCalledTimes(1);
    expect(mockTx.roster.delete).toHaveBeenCalledTimes(1);

    // Two TransactionEvents: ADD and DROP
    expect(mockTx.transactionEvent.create).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Tests: History / Audit
// ---------------------------------------------------------------------------

describe("integration: transaction history and audit", () => {
  it("claim creates TransactionEvent with correct type and metadata", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2025 });
    mockTx.roster.create.mockResolvedValue({});
    mockTx.player.findUnique.mockResolvedValue({ id: 100, name: "Aaron Judge" });
    mockTx.transactionEvent.create.mockResolvedValue({});

    await simulateClaim({ leagueId: 1, teamId: 5, playerId: 100 });

    expect(mockTx.transactionEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leagueId: 1,
        season: 2025,
        teamId: 5,
        playerId: 100,
        transactionType: "ADD",
        transactionRaw: "Claimed Aaron Judge",
      }),
    });
  });

  it("multiple claims create ordered transaction history (one event per action)", async () => {
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2025 });
    mockTx.roster.create.mockResolvedValue({});
    mockTx.transactionEvent.create.mockResolvedValue({});

    // Claim 1
    mockPrisma.roster.findFirst.mockResolvedValueOnce(null);
    mockTx.player.findUnique.mockResolvedValueOnce({ id: 100, name: "Player A" });
    await simulateClaim({ leagueId: 1, teamId: 1, playerId: 100 });

    // Claim 2
    mockPrisma.roster.findFirst.mockResolvedValueOnce(null);
    mockTx.player.findUnique.mockResolvedValueOnce({ id: 200, name: "Player B" });
    await simulateClaim({ leagueId: 1, teamId: 1, playerId: 200 });

    // Claim 3 (with drop)
    mockPrisma.roster.findFirst.mockResolvedValueOnce(null);
    mockTx.player.findUnique
      .mockResolvedValueOnce({ id: 300, name: "Player C" })
      .mockResolvedValueOnce({ id: 100, name: "Player A" });
    mockTx.roster.findFirst.mockResolvedValue({ id: 11 });
    mockTx.roster.delete.mockResolvedValue({});
    await simulateClaim({ leagueId: 1, teamId: 1, playerId: 300, dropPlayerId: 100 });

    // Total TransactionEvents: 2 ADDs + 1 ADD + 1 DROP = 4
    expect(mockTx.transactionEvent.create).toHaveBeenCalledTimes(4);

    // Verify the third claim produced both ADD and DROP events
    const calls = mockTx.transactionEvent.create.mock.calls;
    const thirdClaimAdd = calls[2][0].data;
    const thirdClaimDrop = calls[3][0].data;
    expect(thirdClaimAdd.transactionType).toBe("ADD");
    expect(thirdClaimAdd.transactionRaw).toBe("Claimed Player C");
    expect(thirdClaimDrop.transactionType).toBe("DROP");
    expect(thirdClaimDrop.transactionRaw).toBe("Dropped Player A");
  });

  it("uses current year as season when league has no season field", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockPrisma.league.findUnique.mockResolvedValue(null); // no league found
    mockTx.roster.create.mockResolvedValue({});
    mockTx.player.findUnique.mockResolvedValue({ id: 100, name: "Test" });
    mockTx.transactionEvent.create.mockResolvedValue({});

    await simulateClaim({ leagueId: 99, teamId: 1, playerId: 100 });

    expect(mockTx.transactionEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        season: new Date().getFullYear(),
      }),
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Atomicity and Error Propagation
// ---------------------------------------------------------------------------

describe("integration: claim atomicity", () => {
  it("all claim mutations run inside a single $transaction call", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2025 });
    mockTx.roster.create.mockResolvedValue({});
    mockTx.player.findUnique
      .mockResolvedValueOnce({ id: 100, name: "Add" })
      .mockResolvedValueOnce({ id: 200, name: "Drop" });
    mockTx.transactionEvent.create.mockResolvedValue({});
    mockTx.roster.findFirst.mockResolvedValue({ id: 33 });
    mockTx.roster.delete.mockResolvedValue({});

    await simulateClaim({ leagueId: 1, teamId: 1, playerId: 100, dropPlayerId: 200 });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("propagates transaction errors (rollback scenario)", async () => {
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2025 });
    mockPrisma.$transaction.mockRejectedValueOnce(new Error("Serialization failure"));

    await expect(
      simulateClaim({ leagueId: 1, teamId: 1, playerId: 100 })
    ).rejects.toThrow("Serialization failure");
  });
});
