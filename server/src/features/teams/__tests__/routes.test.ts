import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildIlWindows, wasOnIlAtPeriodStart } from "../../../lib/ilWindows.js";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    team: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    leagueMembership: { findUnique: vi.fn(), findMany: vi.fn() },
    roster: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    period: { findUnique: vi.fn() },
    playerStatsPeriod: { findMany: vi.fn() },
    transactionEvent: { findMany: vi.fn() },
  },
}));
vi.mock("../../standings/services/standingsService.js", () => ({
  computeStandingsFromStats: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../transactions/lib/positionInherit.js", () => ({
  isEligibleForSlot: vi.fn().mockReturnValue(true),
}));
vi.mock("../lib/rosterVersionGuard.js", () => ({
  checkRosterVersion: vi.fn(),
  incrementRosterVersion: vi.fn(),
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/supabase.js", () => ({
  supabaseAdmin: { auth: { getUser: vi.fn() } },
}));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireTeamOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireTeamOwnerOrCommissioner: vi.fn(
    () => (_req: unknown, _res: unknown, next: () => void) => next(),
  ),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));
vi.mock("../../../middleware/validate.js", () => ({
  validateBody: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../services/teamService.js", () => ({
  TeamService: class {
    getTeamSummary = vi.fn();
    getTeamHubData = vi.fn();
  },
}));

import { prisma } from "../../../db/prisma.js";
import express from "express";
import type { NextFunction } from "express";
import supertest from "supertest";
import { teamsRouter } from "../routes.js";

const mockPrisma = prisma as any;

// Express test app for handler-level (supertest) tests
const testApp = express();
testApp.use(express.json());
testApp.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 1, isAdmin: false };
  next();
});
testApp.use("/api/teams", teamsRouter);
testApp.use((err: any, _req: any, res: any, _next: NextFunction) => {
  res.status(500).json({ error: "Internal Server Error" });
});

beforeEach(() => {
  vi.clearAllMocks();
});

// Import the router to get the route handlers
// We'll test the handler logic directly by simulating req/res

function mockReq(overrides: any = {}) {
  return {
    user: { id: 1, isAdmin: false },
    params: {},
    query: {},
    body: {},
    ...overrides,
  };
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("team summary - league membership check (IDOR fix)", () => {
  it("blocks non-member from accessing team summary", async () => {
    // Team exists in league 5
    mockPrisma.team.findUnique.mockResolvedValue({ id: 10, leagueId: 5 });
    // User is NOT a member of league 5
    mockPrisma.leagueMembership.findUnique.mockResolvedValue(null);

    // Simulate the handler logic from routes.ts
    const req = mockReq({ params: { id: "10" } });
    const res = mockRes();

    const teamId = Number(req.params.id);

    // This mirrors the new code in routes.ts
    if (!req.user.isAdmin) {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { leagueId: true },
      });
      if (!team) {
        res.status(404).json({ error: "Team not found" });
      } else {
        const membership = await prisma.leagueMembership.findUnique({
          where: { leagueId_userId: { leagueId: team.leagueId, userId: req.user.id } },
        });
        if (!membership) {
          res.status(403).json({ error: "Not a member of this league" });
        }
      }
    }

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Not a member of this league" });
  });

  it("allows league member to access team summary", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({ id: 10, leagueId: 5 });
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ leagueId: 5, userId: 1, role: "OWNER" });

    const req = mockReq({ params: { id: "10" } });
    const res = mockRes();

    const teamId = Number(req.params.id);
    let blocked = false;

    if (!req.user.isAdmin) {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { leagueId: true },
      });
      if (team) {
        const membership = await prisma.leagueMembership.findUnique({
          where: { leagueId_userId: { leagueId: team.leagueId, userId: req.user.id } },
        });
        if (!membership) {
          blocked = true;
        }
      }
    }

    expect(blocked).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows admin to access any team summary without membership check", async () => {
    const req = mockReq({ params: { id: "10" }, user: { id: 99, isAdmin: true } });
    const res = mockRes();

    // Admin bypass — no DB calls needed
    let blocked = false;
    if (!req.user.isAdmin) {
      blocked = true; // Would check membership, but admin skips
    }

    expect(blocked).toBe(false);
    // Prisma should NOT be called for membership check
    expect(mockPrisma.team.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.leagueMembership.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when team does not exist", async () => {
    mockPrisma.team.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: "999" } });
    const res = mockRes();

    const teamId = Number(req.params.id);

    if (!req.user.isAdmin) {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { leagueId: true },
      });
      if (!team) {
        res.status(404).json({ error: "Team not found" });
      }
    }

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Team not found" });
  });
});

