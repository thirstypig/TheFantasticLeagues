import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Direct tests of the errorBuffer module ────────────────────────

import {
  push,
  list,
  find,
  clear,
  BUFFER_CAPACITY,
  type AdminErrorRecord,
} from "../../../lib/errorBuffer.js";

function makeRecord(overrides: Partial<AdminErrorRecord> = {}): AdminErrorRecord {
  return {
    ref: `ERR-${overrides.requestId ?? "test1234"}`,
    requestId: overrides.requestId ?? "test1234",
    message: "Boom",
    stack: null,
    path: "/api/foo",
    method: "GET",
    userId: null,
    userEmail: null,
    statusCode: 500,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("errorBuffer module", () => {
  beforeEach(() => clear());

  it("stores records newest-first", () => {
    push(makeRecord({ requestId: "aaa" }));
    push(makeRecord({ requestId: "bbb" }));
    push(makeRecord({ requestId: "ccc" }));

    const items = list();
    expect(items.map((r) => r.requestId)).toEqual(["ccc", "bbb", "aaa"]);
  });

  it("bounds to the capacity, evicting oldest", () => {
    for (let i = 0; i < BUFFER_CAPACITY + 5; i++) {
      push(makeRecord({ requestId: `r${i}` }));
    }
    const items = list();
    expect(items).toHaveLength(BUFFER_CAPACITY);
    // Newest is rN, oldest surviving should be r5 (0..4 evicted)
    expect(items[0].requestId).toBe(`r${BUFFER_CAPACITY + 4}`);
    expect(items[items.length - 1].requestId).toBe("r5");
  });

  it("find() accepts both ERR-prefix and bare requestId", () => {
    push(makeRecord({ requestId: "abc123" }));

    const prefixed = find("ERR-abc123");
    const bare = find("abc123");

    expect(prefixed).not.toBeNull();
    expect(bare).not.toBeNull();
    expect(prefixed?.requestId).toBe("abc123");
    expect(bare?.requestId).toBe("abc123");
  });

  it("find() returns null when missing", () => {
    expect(find("nope")).toBeNull();
    expect(find("ERR-nope")).toBeNull();
  });

  it("find() returns null for empty input", () => {
    expect(find("")).toBeNull();
  });

  it("list() returns a shallow copy (mutations don't leak)", () => {
    push(makeRecord({ requestId: "one" }));
    const snapshot = list();
    snapshot.pop();
    expect(list()).toHaveLength(1);
  });
});

// ── HTTP endpoint tests ────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    user: { count: vi.fn() },
    league: { count: vi.fn() },
    season: { groupBy: vi.fn() },
    aiInsight: { count: vi.fn(), findFirst: vi.fn() },
    auditLog: { findMany: vi.fn(), count: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));

let isAdminFlag = true;
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: any, res: any, next: () => void) => {
    if (!isAdminFlag) return res.status(403).json({ error: "Forbidden" });
    return next();
  }),
}));
vi.mock("../../../middleware/validate.js", () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next),
}));
vi.mock("../../commissioner/services/CommissionerService.js", () => ({
  CommissionerService: class {
    createLeague = vi.fn();
    addMember = vi.fn();
    importRosters = vi.fn();
  },
}));
vi.mock("../../players/services/mlbSyncService.js", () => ({
  syncAllPlayers: vi.fn(),
  syncPositionEligibility: vi.fn(),
  syncAAARosters: vi.fn(),
  enrichStalePlayers: vi.fn(),
}));
vi.mock("../../players/services/mlbStatsSyncService.js", () => ({
  syncPeriodStats: vi.fn(),
  syncAllActivePeriods: vi.fn(),
}));
vi.mock("../../../lib/schemas.js", () => ({ addMemberSchema: { parse: vi.fn() } }));

import express from "express";
import { adminRouter } from "../routes.js";
import supertest from "supertest";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: NextFunction) => {
    req.user = { id: 1, isAdmin: isAdminFlag, email: "admin@test.com" };
    next();
  });
  app.use(adminRouter);
  return app;
}

describe("GET /admin/errors", () => {
  beforeEach(() => {
    clear();
    isAdminFlag = true;
  });

  it("returns the ring buffer contents with bufferSize + bufferCapacity", async () => {
    push(makeRecord({ requestId: "aaa" }));
    push(makeRecord({ requestId: "bbb" }));

    const res = await supertest(makeApp()).get("/admin/errors");
    expect(res.status).toBe(200);
    expect(res.body.bufferCapacity).toBe(BUFFER_CAPACITY);
    expect(res.body.bufferSize).toBe(2);
    expect(res.body.errors).toHaveLength(2);
    expect(res.body.errors[0].requestId).toBe("bbb"); // newest-first
  });

  it("returns empty list when the buffer is empty", async () => {
    const res = await supertest(makeApp()).get("/admin/errors");
    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body.bufferSize).toBe(0);
  });

  it("returns 403 for non-admin users", async () => {
    isAdminFlag = false;
    const res = await supertest(makeApp()).get("/admin/errors");
    expect(res.status).toBe(403);
  });
});

describe("GET /admin/errors/:ref", () => {
  beforeEach(() => {
    clear();
    isAdminFlag = true;
  });

  it("returns the record when found via ERR-prefixed ref", async () => {
    push(makeRecord({ requestId: "abc123", message: "Boom!" }));

    const res = await supertest(makeApp()).get("/admin/errors/ERR-abc123");
    expect(res.status).toBe(200);
    expect(res.body.error).not.toBeNull();
    expect(res.body.error.requestId).toBe("abc123");
    expect(res.body.error.message).toBe("Boom!");
  });

  it("returns the record when looked up by bare ref (no prefix)", async () => {
    push(makeRecord({ requestId: "abc123" }));

    const res = await supertest(makeApp()).get("/admin/errors/abc123");
    expect(res.status).toBe(200);
    expect(res.body.error).not.toBeNull();
    expect(res.body.error.requestId).toBe("abc123");
  });

  it("returns 200 with null + note when ref is not in buffer", async () => {
    const res = await supertest(makeApp()).get("/admin/errors/ERR-nope");
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(typeof res.body.note).toBe("string");
    expect(res.body.note).toMatch(/ring buffer/i);
  });

  it("returns 403 for non-admin users", async () => {
    isAdminFlag = false;
    const res = await supertest(makeApp()).get("/admin/errors/ERR-whatever");
    expect(res.status).toBe(403);
  });
});
