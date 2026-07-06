// Sends the single double-opt-in confirmation email for the marketing list.
// Uses the alephco.io sender (verified on Resend) — deliberately separate from
// the app's transactional sender (noreply@thefantasticleagues.com). No
// newsletters here: this file only ever sends the confirmation.
import { Resend } from "resend";
import { logger } from "../../../lib/logger.js";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM = "The Fantastic Leagues <hello@alephco.io>";
/** Where confirm/unsubscribe links live (the app server hosts those routes). */
const APP_URL = process.env.APP_URL || "https://app.thefantasticleagues.com";

export function confirmUrl(token: string): string {
  return `${APP_URL}/confirm?token=${encodeURIComponent(token)}`;
}
export function unsubscribeUrl(token: string): string {
  return `${APP_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
}

function html(confirmLink: string, unsubLink: string): string {
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a2e">
    <h1 style="font-size:20px;margin:0 0 16px">Confirm your email ⚾</h1>
    <p style="font-size:15px;line-height:1.5">Thanks for signing up for updates from <b>The Fantastic Leagues</b>. Click below to confirm — that's the only step.</p>
    <p style="margin:24px 0">
      <a href="${confirmLink}" style="background:#16794e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">Confirm my email</a>
    </p>
    <p style="font-size:13px;color:#6b7280;line-height:1.5">This link expires in 24 hours. If you didn't request this, you can ignore this email — nothing will happen. Or <a href="${unsubLink}" style="color:#6b7280">unsubscribe</a>.</p>
  </div>`;
}

/**
 * Send the confirmation email. Returns true on send, false if Resend isn't
 * configured (dev without a key) — the caller treats the signup as accepted
 * either way so behavior is uniform.
 */
export async function sendConfirmationEmail(
  to: string,
  confirmationToken: string,
  unsubscribeToken: string,
): Promise<boolean> {
  if (!resend) {
    logger.warn({ to }, "subscriberMailer: RESEND_API_KEY not set — skipping confirmation email");
    return false;
  }
  const cLink = confirmUrl(confirmationToken);
  const uLink = unsubscribeUrl(unsubscribeToken);
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: "Confirm your email — The Fantastic Leagues",
      html: html(cLink, uLink),
      headers: { "List-Unsubscribe": `<${uLink}>` },
    });
    return true;
  } catch (err) {
    logger.error({ to, err: err instanceof Error ? err.message : String(err) },
      "subscriberMailer: confirmation email send failed");
    return false;
  }
}