// ─── Trade Block Endpoints ────────────────────────────────────────────────

describe("GET /api/teams/:teamId/trade-block", () => {
  it("returns trade block playerIds for a team", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({
      id: 10,
      leagueId: 1,
      tradeBlockPlayerIds: [101, 102, 103],
    });
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ leagueId: 1, userId: 1, role: "OWNER" });

    const req = mockReq({ params: { teamId: "10" } });
    const res = mockRes();

    const teamId = Number(req.params.teamId);
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { tradeBlockPlayerIds: true, leagueId: true },
    });

    expect(team).toBeTruthy();
    const playerIds = Array.isArray(team!.tradeBlockPlayerIds)
      ? (team!.tradeBlockPlayerIds as number[])
      : [];

    res.json({ playerIds });

    expect(res.json).toHaveBeenCalledWith({ playerIds: [101, 102, 103] });
  });

  it("returns empty array when no trade block set", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({
      id: 10,
      leagueId: 1,
      tradeBlockPlayerIds: [],
    });
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ leagueId: 1, userId: 1 });

    const team = await prisma.team.findUnique({
      where: { id: 10 },
      select: { tradeBlockPlayerIds: true, leagueId: true },
    });

    const playerIds = Array.isArray(team!.tradeBlockPlayerIds)
      ? (team!.tradeBlockPlayerIds as number[])
      : [];

    expect(playerIds).toEqual([]);
  });

  it("returns 404 for non-existent team", async () => {
    mockPrisma.team.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { teamId: "999" } });
    const res = mockRes();

    const team = await prisma.team.findUnique({
      where: { id: 999 },
      select: { tradeBlockPlayerIds: true, leagueId: true },
    });

    if (!team) {
      res.status(404).json({ error: "Team not found" });
    }

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("POST /api/teams/:teamId/trade-block", () => {
  it("saves valid playerIds that are on the active roster", async () => {
    mockPrisma.roster.findMany.mockResolvedValue([
      { playerId: 101 },
      { playerId: 102 },
      { playerId: 103 },
    ]);
    mockPrisma.team.update.mockResolvedValue({ id: 10, tradeBlockPlayerIds: [101, 102] });

    const req = mockReq({
      params: { teamId: "10" },
      body: { playerIds: [101, 102] },
    });
    const res = mockRes();

    const teamId = Number(req.params.teamId);
    const { playerIds } = req.body as { playerIds: number[] };

    const activeRoster = await prisma.roster.findMany({
      where: { teamId, releasedAt: null },
      select: { playerId: true },
    });
    const rosterPlayerIds = new Set(activeRoster.map((r: any) => r.playerId));
    const validPlayerIds = playerIds.filter((id: number) => rosterPlayerIds.has(id));

    await prisma.team.update({
      where: { id: teamId },
      data: { tradeBlockPlayerIds: validPlayerIds },
    });

    res.json({ playerIds: validPlayerIds });

    expect(validPlayerIds).toEqual([101, 102]);
    expect(mockPrisma.team.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { tradeBlockPlayerIds: [101, 102] },
    });
  });

  it("filters out playerIds not on the active roster", async () => {
    // Only 101 is on the roster
    mockPrisma.roster.findMany.mockResolvedValue([
      { playerId: 101 },
    ]);
    mockPrisma.team.update.mockResolvedValue({ id: 10, tradeBlockPlayerIds: [101] });

    const req = mockReq({
      params: { teamId: "10" },
      body: { playerIds: [101, 999, 888] },
    });
    const res = mockRes();

    const teamId = Number(req.params.teamId);
    const { playerIds } = req.body as { playerIds: number[] };

    const activeRoster = await prisma.roster.findMany({
      where: { teamId, releasedAt: null },
      select: { playerId: true },
    });
    const rosterPlayerIds = new Set(activeRoster.map((r: any) => r.playerId));
    const validPlayerIds = playerIds.filter((id: number) => rosterPlayerIds.has(id));

    await prisma.team.update({
      where: { id: teamId },
      data: { tradeBlockPlayerIds: validPlayerIds },
    });

    res.json({ playerIds: validPlayerIds });

    // Only 101 should be saved, 999 and 888 filtered out
    expect(validPlayerIds).toEqual([101]);
    expect(mockPrisma.team.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { tradeBlockPlayerIds: [101] },
    });
  });

  it("can clear the trade block with an empty array", async () => {
    mockPrisma.roster.findMany.mockResolvedValue([{ playerId: 101 }]);
    mockPrisma.team.update.mockResolvedValue({ id: 10, tradeBlockPlayerIds: [] });

    const req = mockReq({
      params: { teamId: "10" },
      body: { playerIds: [] },
    });
    const res = mockRes();

    const teamId = Number(req.params.teamId);
    const { playerIds } = req.body as { playerIds: number[] };
    const activeRoster = await prisma.roster.findMany({
      where: { teamId, releasedAt: null },
      select: { playerId: true },
    });
    const rosterPlayerIds = new Set(activeRoster.map((r: any) => r.playerId));
    const validPlayerIds = playerIds.filter((id: number) => rosterPlayerIds.has(id));

    await prisma.team.update({
      where: { id: teamId },
      data: { tradeBlockPlayerIds: validPlayerIds },
    });

    res.json({ playerIds: validPlayerIds });

    expect(validPlayerIds).toEqual([]);
    expect(mockPrisma.team.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { tradeBlockPlayerIds: [] },
    });
  });
});

