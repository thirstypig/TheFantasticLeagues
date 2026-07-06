// subscribe() — the server-side action behind the public signup box.
// Anti-abuse baked in: honeypot, format/disposable filter, and a DB-enforced
// per-address cooldown (the thing that stops spam-bombing a victim's inbox).
// Per-IP rate limiting is layered on at the route (routes.ts).
import crypto from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { normalizeEmail, isValidEmailFormat, isDisposableEmail } from "./lib/emailValidation.js";
import { sendConfirmationEmail } from "./lib/subscriberMailer.js";

/** Confirmation link lifetime. */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
/** Don't re-send a confirmation to the same address within this window. */
export const CONFIRMATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 min

/** Same message for every accepted case — never reveals whether an email is on
 *  the list (prevents enumeration). Only format/disposable errors differ. */
const GENERIC_SUCCESS = "Thanks! Check your inbox to confirm your email.";

export type SubscribeResult = { ok: true; message: string } | { ok: false; error: string };

/** URL-safe, unguessable token. */
function newToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function subscribe(input: { email: string; honeypot?: string | null }): Promise<SubscribeResult> {
  // 1. Honeypot: a real person never fills the hidden field. If it's filled,
  //    it's a bot — pretend success and do absolutely nothing.
  if (input.honeypot && String(input.honeypot).trim() !== "") {
    return { ok: true, message: GENERIC_SUCCESS };
  }

  // 2. Validate + normalize.
  const email = normalizeEmail(input.email ?? "");
  if (!isValidEmailFormat(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (isDisposableEmail(email)) {
    return { ok: false, error: "Please use a permanent email address." };
  }

  const now = new Date();
  const existing = await prisma.subscriber.findUnique({ where: { email } });

  // 3. Already confirmed → accept silently, send nothing.
  if (existing?.status === "confirmed") {
    return { ok: true, message: GENERIC_SUCCESS };
  }

  // 4. Cooldown (the anti-spam-bomb guard, enforced from the stored timestamp
  //    so it works on any host). A pending row whose last send was < 5 min ago
  //    gets a generic success but NO second email.
  if (
    existing &&
    existing.lastConfirmationSentAt &&
    now.getTime() - existing.lastConfirmationSentAt.getTime() < CONFIRMATION_COOLDOWN_MS
  ) {
    return { ok: true, message: GENERIC_SUCCESS };
  }

  // 5. New address, or a pending/unsubscribed one past the cooldown → issue a
  //    fresh token and (re)send. upsert closes the two-concurrent-request race
  //    on the unique email.
  const confirmationToken = newToken();
  const tokenExpiresAt = new Date(now.getTime() + TOKEN_TTL_MS);
  const unsubscribeToken = existing?.unsubscribeToken ?? newToken();

  await prisma.subscriber.upsert({
    where: { email },
    create: { email, status: "pending", confirmationToken, tokenExpiresAt, lastConfirmationSentAt: now, unsubscribeToken },
    update: { status: "pending", confirmationToken, tokenExpiresAt, lastConfirmationSentAt: now, unsubscribeToken },
  });

  await sendConfirmationEmail(email, confirmationToken, unsubscribeToken);
  return { ok: true, message: GENERIC_SUCCESS };
}

export type ConfirmOutcome = "confirmed" | "expired" | "invalid";

/**
 * Confirm a pending subscriber from their emailed token. Clears the token on
 * success (per spec — single-use). A re-click / already-confirmed lands on
 * "invalid" (the token is gone), which the page wraps in a reassuring message.
 */
export async function confirmByToken(token: string): Promise<ConfirmOutcome> {
  if (!token) return "invalid";
  const sub = await prisma.subscriber.findUnique({ where: { confirmationToken: token } });
  if (!sub) return "invalid";
  if (!sub.tokenExpiresAt || sub.tokenExpiresAt.getTime() < Date.now()) return "expired";

  await prisma.subscriber.update({
    where: { id: sub.id },
    data: { status: "confirmed", confirmedAt: new Date(), confirmationToken: null, tokenExpiresAt: null },
  });
  return "confirmed";
}

export type UnsubscribeOutcome = "unsubscribed" | "invalid";

/**
 * Unsubscribe from the emailed token. Idempotent — the unsubscribe token is
 * kept so a second click still lands on the friendly "you're unsubscribed" page.
 */
export async function unsubscribeByToken(token: string): Promise<UnsubscribeOutcome> {
  if (!token) return "invalid";
  const sub = await prisma.subscriber.findUnique({ where: { unsubscribeToken: token } });
  if (!sub) return "invalid";
  if (sub.status !== "unsubscribed") {
    await prisma.subscriber.update({
      where: { id: sub.id },
      data: { status: "unsubscribed", unsubscribedAt: new Date() },
    });
  }
  return "unsubscribed";
}
