import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import supertest from "supertest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    franchiseMembership: { findFirst: vi.fn(), findMany: vi.fn() },
    teamOwnership: { findMany: vi.fn() },
    historicalSeason: { findMany: vi.fn() },
    historicalTeam: { findUnique: vi.fn() },
    historicalPlayerMatch: { findMany: vi.fn(), groupBy: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => (req.user ? next() : res.status(401).end()),
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireLeagueMember: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock("../services/playerSearchService.js", () => ({
  MIN_QUERY_LENGTH: 3,
  searchCandidates: vi.fn(),
  lookupPlayerName: vi.fn(),
}));

import {
  PlayerCheckItemResponseSchema, PlayerCheckResponseSchema, PlayerCheckSearchResponseSchema,
} from "../../../../../shared/api/archivePlayerCheck.js";
import { prisma } from "../../../db/prisma.js";
import { writeAuditLog } from "../../../lib/auditLog.js";
import { archiveRouter } from "../routes.js";
import { lookupPlayerName, searchCandidates } from "../services/playerSearchService.js";

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  franchiseMembership: { findFirst: Fn; findMany: Fn };
  teamOwnership: { findMany: Fn };
  historicalSeason: { findMany: Fn };
  historicalTeam: { findUnique: Fn };
  historicalPlayerMatch: { findMany: Fn; groupBy: Fn; findFirst: Fn; update: Fn };
};
const audit = writeAuditLog as unknown as Fn;
const search = searchCandidates as unknown as Fn;
const lookup = lookupPlayerName as unknown as Fn;

const ADMIN = { id: 1, isAdmin: true };
const MEMBER = { id: 42, isAdmin: false };
const COMMISH = { id: 26, isAdmin: false };
/** MEMBER is set to OWN_TEAM and owns MNB: he sees MNB's names in franchise 1, every year. */
const MEMBER_SCOPE = { season: { league: { franchiseId: 1 } }, teamCode: { in: ["MNB"] } };
const COMMISH_SCOPE = { season: { league: { franchiseId: 1 } } };
const notVerified = (scope: object, extra: object = {}) => ({ AND: [scope, { ...extra, status: { not: "VERIFIED" } }] });
const byFinal = { name: "Kent", isAdmin: false, franchiseMemberships: [{ id: 3 }] };

function appAs(user: { id: number; isAdmin: boolean } | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = user;
    next();
  });
  app.use("/api", archiveRouter);
  return supertest(app);
}

const wrights = [
  { mlbId: 124605, name: "Jaret Wright", line: null, playingTime: 186.3, eligibleSlots: 1, checks: [{ slot: "P", eligible: true, reason: "32 G at P" }] },
  { mlbId: 124604, name: "Jamey Wright", line: null, playingTime: 78.7, eligibleSlots: 1, checks: [{ slot: "P", eligible: true, reason: "14 G at P" }] },
];

/** A HistoricalPlayerMatch row with the includes the routes ask for. */
function openRow(over: Record<string, unknown> = {}) {
  return {
    id: 10, seasonId: 9, key: "2004|MNB|j|wright|P", teamCode: "MNB", role: "P",
    names: ["J. Wright"], slots: ["P"], seenIn: ["final"],
    status: "OPEN", autoMlbId: null, autoName: null,
    detail: { keptFromSlot: "P", how: null, checks: [], line: null, candidates: wrights, suggestion: { mlbId: 124605, why: "eligible and played the most (186.3 IP)", closeCall: false } },
    decision: null, decidedById: null, decidedAt: null, mlbId: null, mlbName: null,
    season: { year: 2004 }, decidedBy: null,
    ...over,
  };
}
function flaggedRow(over: Record<string, unknown> = {}) {
  return openRow({
    id: 11, key: "2004|MNB|a|pujols|H", role: "H", names: ["A. Pujols"], slots: ["3B"], seenIn: ["draft", "final"],
    status: "FLAGGED", autoMlbId: 405395, autoName: "Albert Pujols", mlbId: 405395, mlbName: "Albert Pujols",
    detail: { keptFromSlot: null, how: "exact", checks: [{ slot: "3B", eligible: false, reason: "not eligible at 3B" }], line: null, candidates: [], suggestion: null },
    ...over,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  db.franchiseMembership.findFirst.mockResolvedValue({ id: 7 }); // the viewer is an OGBA member
  // Player-check access: COMMISH is set to ALL; everyone else to OWN_TEAM, owning MNB.
  db.franchiseMembership.findMany.mockImplementation(async ({ where }: { where: { userId: number } }) =>
    [{ franchiseId: 1, archiveAudit: where.userId === COMMISH.id ? "ALL" : "OWN_TEAM" }]);
  db.teamOwnership.findMany.mockResolvedValue([{ team: { code: "MNB" } }]);
  db.historicalTeam.findUnique.mockResolvedValue({ name: "MoneyBall" });
  db.historicalPlayerMatch.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...openRow(), ...data, decidedBy: data.decidedById ? { name: "Mike", isAdmin: false, franchiseMemberships: [] } : null,
  }));
});

