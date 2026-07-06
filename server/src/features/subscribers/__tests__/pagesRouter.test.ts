import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import supertest from "supertest";

// Test the outcome→page wiring; service.test.ts covers the DB logic.
const { mockConfirm, mockUnsub } = vi.hoisted(() => ({ mockConfirm: vi.fn(), mockUnsub: vi.fn() }));
vi.mock("../service.js", () => ({
  confirmByToken: (...a: any[]) => mockConfirm(...a),
  unsubscribeByToken: (...a: any[]) => mockUnsub(...a),
}));

import { subscriberPagesRouter } from "../pagesRouter.js";

const app = express();
app.use(subscriberPagesRouter);

beforeEach(() => vi.clearAllMocks());

describe("GET /confirm", () => {
  it("reads token from the query and renders the confirmed page (html)", async () => {
    mockConfirm.mockResolvedValue("confirmed");
    const res = await supertest(app).get("/confirm?token=abc123");
    expect(mockConfirm).toHaveBeenCalledWith("abc123");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("You're confirmed"); // raw HTML, apostrophe not escaped
  });

  it("renders the expired page on 'expired'", async () => {
    mockConfirm.mockResolvedValue("expired");
    const res = await supertest(app).get("/confirm?token=old");
    expect(res.text).toContain("has expired");
  });

  it("renders the invalid page on 'invalid'", async () => {
    mockConfirm.mockResolvedValue("invalid");
    const res = await supertest(app).get("/confirm?token=nope");
    expect(res.text).toContain("valid anymore");
  });

  it("never 500s — a thrown service error still renders the invalid page", async () => {
    mockConfirm.mockRejectedValue(new Error("db down"));
    const res = await supertest(app).get("/confirm?token=x");
    expect(res.status).toBe(200);
    expect(res.text).toContain("valid anymore");
  });

  it("passes empty string when the token is missing", async () => {
    mockConfirm.mockResolvedValue("invalid");
    await supertest(app).get("/confirm");
    expect(mockConfirm).toHaveBeenCalledWith("");
  });
});

describe("GET /unsubscribe", () => {
  it("reads token from query and renders the unsubscribed page", async () => {
    mockUnsub.mockResolvedValue("unsubscribed");
    const res = await supertest(app).get("/unsubscribe?token=u1");
    expect(mockUnsub).toHaveBeenCalledWith("u1");
    expect(res.status).toBe(200);
    expect(res.text).toContain("unsubscribed");
  });

  it("renders the invalid page for an unknown token", async () => {
    mockUnsub.mockResolvedValue("invalid");
    const res = await supertest(app).get("/unsubscribe?token=bad");
    expect(res.text).toContain("valid anymore");
  });
});