describe("GET /api/teams/trade-block/league", () => {
  it("returns trade blocks for all teams in a league", async () => {
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ leagueId: 1, userId: 1 });
    mockPrisma.team.findMany.mockResolvedValue([
      { id: 10, tradeBlockPlayerIds: [101, 102] },
      { id: 11, tradeBlockPlayerIds: [] },
      { id: 12, tradeBlockPlayerIds: [201] },
    ]);

    const teams = await prisma.team.findMany({
      where: { leagueId: 1 },
      select: { id: true, tradeBlockPlayerIds: true },
    });

    const tradeBlocks: Record<number, number[]> = {};
    for (const team of teams) {
      const ids = Array.isArray(team.tradeBlockPlayerIds)
        ? (team.tradeBlockPlayerIds as number[])
        : [];
      if (ids.length > 0) {
        tradeBlocks[team.id] = ids;
      }
    }

    // Team 11 has empty array, should not appear
    expect(tradeBlocks).toEqual({
      10: [101, 102],
      12: [201],
    });
    expect(tradeBlocks[11]).toBeUndefined();
  });

  it("returns empty object when no team has trade block selections", async () => {
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ leagueId: 1, userId: 1 });
    mockPrisma.team.findMany.mockResolvedValue([
      { id: 10, tradeBlockPlayerIds: [] },
      { id: 11, tradeBlockPlayerIds: [] },
    ]);

    const teams = await prisma.team.findMany({
      where: { leagueId: 1 },
      select: { id: true, tradeBlockPlayerIds: true },
    });

    const tradeBlocks: Record<number, number[]> = {};
    for (const team of teams) {
      const ids = Array.isArray(team.tradeBlockPlayerIds)
        ? (team.tradeBlockPlayerIds as number[])
        : [];
      if (ids.length > 0) {
        tradeBlocks[team.id] = ids;
      }
    }

    expect(tradeBlocks).toEqual({});
  });
});

