import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    rosterEntry: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));

import { prisma } from "../../../db/prisma.js";

const mockPrisma = prisma as any;

// ── Express test app ─────────────────────────────────────────────

import express from "express";
import { rosterImportRouter } from "../rosterImport-routes.js";
import supertest from "supertest";

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 1, isAdmin: true };
  next();
});
app.use(rosterImportRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  res.status(500).json({ error: "Internal Server Error" });
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── POST /import ─────────────────────────────────────────────────

describe("POST /import", () => {
  it("imports CSV and creates new entries", async () => {
    mockPrisma.rosterEntry.findFirst.mockResolvedValue(null); // no existing
    mockPrisma.rosterEntry.create.mockResolvedValue({});

    const csv = "teamCode,playerName,position,mlbTeam,acquisitionCost\nABC,Mike Trout,CF,LAA,45\nABC,Mookie Betts,OF,LAD,38";

    const res = await supertest(app)
      .post("/import")
      .attach("file", Buffer.from(csv), "roster.csv")
      .field("year", "2026");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.created).toBe(2);
    expect(res.body.updated).toBe(0);
  });

  it("updates existing entries on reimport", async () => {
    mockPrisma.rosterEntry.findFirst.mockResolvedValue({ id: 1 }); // existing
    mockPrisma.rosterEntry.update.mockResolvedValue({});

    const csv = "teamCode,playerName,position,mlbTeam,acquisitionCost\nABC,Mike Trout,CF,LAA,50";

    const res = await supertest(app)
      .post("/import")
      .attach("file", Buffer.from(csv), "roster.csv")
      .field("year", "2026");

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(0);
    expect(res.body.updated).toBe(1);
  });

  it("returns 400 when no file uploaded", async () => {
    const res = await supertest(app).post("/import");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("No file");
  });
});

// ── GET /import/template ─────────────────────────────────────────

describe("GET /import/template", () => {
  it("returns CSV template", async () => {
    const res = await supertest(app).get("/import/template");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("teamCode,playerName,position");
  });
});