describe("GET /api/archive/player-check", () => {
  beforeEach(() => {
    db.historicalSeason.findMany.mockResolvedValue([
      { id: 1, year: 2025, teams: [{ code: "LDY", name: "Los Doyers" }, { code: "MNB", name: "MoneyBall" }] },
      { id: 9, year: 2004, teams: [{ code: "LDY", name: "VIP BALCOS" }, { code: "MNB", name: "NY Sock Exchange" }] },
    ]);
    db.historicalPlayerMatch.groupBy.mockResolvedValue([
      { seasonId: 9, status: "VERIFIED", _count: { _all: 267 } },
      { seasonId: 9, status: "OPEN", _count: { _all: 4 } },
      { seasonId: 9, status: "FLAGGED", _count: { _all: 1 } },
      { seasonId: 1, status: "VERIFIED", _count: { _all: 369 } },
    ]);
    db.historicalPlayerMatch.findMany.mockResolvedValue([
      openRow({ id: 30, seasonId: 1, teamCode: "LDY", season: { year: 2025 }, names: ["T. Scott"] }),
      flaggedRow({ decision: "EXCEPTION", decidedById: 1, decidedAt: new Date("2026-11-21T01:41:40.827Z"), decidedBy: { name: "James", isAdmin: true, franchiseMemberships: [] } }),
      openRow(),
    ]);
  });

  it("shows an owner only his own franchise's names, and never the verified names", async () => {
    const res = await appAs(MEMBER).get("/api/archive/player-check").expect(200);
    expect(db.teamOwnership.findMany).toHaveBeenCalledWith({
      where: { userId: 42, team: { league: { franchiseId: 1 }, code: { not: null } } },
      select: { team: { select: { code: true } } },
    });
    expect(db.historicalSeason.findMany.mock.calls[0][0].where).toEqual({ playerMatches: { some: MEMBER_SCOPE } });
    expect(db.historicalPlayerMatch.groupBy.mock.calls[0][0].where).toEqual(MEMBER_SCOPE);
    expect(db.historicalPlayerMatch.findMany.mock.calls[0][0].where).toEqual(notVerified(MEMBER_SCOPE));
    expect(res.body.viewer).toEqual({ isAdmin: false, final: false, level: "OWN_TEAM", teamCodes: ["MNB"] });
  });

  it("shows an admin every archive", async () => {
    await appAs(ADMIN).get("/api/archive/player-check").expect(200);
    expect(db.historicalPlayerMatch.findMany.mock.calls[0][0].where).toEqual(notVerified({}));
    expect(db.franchiseMembership.findFirst).not.toHaveBeenCalled();
  });

  it("returns per-season counts, the teams by their current names, and the names oldest season first", async () => {
    const res = await appAs(ADMIN).get("/api/archive/player-check").expect(200);
    expect(PlayerCheckResponseSchema.parse(res.body)).toEqual(res.body); // the wire contract, nothing extra
    expect(res.body.viewer).toEqual({ isAdmin: true, final: true, level: "ALL", teamCodes: null });
    expect(res.body.seasons).toEqual([
      { year: 2025, verified: 369, suggested: 0, flagged: 0, open: 0 },
      { year: 2004, verified: 267, suggested: 0, flagged: 1, open: 4 },
    ]);
    expect(res.body.teams).toEqual([{ code: "LDY", name: "Los Doyers" }, { code: "MNB", name: "MoneyBall" }]);
    expect(res.body.items.map((i: { id: number }) => i.id)).toEqual([11, 10, 30]);
    // The name the team used THAT season.
    expect(res.body.items[0].teamName).toBe("NY Sock Exchange");
    expect(res.body.items[2].teamName).toBe("Los Doyers");
  });

  it("describes a flagged name by its matched player and a decided one by who decided it", async () => {
    const res = await appAs(ADMIN).get("/api/archive/player-check").expect(200);
    expect(res.body.items[0]).toMatchObject({
      id: 11, year: 2004, teamCode: "MNB", status: "FLAGGED", names: ["A. Pujols"], slots: ["3B"], seenIn: ["draft", "final"],
      match: { mlbId: 405395, name: "Albert Pujols", checks: [{ slot: "3B", eligible: false, reason: "not eligible at 3B" }] },
      candidates: [],
      decision: { decision: "EXCEPTION", mlbId: 405395, name: "Albert Pujols", byName: "James", at: "2026-11-21T01:41:40.827Z", locked: false },
    });
    expect(res.body.items[1]).toMatchObject({ id: 10, status: "OPEN", match: null, decision: null, suggestion: { mlbId: 124605 } });
    expect(res.body.items[1].candidates.map((c: { mlbId: number }) => c.mlbId)).toEqual([124605, 124604]);
  });

  it("tells a member that the commissioner's decision is locked", async () => {
    const res = await appAs(MEMBER).get("/api/archive/player-check").expect(200);
    expect(res.body.viewer).toEqual({ isAdmin: false, final: false, level: "OWN_TEAM", teamCodes: ["MNB"] });
    expect(res.body.items[0].decision.locked).toBe(true);
  });

  it("is closed to a signed-in user who is not a league member", async () => {
    db.franchiseMembership.findFirst.mockResolvedValue(null);
    await appAs(MEMBER).get("/api/archive/player-check").expect(403);
    expect(db.historicalPlayerMatch.findMany).not.toHaveBeenCalled();
  });

  it("is closed to a signed-out visitor", async () => {
    await appAs(null).get("/api/archive/player-check").expect(401);
  });
});

