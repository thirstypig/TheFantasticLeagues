import { Resend } from "resend";
import { logger } from "./logger.js";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = "The Fantastic Leagues <noreply@thefantasticleagues.com>";
const APP_URL = process.env.APP_URL || "https://thefantasticleagues.com";

/**
 * Send a league invite email. Fire-and-forget — never throws.
 */
export async function sendInviteEmail(opts: {
  to: string;
  leagueName: string;
  role: string;
  inviterName: string;
}) {
  if (!resend) {
    logger.warn({}, "RESEND_API_KEY not set — skipping invite email");
    return;
  }

  const { to, leagueName, role, inviterName } = opts;

  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `You're invited to ${leagueName}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="margin: 0 0 16px; font-size: 20px; color: #1a1a2e;">
            You've been invited to ${escapeHtml(leagueName)}
          </h2>
          <p style="margin: 0 0 12px; font-size: 15px; color: #444; line-height: 1.5;">
            <strong>${escapeHtml(inviterName)}</strong> has invited you to join
            <strong>${escapeHtml(leagueName)}</strong> as ${article(role)} <strong>${role}</strong>.
          </p>
          <p style="margin: 0 0 24px; font-size: 15px; color: #444; line-height: 1.5;">
            Sign up or log in to accept your invite — you'll be added to the league automatically.
          </p>
          <a href="${APP_URL}/signup" style="display: inline-block; background: #6366f1; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600;">
            Join the League
          </a>
          <p style="margin: 24px 0 0; font-size: 13px; color: #888;">
            This invite expires in 30 days. If you already have an account, just
            <a href="${APP_URL}/login" style="color: #6366f1;">log in</a> and you'll be added automatically.
          </p>
        </div>
      `,
    });
    logger.info({ to, leagueName, role }, "Invite email sent");
  } catch (err) {
    logger.error({ err, to, leagueName }, "Failed to send invite email");
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function article(role: string): string {
  return /^[aeiou]/i.test(role) ? "an" : "a";
}
