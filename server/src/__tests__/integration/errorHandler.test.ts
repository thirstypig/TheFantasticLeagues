/**
 * Integration test for the global error handler patch:
 *  - populates the ring buffer in errorBuffer
 *  - emits `{ error, requestId, ref }` to all clients
 *  - additionally emits `detail` to admin clients only
 *
 * We don't boot the full server; instead we build a minimal Express app
 * that mirrors the middleware chain in src/index.ts so we can toggle
 * `req.user` per-test.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import supertest from "supertest";
import crypto from "crypto";

vi.mock("../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import * as errorBuffer from "../../lib/errorBuffer.js";

type UserShape = { id: number; isAdmin: boolean; email: string } | null;

function buildApp(currentUser: () => UserShape) {
  const app = express();

  // Mirror the request-ID middleware from src/index.ts
  app.use((req: any, res, next) => {
    req.requestId = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    res.setHeader("X-Request-Id", req.requestId);
    next();
  });

  app.use((req: any, _res, next) => {
    req.user = currentUser();
    next();
  });

  app.get("/boom", (_req, _res, next) => {
    next(new Error("kaboom"));
  });

  app.get("/boom-sync", () => {
    throw new Error("sync kaboom");
  });

  // Mirror the patched global error handler from src/index.ts
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const requestId = req.requestId ?? "unknown";
    const ref = `ERR-${requestId}`;

    errorBuffer.push({
      ref,
      requestId,
      message,
      stack: stack ? stack.slice(0, 4096) : null,
      path: req.path,
      method: req.method,
      userId: req.user?.id ?? null,
      userEmail: req.user?.email ?? null,
      statusCode: 500,
      timestamp: new Date().toISOString(),
    });

    const body: { error: string; requestId: string; ref: string; detail?: string } = {
      error: "Internal Server Error",
      requestId,
      ref,
    };
    if (req.user?.isAdmin === true) {
      body.detail = message;
    }
    res.status(500).json(body);
  });

  return app;
}

describe("Global error handler (integration)", () => {
  beforeEach(() => {
    errorBuffer.clear();
  });

  it("pushes an entry into the ring buffer on next(err)", async () => {
    const app = buildApp(() => ({ id: 1, isAdmin: false, email: "user@test.com" }));

    const res = await supertest(app).get("/boom");

    expect(res.status).toBe(500);
    const items = errorBuffer.list();
    expect(items).toHaveLength(1);
    expect(items[0].message).toBe("kaboom");
    expect(items[0].path).toBe("/boom");
    expect(items[0].method).toBe("GET");
    expect(items[0].userId).toBe(1);
    expect(items[0].userEmail).toBe("user@test.com");
    expect(items[0].statusCode).toBe(500);
    expect(items[0].ref.startsWith("ERR-")).toBe(true);
    expect(items[0].ref).toBe(`ERR-${items[0].requestId}`);
    expect(typeof items[0].timestamp).toBe("string");
  });

  it("also captures thrown (synchronous) errors", async () => {
    const app = buildApp(() => null);
    const res = await supertest(app).get("/boom-sync");
    expect(res.status).toBe(500);
    expect(errorBuffer.list()[0].message).toBe("sync kaboom");
  });

  it("returns `requestId` and `ref` to all users, but NO `detail` for non-admins", async () => {
    const app = buildApp(() => ({ id: 2, isAdmin: false, email: "plain@test.com" }));
    const res = await supertest(app).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Internal Server Error");
    expect(typeof res.body.requestId).toBe("string");
    expect(res.body.requestId.length).toBeGreaterThan(0);
    expect(res.body.ref).toBe(`ERR-${res.body.requestId}`);
    expect(res.body).not.toHaveProperty("detail");
  });

  it("includes `detail` with the raw message for admin users", async () => {
    const app = buildApp(() => ({ id: 3, isAdmin: true, email: "admin@test.com" }));
    const res = await supertest(app).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body.detail).toBe("kaboom");
    expect(res.body.ref).toBe(`ERR-${res.body.requestId}`);
  });

  it("captures userId = null when the request is unauthenticated", async () => {
    const app = buildApp(() => null);
    await supertest(app).get("/boom");

    const rec = errorBuffer.list()[0];
    expect(rec.userId).toBeNull();
    expect(rec.userEmail).toBeNull();
  });

  it("truncates stack traces to 4096 chars", async () => {
    const app = express();
    app.use((req: any, res, next) => {
      req.requestId = "fixed123";
      res.setHeader("X-Request-Id", req.requestId);
      next();
    });
    app.use((req: any, _res, next) => {
      req.user = null;
      next();
    });
    app.get("/bigstack", (_req, _res, next) => {
      const err = new Error("big");
      err.stack = "x".repeat(5000);
      next(err);
    });
    // Same global handler shape
    app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      const requestId = req.requestId ?? "unknown";
      const ref = `ERR-${requestId}`;
      errorBuffer.push({
        ref,
        requestId,
        message,
        stack: stack ? stack.slice(0, 4096) : null,
        path: req.path,
        method: req.method,
        userId: req.user?.id ?? null,
        userEmail: req.user?.email ?? null,
        statusCode: 500,
        timestamp: new Date().toISOString(),
      });
      res.status(500).json({ error: "Internal Server Error", requestId, ref });
    });

    await supertest(app).get("/bigstack");
    const rec = errorBuffer.list()[0];
    expect(rec.stack?.length).toBe(4096);
  });
});
