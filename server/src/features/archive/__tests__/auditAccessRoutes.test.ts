import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import supertest from "supertest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    franchiseMembership: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    teamOwnership: { findMany: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
// The real requireAdmin's rule (403 unless isAdmin), so the test exercises the gate.
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => (req.user ? next() : res.status(401).end()),
  requireAdmin: (req: Request, res: Response, next: NextFunction) =>
    (req.user as { isAdmin?: boolean } | undefined)?.isAdmin ? next() : res.status(403).json({ error: "Admin only" }),
  requireLeagueMember: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import { AuditAccessListResponseSchema, AuditAccessMeResponseSchema } from "../../../../../shared/api/archivePlayerCheck.js";
import { prisma } from "../../../db/prisma.js";
import { writeAuditLog } from "../../../lib/auditLog.js";
import { archiveRouter } from "../routes.js";

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  franchiseMembership: { findFirst: Fn; findMany: Fn; update: Fn };
  teamOwnership: { findMany: Fn };
};
const audit = writeAuditLog as unknown as Fn;

const ADMIN = { id: 1, isAdmin: true };
const KURT = { id: 13, isAdmin: false };
const HAS_ARCHIVE = { leagues: { some: { historicalSeasons: { some: {} } } } };

function appAs(user: { id: number; isAdmin: boolean }) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = user;
    next();
  });
  app.use("/api", archiveRouter);
  return supertest(app);
}

beforeEach(() => {
  vi.resetAllMocks();
  db.franchiseMembership.findFirst.mockResolvedValue({ id: 7 }); // passes the archive's members-only guard
});

describe("GET /api/archive/audit-access/me", () => {
  it("tells an owner set to own-team which franchises he may check", async () => {
    db.franchiseMembership.findMany.mockResolvedValue([{ franchiseId: 1, archiveAudit: "OWN_TEAM" }]);
    db.teamOwnership.findMany.mockResolvedValue([{ team: { code: "DDG" } }]);
    const res = await appAs(KURT).get("/api/archive/audit-access/me").expect(200);
    expect(AuditAccessMeResponseSchema.parse(res.body)).toEqual({ level: "OWN_TEAM", teamCodes: ["DDG"] });
  });

  it("says no access, not 403, to a member nobody let in (the archive page just hides the link)", async () => {
    db.franchiseMembership.findMany.mockResolvedValue([]);
    const res = await appAs(KURT).get("/api/archive/audit-access/me").expect(200);
    expect(res.body).toEqual({ level: null, teamCodes: null });
  });

  it("gives a site admin full access without looking anything up", async () => {
    const res = await appAs(ADMIN).get("/api/archive/audit-access/me").expect(200);
    expect(res.body).toEqual({ level: "ALL", teamCodes: null });
    expect(db.franchiseMembership.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/archive/audit-access (site admin)", () => {
  it("lists every non-admin member of an archived franchise with the teams he owns there", async () => {
    db.franchiseMembership.findMany.mockResolvedValue([
      {
        id: 40, franchiseId: 1, role: "COMMISSIONER", archiveAudit: "ALL",
        user: { name: "Kent", email: "k@x", teamOwnerships: [
          { team: { code: "DMK", league: { franchiseId: 1 } } },
          { team: { code: "DMK", league: { franchiseId: 1 } } }, // same team, two seasons' leagues
          { team: { code: "ZZZ", league: { franchiseId: 2 } } }, // another franchise: not his OGBA team
        ] },
      },
      { id: 41, franchiseId: 1, role: "OWNER", archiveAudit: "NONE", user: { name: "", email: "a@x", teamOwnerships: [] } },
    ]);
    const res = await appAs(ADMIN).get("/api/archive/audit-access").expect(200);
    expect(db.franchiseMembership.findMany.mock.calls[0][0].where).toEqual({ franchise: HAS_ARCHIVE, user: { isAdmin: false } });
    expect(AuditAccessListResponseSchema.parse(res.body).members).toEqual([
      { membershipId: 41, name: "a@x", role: "OWNER", teamCodes: [], access: "NONE" },
      { membershipId: 40, name: "Kent", role: "COMMISSIONER", teamCodes: ["DMK"], access: "ALL" },
    ]);
  });

  it("is closed to anyone but a site admin, including the commissioner", async () => {
    await appAs({ id: 26, isAdmin: false }).get("/api/archive/audit-access").expect(403);
    expect(db.franchiseMembership.findMany).not.toHaveBeenCalled();
  });
});

describe("PUT /api/archive/audit-access/:membershipId (site admin)", () => {
  it("sets one member's access and logs what it replaced", async () => {
    // An admin skips the archive guard's lookup, so this is the member lookup.
    db.franchiseMembership.findFirst.mockResolvedValue({ id: 40, archiveAudit: "NONE", userId: 26 });
    await appAs(ADMIN).put("/api/archive/audit-access/40").send({ access: "ALL" }).expect(200);
    expect(db.franchiseMembership.findFirst).toHaveBeenLastCalledWith({
      where: { id: 40, franchise: HAS_ARCHIVE },
      select: { id: true, archiveAudit: true, userId: true },
    });
    expect(db.franchiseMembership.update).toHaveBeenCalledWith({ where: { id: 40 }, data: { archiveAudit: "ALL" } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1, action: "ARCHIVE_AUDIT_ACCESS", resourceId: 40,
      metadata: { memberUserId: 26, previous: "NONE", access: "ALL" },
    }));
  });

  it("refuses a member of a franchise without an archive, and a bad id", async () => {
    db.franchiseMembership.findFirst.mockResolvedValue(null);
    await appAs(ADMIN).put("/api/archive/audit-access/99").send({ access: "OWN_TEAM" }).expect(404);
    await appAs(ADMIN).put("/api/archive/audit-access/abc").send({ access: "OWN_TEAM" }).expect(404);
    expect(db.franchiseMembership.update).not.toHaveBeenCalled();
  });

  it("rejects an access level that doesn't exist", async () => {
    await appAs(ADMIN).put("/api/archive/audit-access/40").send({ access: "SUPER" }).expect(400);
  });

  it("is closed to anyone but a site admin", async () => {
    await appAs(KURT).put("/api/archive/audit-access/40").send({ access: "ALL" }).expect(403);
    expect(db.franchiseMembership.update).not.toHaveBeenCalled();
  });
});