describe("PUT /api/archive/player-check/:id/decision", () => {
  it("records a pick of a listed candidate under the viewer's name, without asking MLB", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(openRow());
    const res = await appAs(MEMBER).put("/api/archive/player-check/10/decision").send({ decision: "PICK", mlbId: 124604 }).expect(200);
    // Scoped to the member's franchise, and to names still on the check (verified ones are a 404).
    expect(db.historicalPlayerMatch.findFirst.mock.calls[0][0].where).toEqual(notVerified(MEMBER_SCOPE, { id: 10 }));
    const { where, data } = db.historicalPlayerMatch.update.mock.calls[0][0];
    expect(where).toEqual({ id: 10 });
    expect(data).toMatchObject({ decision: "PICK", decidedById: 42, mlbId: 124604, mlbName: "Jamey Wright" });
    expect(data.decidedAt).toBeInstanceOf(Date);
    expect(lookup).not.toHaveBeenCalled();
    expect(PlayerCheckItemResponseSchema.parse(res.body)).toEqual(res.body); // the wire contract, nothing extra
    expect(res.body.item).toMatchObject({ id: 10, teamName: "MoneyBall", decision: { decision: "PICK", mlbId: 124604, name: "Jamey Wright", byName: "Mike", locked: false } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      userId: 42, action: "ARCHIVE_PLAYER_DECIDE", resourceType: "HistoricalPlayerMatch", resourceId: 10,
      metadata: { key: "2004|MNB|j|wright|P", decision: "PICK", mlbId: 124604, name: "Jamey Wright", previous: null },
    }));
  });

  it("checks a player who is not a listed candidate against MLB and stores MLB's name for him", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(openRow());
    lookup.mockResolvedValue("Dan Wright");
    await appAs(ADMIN).put("/api/archive/player-check/10/decision").send({ decision: "PICK", mlbId: 407793 }).expect(200);
    expect(lookup).toHaveBeenCalledWith(407793);
    expect(db.historicalPlayerMatch.update.mock.calls[0][0].data).toMatchObject({ decision: "PICK", mlbId: 407793, mlbName: "Dan Wright", decidedById: 1 });
  });

  it("refuses an id MLB doesn't have", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(openRow());
    lookup.mockResolvedValue(null);
    const res = await appAs(ADMIN).put("/api/archive/player-check/10/decision").send({ decision: "PICK", mlbId: 999999999 }).expect(422);
    expect(res.body.error).toMatch(/no player with that id/);
    expect(db.historicalPlayerMatch.update).not.toHaveBeenCalled();
  });

  it("says MLB is unreachable rather than 'no such player' when the lookup fails", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(openRow());
    lookup.mockRejectedValue(new Error("MLB API timeout"));
    const res = await appAs(ADMIN).put("/api/archive/player-check/10/decision").send({ decision: "PICK", mlbId: 407793 }).expect(502);
    expect(res.body.error).toMatch(/Couldn't reach MLB/);
    expect(db.historicalPlayerMatch.update).not.toHaveBeenCalled();
  });

  it("keeps a flagged player as an allowed exception", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(flaggedRow());
    await appAs(ADMIN).put("/api/archive/player-check/11/decision").send({ decision: "EXCEPTION" }).expect(200);
    expect(db.historicalPlayerMatch.update.mock.calls[0][0].data).toMatchObject({ decision: "EXCEPTION", mlbId: 405395, mlbName: "Albert Pujols" });
  });

  it("marks a flagged player wrong, leaving the name unknown", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(flaggedRow());
    await appAs(ADMIN).put("/api/archive/player-check/11/decision").send({ decision: "WRONG" }).expect(200);
    expect(db.historicalPlayerMatch.update.mock.calls[0][0].data).toMatchObject({ decision: "WRONG", mlbId: null, mlbName: null });
  });

  it("refuses a decision the name can't take (409) and writes nothing", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(openRow());
    const res = await appAs(ADMIN).put("/api/archive/player-check/10/decision").send({ decision: "EXCEPTION" }).expect(409);
    expect(res.body.error).toMatch(/no matched player/);
    db.historicalPlayerMatch.findFirst.mockResolvedValue(flaggedRow());
    await appAs(ADMIN).put("/api/archive/player-check/11/decision").send({ decision: "NONE" }).expect(409);
    expect(db.historicalPlayerMatch.update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("does not let a member change what the commissioner decided", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(openRow({ decision: "PICK", decidedById: 1, mlbId: 124605, mlbName: "Jaret Wright", decidedBy: { name: "James", isAdmin: true, franchiseMemberships: [] } }));
    const res = await appAs(MEMBER).put("/api/archive/player-check/10/decision").send({ decision: "PICK", mlbId: 124604 }).expect(403);
    expect(res.body.error).toMatch(/commissioner already decided/);
    expect(db.historicalPlayerMatch.update).not.toHaveBeenCalled();
  });

  it("lets a member revise another member's decision, and logs what it replaced", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(openRow({ decision: "NONE", decidedById: 50, decidedBy: { name: "Kurt", isAdmin: false, franchiseMemberships: [] } }));
    await appAs(MEMBER).put("/api/archive/player-check/10/decision").send({ decision: "PICK", mlbId: 124605 }).expect(200);
    expect(audit.mock.calls[0][0].metadata.previous).toEqual({ decision: "NONE", mlbId: null, name: null });
  });

  it("treats a decision whose maker is gone as the commissioner's", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(openRow({ decision: "PICK", decidedById: null, mlbId: 124605, mlbName: "Jaret Wright", decidedBy: null }));
    await appAs(MEMBER).put("/api/archive/player-check/10/decision").send({ decision: "NONE" }).expect(403);
    await appAs(ADMIN).put("/api/archive/player-check/10/decision").send({ decision: "NONE" }).expect(200);
  });

  it("returns 404 for a name outside the viewer's archive, and for a non-numeric id", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(null);
    await appAs(MEMBER).put("/api/archive/player-check/10/decision").send({ decision: "NONE" }).expect(404);
    await appAs(MEMBER).put("/api/archive/player-check/abc/decision").send({ decision: "NONE" }).expect(404);
    expect(db.historicalPlayerMatch.findFirst).toHaveBeenCalledTimes(1); // "abc" never reaches the database
  });

  it("rejects a malformed body", async () => {
    await appAs(ADMIN).put("/api/archive/player-check/10/decision").send({ decision: "PICK" }).expect(400);
    await appAs(ADMIN).put("/api/archive/player-check/10/decision").send({ decision: "MAYBE" }).expect(400);
    await appAs(ADMIN).put("/api/archive/player-check/10/decision").send({ decision: "PICK", mlbId: -4 }).expect(400);
    expect(db.historicalPlayerMatch.findFirst).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/archive/player-check/:id/decision (undo)", () => {
  it("clears the decision and puts a flagged name back on its matched player", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(flaggedRow({ decision: "WRONG", decidedById: 1, mlbId: null, mlbName: null, decidedBy: { name: "James", isAdmin: true, franchiseMemberships: [] } }));
    await appAs(ADMIN).delete("/api/archive/player-check/11/decision").expect(200);
    expect(db.historicalPlayerMatch.update.mock.calls[0][0]).toMatchObject({
      where: { id: 11 },
      data: { decision: null, decidedById: null, decidedAt: null, mlbId: 405395, mlbName: "Albert Pujols" },
    });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1, action: "ARCHIVE_PLAYER_UNDO", resourceId: 11,
      metadata: { key: "2004|MNB|a|pujols|H", previous: { decision: "WRONG", mlbId: null, name: null } },
    }));
  });

  it("puts an open name back to unknown", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(openRow({ decision: "PICK", decidedById: 42, mlbId: 124605, mlbName: "Jaret Wright", decidedBy: { name: "Mike", isAdmin: false, franchiseMemberships: [] } }));
    await appAs(MEMBER).delete("/api/archive/player-check/10/decision").expect(200);
    expect(db.historicalPlayerMatch.update.mock.calls[0][0].data).toEqual({ decision: null, decidedById: null, decidedAt: null, mlbId: null, mlbName: null });
  });

  it("does nothing when there is no decision to undo", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(openRow());
    const res = await appAs(MEMBER).delete("/api/archive/player-check/10/decision").expect(200);
    expect(res.body.item.decision).toBeNull();
    expect(db.historicalPlayerMatch.update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("does not let a member undo the commissioner's decision", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(openRow({ decision: "PICK", decidedById: 1, mlbId: 124605, mlbName: "Jaret Wright", decidedBy: { name: "James", isAdmin: true, franchiseMemberships: [] } }));
    await appAs(MEMBER).delete("/api/archive/player-check/10/decision").expect(403);
    expect(db.historicalPlayerMatch.update).not.toHaveBeenCalled();
  });
});