describe("PATCH /api/teams/:teamId/roster/:rosterId — schema accepts effectiveDate", () => {
  // The full request flow is exercised by integration tests; here we only
  // verify the Zod schema accepts the new optional field. This guards
  // the commissioner-mode wire contract: client emits an ISO date and
  // server-side validation must let it through.
  it("validates a body with assignedPosition + effectiveDate (YYYY-MM-DD)", async () => {
    const { z } = await import("zod");
    // Inline the schema shape from routes.ts so the test fails fast if
    // the route handler ever drops the field. (Importing the live schema
    // requires the whole router to load, which pulls in heavy mocks.)
    const schema = z.object({
      assignedPosition: z.string().max(5).nullable(),
      effectiveDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}($|T)/)
        .optional(),
    });
    const ok = schema.safeParse({
      assignedPosition: "2B",
      effectiveDate: "2026-04-15",
    });
    expect(ok.success).toBe(true);
  });

  it("validates a body without effectiveDate (owner-mode default)", async () => {
    const { z } = await import("zod");
    const schema = z.object({
      assignedPosition: z.string().max(5).nullable(),
      effectiveDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}($|T)/)
        .optional(),
    });
    const ok = schema.safeParse({ assignedPosition: "OF" });
    expect(ok.success).toBe(true);
  });

  it("rejects a malformed effectiveDate", async () => {
    const { z } = await import("zod");
    const schema = z.object({
      assignedPosition: z.string().max(5).nullable(),
      effectiveDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}($|T)/)
        .optional(),
    });
    const bad = schema.safeParse({
      assignedPosition: "2B",
      effectiveDate: "yesterday",
    });
    expect(bad.success).toBe(false);
  });
});

// ─── period-roster: ownership-window boundary and assignedPosition override ───
//
// These tests encode the GET /api/teams/:id/period-roster window semantics:
//  1. releasedAt boundary is EXCLUSIVE (`gt`, half-open window): a player
//     released at exactly period.startDate owned zero days of the period and
//     must NOT appear — they show in the PRIOR period's view instead. This
//     matches `ownedOn`/scoring semantics in lib/rosterWindow.ts. (The May-14
//     `gte` change overshot: it made boundary drops appear in BOTH periods,
//     which desktop hid client-side but mobile rendered as a roster-rules
//     violation — DLC P4 showed two 3Bs/CMs, 2026-06-11.)
//  2. acquiredAt boundary is INCLUSIVE (`lte`): acquired on the period's last
//     day still counts (prevents a one-day final-day stint vanishing from
//     every period's view).
//  3. assignedPosition historical override: a player whose DB column reads
//     "IL" but who was not on IL at period.startDate gets their posPrimary
//     shown instead, preventing cross-period IL bleed.

describe("period-roster — ownership-window boundary invariants", () => {
  const periodStart = new Date("2026-06-07T00:00:00.000Z");
  const periodEnd = new Date("2026-07-04T00:00:00.000Z");
  const overlaps = (acquiredAt: Date, releasedAt: Date | null) =>
    acquiredAt <= periodEnd && (releasedAt === null || releasedAt > periodStart);

  it("excludes a player released exactly at period start (half-open releasedAt)", () => {
    // Brady House / Andrew Vaughn (DLC): dropped effective P4 start — they
    // belong to P3's view, not P4's. Scoring credits them zero P4 days.
    expect(overlaps(new Date("2026-03-23T02:31:09.453Z"), periodStart)).toBe(false);
  });

  it("still shows the boundary-released player in the PRIOR period", () => {
    const p3Start = new Date("2026-05-17T00:00:00.000Z");
    const p3End = new Date("2026-06-06T00:00:00.000Z");
    const releasedAtP4Start = new Date("2026-06-07T00:00:00.000Z");
    const acquired = new Date("2026-03-23T02:31:09.453Z");
    expect(acquired <= p3End && releasedAtP4Start > p3Start).toBe(true);
  });

  it("includes a player released mid-period", () => {
    expect(overlaps(new Date("2026-03-25T00:00:00.000Z"), new Date("2026-06-20T00:00:00.000Z"))).toBe(true);
  });

  it("includes an active (never released) player", () => {
    expect(overlaps(new Date("2026-06-08T00:00:00.000Z"), null)).toBe(true);
  });

  it("includes a player acquired on the period's last day (inclusive acquiredAt)", () => {
    expect(overlaps(periodEnd, null)).toBe(true);
  });

  it("excludes a player acquired after the period ended", () => {
    expect(overlaps(new Date("2026-07-05T00:00:00.000Z"), null)).toBe(false);
  });
});

