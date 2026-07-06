import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import supertest from "supertest";

// Test the ROUTE wiring, not the service (service.test.ts covers that).
const { mockSubscribe } = vi.hoisted(() => ({ mockSubscribe: vi.fn() }));
vi.mock("../service.js", () => ({ subscribe: (...a: any[]) => mockSubscribe(...a) }));
// Rate limiter → passthrough: express-rate-limit is library behavior, and its
// in-memory counter would make these tests order-dependent/flaky.
vi.mock("express-rate-limit", () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

import { subscribersRouter } from "../routes.js";

const app = express();
app.use(express.json());
app.use("/api/public", subscribersRouter);

beforeEach(() => vi.clearAllMocks());

describe("POST /api/public/subscribe", () => {
  it("maps the hidden `website` field to the honeypot argument", async () => {
    mockSubscribe.mockResolvedValue({ ok: true, message: "ok" });
    await supertest(app).post("/api/public/subscribe").send({ email: "a@b.com", website: "bot-filled-this" });
    expect(mockSubscribe).toHaveBeenCalledWith({ email: "a@b.com", honeypot: "bot-filled-this" });
  });

  it("returns 200 + body when the service accepts", async () => {
    mockSubscribe.mockResolvedValue({ ok: true, message: "Check your inbox to confirm." });
    const res = await supertest(app).post("/api/public/subscribe").send({ email: "a@b.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, message: "Check your inbox to confirm." });
  });

  it("returns 400 when the service rejects (bad email)", async () => {
    mockSubscribe.mockResolvedValue({ ok: false, error: "Please enter a valid email address." });
    const res = await supertest(app).post("/api/public/subscribe").send({ email: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("coerces a missing/non-string email to '' and honeypot to null", async () => {
    mockSubscribe.mockResolvedValue({ ok: false, error: "x" });
    await supertest(app).post("/api/public/subscribe").send({ email: 12345 });
    expect(mockSubscribe).toHaveBeenCalledWith({ email: "", honeypot: null });
  });

  it("returns a generic 500 on unexpected error — never leaks internals", async () => {
    mockSubscribe.mockRejectedValue(new Error("Prisma: relation \"Subscriber\" blew up"));
    const res = await supertest(app).post("/api/public/subscribe").send({ email: "a@b.com" });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ ok: false, error: "Something went wrong. Please try again." });
    expect(JSON.stringify(res.body)).not.toContain("Subscriber");
  });
});