describe("GET /api/archive/player-check/:id/search", () => {
  it("searches for the name's own season and slots", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(openRow());
    search.mockResolvedValue({ candidates: wrights, more: false });
    const res = await appAs(MEMBER).get("/api/archive/player-check/10/search").query({ q: "  wright " }).expect(200);
    expect(search).toHaveBeenCalledWith("wright", { year: 2004, slots: ["P"], role: "P", keptFromSlot: "P" });
    expect(db.historicalPlayerMatch.findFirst.mock.calls[0][0].where).toEqual(notVerified(MEMBER_SCOPE, { id: 10 }));
    expect(PlayerCheckSearchResponseSchema.parse(res.body)).toEqual(res.body);
    expect(res.body).toEqual({ candidates: wrights, more: false });
  });

  it("asks for at least three letters before calling MLB", async () => {
    const res = await appAs(MEMBER).get("/api/archive/player-check/10/search").query({ q: "j. w" }).expect(400);
    expect(res.body.error).toMatch(/at least 3 letters/);
    expect(search).not.toHaveBeenCalled();
    expect(db.historicalPlayerMatch.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 for a name outside the viewer's archive", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(null);
    await appAs(MEMBER).get("/api/archive/player-check/10/search").query({ q: "wright" }).expect(404);
    expect(search).not.toHaveBeenCalled();
  });

  it("reports an MLB outage as 502", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(openRow());
    search.mockRejectedValue(new Error("MLB API circuit breaker open"));
    const res = await appAs(MEMBER).get("/api/archive/player-check/10/search").query({ q: "wright" }).expect(502);
    expect(res.body.error).toMatch(/player search/);
  });
});