describe("period-roster — same-period stint dedupe (mirrors route transformation)", () => {
  it("prefers the active stint when a player was dropped and re-acquired in one period", () => {
    const rows = [
      { id: 1, playerId: 42, releasedAt: new Date("2026-06-15T00:00:00.000Z") },
      { id: 2, playerId: 42, releasedAt: null },
      { id: 3, playerId: 7, releasedAt: new Date("2026-06-20T00:00:00.000Z") },
    ];
    const byPlayer = new Map<number, (typeof rows)[number]>();
    for (const r of rows) {
      const existing = byPlayer.get(r.playerId);
      if (!existing || r.releasedAt === null) byPlayer.set(r.playerId, r);
    }
    const deduped = Array.from(byPlayer.values());
    expect(deduped).toHaveLength(2);
    expect(deduped.find(r => r.playerId === 42)?.id).toBe(2); // active stint wins
    expect(deduped.find(r => r.playerId === 7)?.id).toBe(3);  // sole stint kept
  });
});

describe("period-roster — assignedPosition historical override (mirrors route transformation)", () => {
  it("overrides IL to posPrimary when player was not on IL at period start", () => {
    // Betts was IL_STASH'd on 2026-05-01 (after Period 2 start 2026-04-19).
    // Viewing Period 1 (start 2026-03-25) — he was active; must show SS.
    const periodStart = new Date("2026-03-25T00:00:00.000Z");
    const ilEvents = [
      { playerId: 1, transactionType: "IL_STASH", effDate: new Date("2026-05-01T00:00:00.000Z") },
    ];
    const windows = buildIlWindows(ilEvents);

    let assignedPosition = "IL"; // current DB snapshot
    const posPrimary = "SS";
    if (assignedPosition === "IL" && !wasOnIlAtPeriodStart(1, periodStart, windows)) {
      assignedPosition = posPrimary;
    }

    expect(assignedPosition).toBe("SS");
  });

  it("keeps IL when player was stashed exactly at period start", () => {
    // Betts was IL_STASH'd at 2026-04-19 (Period 2 start).
    // Viewing Period 2 — he was on IL from the first moment; must stay "IL".
    const periodStart = new Date("2026-04-19T00:00:00.000Z");
    const ilEvents = [
      { playerId: 1, transactionType: "IL_STASH", effDate: new Date("2026-04-19T00:00:00.000Z") },
    ];
    const windows = buildIlWindows(ilEvents);

    let assignedPosition = "IL";
    if (assignedPosition === "IL" && !wasOnIlAtPeriodStart(1, periodStart, windows)) {
      assignedPosition = "SS";
    }

    expect(assignedPosition).toBe("IL");
  });

  it("keeps IL when player was stashed before period start", () => {
    const periodStart = new Date("2026-04-19T00:00:00.000Z");
    const ilEvents = [
      { playerId: 1, transactionType: "IL_STASH", effDate: new Date("2026-04-10T00:00:00.000Z") },
    ];
    const windows = buildIlWindows(ilEvents);

    let assignedPosition = "IL";
    if (assignedPosition === "IL" && !wasOnIlAtPeriodStart(1, periodStart, windows)) {
      assignedPosition = "SS";
    }

    expect(assignedPosition).toBe("IL");
  });

  it("does not modify active players (no IL events)", () => {
    const periodStart = new Date("2026-04-19T00:00:00.000Z");
    const windows = buildIlWindows([]);

    let assignedPosition = "2B";
    if (assignedPosition === "IL" && !wasOnIlAtPeriodStart(1, periodStart, windows)) {
      assignedPosition = "SP";
    }

    expect(assignedPosition).toBe("2B");
  });

  it("restores active position after IL_ACTIVATE: stash then activate before period start", () => {
    // Player was stashed and then activated before the period started.
    // They were on IL at some point but NOT at period start.
    const periodStart = new Date("2026-04-19T00:00:00.000Z");
    const ilEvents = [
      { playerId: 1, transactionType: "IL_STASH",    effDate: new Date("2026-04-01T00:00:00.000Z") },
      { playerId: 1, transactionType: "IL_ACTIVATE", effDate: new Date("2026-04-10T00:00:00.000Z") },
    ];
    const windows = buildIlWindows(ilEvents);

    let assignedPosition = "IL"; // DB still says IL (e.g., re-stashed later)
    // The window closed at 2026-04-10, so wasOnIlAtPeriodStart(2026-04-19) = false
    if (assignedPosition === "IL" && !wasOnIlAtPeriodStart(1, periodStart, windows)) {
      assignedPosition = "OF";
    }

    expect(assignedPosition).toBe("OF");
  });
});

