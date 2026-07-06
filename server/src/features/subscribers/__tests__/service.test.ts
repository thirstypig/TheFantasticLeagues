import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB + mailer so we test the branching logic in isolation.
const { mockPrisma, mockSend } = vi.hoisted(() => ({
  mockPrisma: {
    subscriber: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  },
  mockSend: vi.fn(),
}));
vi.mock("../../../db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../lib/subscriberMailer.js", () => ({
  sendConfirmationEmail: (...args: any[]) => mockSend(...args),
}));

import { subscribe, confirmByToken, unsubscribeByToken, CONFIRMATION_COOLDOWN_MS } from "../service.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.subscriber.upsert.mockResolvedValue({});
  mockPrisma.subscriber.update.mockResolvedValue({});
  mockSend.mockResolvedValue(true);
});

describe("subscribe", () => {
  it("honeypot filled → silent success, NO db write, NO email", async () => {
    const r = await subscribe({ email: "real@gmail.com", honeypot: "http://spam.ru" });
    expect(r.ok).toBe(true);
    expect(mockPrisma.subscriber.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.subscriber.upsert).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("invalid email → error, no db write", async () => {
    const r = await subscribe({ email: "not-an-email" });
    expect(r).toEqual({ ok: false, error: expect.any(String) });
    expect(mockPrisma.subscriber.upsert).not.toHaveBeenCalled();
  });

  it("disposable domain → error, no db write", async () => {
    const r = await subscribe({ email: "x@mailinator.com" });
    expect(r.ok).toBe(false);
    expect(mockPrisma.subscriber.upsert).not.toHaveBeenCalled();
  });

  it("new address → upsert pending + send confirmation", async () => {
    mockPrisma.subscriber.findUnique.mockResolvedValue(null);
    const r = await subscribe({ email: "  New@Gmail.com " });
    expect(r.ok).toBe(true);
    const upsertArg = mockPrisma.subscriber.upsert.mock.calls[0][0];
    expect(upsertArg.where.email).toBe("new@gmail.com"); // normalized
    expect(upsertArg.create.status).toBe("pending");
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("already confirmed → success but send NOTHING (no enumeration, no spam)", async () => {
    mockPrisma.subscriber.findUnique.mockResolvedValue({ status: "confirmed", lastConfirmationSentAt: null });
    const r = await subscribe({ email: "member@gmail.com" });
    expect(r.ok).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockPrisma.subscriber.upsert).not.toHaveBeenCalled();
  });

  it("pending WITHIN cooldown → success but NO resend (anti spam-bomb)", async () => {
    mockPrisma.subscriber.findUnique.mockResolvedValue({
      status: "pending", lastConfirmationSentAt: new Date(Date.now() - 60_000), // 1 min ago
    });
    const r = await subscribe({ email: "pending@gmail.com" });
    expect(r.ok).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("pending PAST cooldown → resend", async () => {
    mockPrisma.subscriber.findUnique.mockResolvedValue({
      status: "pending",
      lastConfirmationSentAt: new Date(Date.now() - CONFIRMATION_COOLDOWN_MS - 1000),
      unsubscribeToken: "keep-me",
    });
    const r = await subscribe({ email: "pending@gmail.com" });
    expect(r.ok).toBe(true);
    expect(mockSend).toHaveBeenCalledOnce();
    // reuses the existing unsubscribe token rather than minting a new one
    expect(mockPrisma.subscriber.upsert.mock.calls[0][0].update.unsubscribeToken).toBe("keep-me");
  });
});

describe("confirmByToken", () => {
  it("empty token → invalid", async () => {
    expect(await confirmByToken("")).toBe("invalid");
    expect(mockPrisma.subscriber.findUnique).not.toHaveBeenCalled();
  });

  it("unknown token → invalid", async () => {
    mockPrisma.subscriber.findUnique.mockResolvedValue(null);
    expect(await confirmByToken("nope")).toBe("invalid");
  });

  it("expired token → expired, no update", async () => {
    mockPrisma.subscriber.findUnique.mockResolvedValue({ id: 1, tokenExpiresAt: new Date(Date.now() - 1000) });
    expect(await confirmByToken("old")).toBe("expired");
    expect(mockPrisma.subscriber.update).not.toHaveBeenCalled();
  });

  it("valid token → confirmed, clears token", async () => {
    mockPrisma.subscriber.findUnique.mockResolvedValue({ id: 7, tokenExpiresAt: new Date(Date.now() + 3_600_000) });
    expect(await confirmByToken("good")).toBe("confirmed");
    const data = mockPrisma.subscriber.update.mock.calls[0][0].data;
    expect(data.status).toBe("confirmed");
    expect(data.confirmationToken).toBeNull();
    expect(data.confirmedAt).toBeInstanceOf(Date);
  });
});

describe("unsubscribeByToken", () => {
  it("unknown token → invalid", async () => {
    mockPrisma.subscriber.findUnique.mockResolvedValue(null);
    expect(await unsubscribeByToken("nope")).toBe("invalid");
  });

  it("known token → unsubscribed", async () => {
    mockPrisma.subscriber.findUnique.mockResolvedValue({ id: 3, status: "confirmed" });
    expect(await unsubscribeByToken("u")).toBe("unsubscribed");
    expect(mockPrisma.subscriber.update.mock.calls[0][0].data.status).toBe("unsubscribed");
  });

  it("already unsubscribed → idempotent, no redundant update", async () => {
    mockPrisma.subscriber.findUnique.mockResolvedValue({ id: 3, status: "unsubscribed" });
    expect(await unsubscribeByToken("u")).toBe("unsubscribed");
    expect(mockPrisma.subscriber.update).not.toHaveBeenCalled();
  });
});