describe("who is let onto the player check", () => {
  beforeEach(() => {
    db.historicalSeason.findMany.mockResolvedValue([]);
    db.historicalPlayerMatch.groupBy.mockResolvedValue([]);
    db.historicalPlayerMatch.findMany.mockResolvedValue([]);
  });

  it("refuses a league member nobody gave access, before reading any names", async () => {
    db.franchiseMembership.findMany.mockResolvedValue([]);
    const res = await appAs(MEMBER).get("/api/archive/player-check").expect(403);
    expect(res.body.error).toMatch(/turn on player-check access/);
    await appAs(MEMBER).put("/api/archive/player-check/10/decision").send({ decision: "NONE" }).expect(403);
    expect(db.franchiseMembership.findMany).toHaveBeenCalledWith({
      where: { userId: 42, archiveAudit: { not: "NONE" } },
      select: { franchiseId: true, archiveAudit: true },
    });
    expect(db.historicalPlayerMatch.findMany).not.toHaveBeenCalled();
    expect(db.historicalPlayerMatch.findFirst).not.toHaveBeenCalled();
  });

  it("gives an owner set to own-team who owns no team nothing, not everything", async () => {
    db.teamOwnership.findMany.mockResolvedValue([]);
    await appAs(MEMBER).get("/api/archive/player-check").expect(403);
  });

  it("shows the commissioner every name in his franchise, with final say", async () => {
    const res = await appAs(COMMISH).get("/api/archive/player-check").expect(200);
    expect(db.historicalPlayerMatch.findMany.mock.calls[0][0].where).toEqual(notVerified(COMMISH_SCOPE));
    expect(db.teamOwnership.findMany).not.toHaveBeenCalled();
    expect(res.body.viewer).toEqual({ isAdmin: false, final: true, level: "ALL", teamCodes: null });
  });

  it("lets the commissioner change what a site admin decided", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(openRow({ decision: "PICK", decidedById: 1, mlbId: 124605, mlbName: "Jaret Wright", decidedBy: { name: "James", isAdmin: true, franchiseMemberships: [] } }));
    await appAs(COMMISH).put("/api/archive/player-check/10/decision").send({ decision: "NONE" }).expect(200);
  });

  it("locks the commissioner's decision against an owner", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(openRow({ decision: "PICK", decidedById: 26, mlbId: 124605, mlbName: "Jaret Wright", decidedBy: byFinal }));
    await appAs(MEMBER).put("/api/archive/player-check/10/decision").send({ decision: "NONE" }).expect(403);
    await appAs(MEMBER).delete("/api/archive/player-check/10/decision").expect(403);
    expect(db.historicalPlayerMatch.update).not.toHaveBeenCalled();
  });

  it("asks only for the commissioner's ALL memberships when working out who decided", async () => {
    db.historicalPlayerMatch.findFirst.mockResolvedValue(openRow());
    await appAs(MEMBER).put("/api/archive/player-check/10/decision").send({ decision: "PICK", mlbId: 124604 }).expect(200);
    expect(db.historicalPlayerMatch.findFirst.mock.calls[0][0].include.decidedBy).toEqual({
      select: { name: true, isAdmin: true, franchiseMemberships: { where: { archiveAudit: "ALL" }, select: { id: true } } },
    });
  });
});