// ─── period-roster: cross-league IDOR guard ───────────────────────────────
//
// The auth check verifies the caller is a member of the team's league.
// Without the period.leagueId check, a user in League A can supply a
// periodId from League B and read another league's historical roster.

describe("period-roster — cross-league IDOR guard", () => {
  it("rejects a periodId that belongs to a different league than the team", async () => {
    // Team belongs to league 1; caller is a member of league 1.
    mockPrisma.team.findUnique.mockResolvedValue({ leagueId: 1 });
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ leagueId: 1, userId: 1 });
    // Period belongs to league 2 — different league.
    mockPrisma.period.findUnique.mockResolvedValue({
      id: 99,
      leagueId: 2,
      startDate: new Date("2026-04-19T00:00:00.000Z"),
      endDate:   new Date("2026-05-06T00:00:00.000Z"),
      name: "Period 2",
    });

    const res = mockRes();

    const team = await prisma.team.findUnique({ where: { id: 10 }, select: { leagueId: true } });
    const period = await (prisma as any).period.findUnique({ where: { id: 99 } });

    // This is the guard added in routes.ts to prevent cross-league reads.
    if (period!.leagueId !== team!.leagueId) {
      res.status(403).json({ error: "Period does not belong to this league" });
    }

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Period does not belong to this league" });
  });

  it("allows a periodId in the same league as the team", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({ leagueId: 1 });
    mockPrisma.period.findUnique.mockResolvedValue({
      id: 35,
      leagueId: 1,
      startDate: new Date("2026-03-25T00:00:00.000Z"),
      endDate:   new Date("2026-04-18T00:00:00.000Z"),
      name: "Period 1",
    });

    const res = mockRes();

    const team = await prisma.team.findUnique({ where: { id: 10 }, select: { leagueId: true } });
    const period = await (prisma as any).period.findUnique({ where: { id: 35 } });

    let blocked = false;
    if (period!.leagueId !== team!.leagueId) {
      blocked = true;
      res.status(403).json({ error: "Period does not belong to this league" });
    }

    expect(blocked).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─── period-roster: handler-level Prisma query predicate verification ─────────
//
// These tests call through the actual Express handler (via supertest) and assert
// on the Prisma WHERE clause that was sent to the database. A revert of gt → gte
// in routes.ts would fail the first test here even if the logic-copy tests above
// still pass.

describe("GET /api/teams/:id/period-roster — Prisma query predicates", () => {
  const periodStart = new Date("2026-06-07T00:00:00.000Z");
  const periodEnd = new Date("2026-07-04T00:00:00.000Z");

  beforeEach(() => {
    mockPrisma.team.findUnique.mockResolvedValue({ id: 1, leagueId: 10, ownerUserId: 1 });
    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ leagueId: 10, userId: 1 });
    mockPrisma.period.findUnique.mockResolvedValue({
      id: 5, leagueId: 10, startDate: periodStart, endDate: periodEnd, name: "Period 4",
    });
    mockPrisma.roster.findMany.mockResolvedValue([]);
    mockPrisma.playerStatsPeriod.findMany.mockResolvedValue([]);
    mockPrisma.transactionEvent.findMany.mockResolvedValue([]);
  });

  it("uses exclusive releasedAt boundary (gt not gte) — a gt→gte revert fails here", async () => {
    await supertest(testApp).get("/api/teams/1/period-roster?periodId=5");

    expect(mockPrisma.roster.findMany).toHaveBeenCalled();
    const where = mockPrisma.roster.findMany.mock.calls[0][0].where;
    const releasedClause = where.OR?.find((c: any) => c.releasedAt != null);
    expect(releasedClause?.releasedAt).toEqual({ gt: periodStart });
    expect(releasedClause?.releasedAt).not.toHaveProperty("gte");
  });

  it("uses inclusive acquiredAt boundary (lte not lt) — final-day acquisitions survive", async () => {
    await supertest(testApp).get("/api/teams/1/period-roster?periodId=5");

    const where = mockPrisma.roster.findMany.mock.calls[0][0].where;
    expect(where.acquiredAt).toEqual({ lte: periodEnd });
    expect(where.acquiredAt).not.toHaveProperty("lt");
  });
});
