import { Resend } from "resend";
import { logger } from "./logger.js";
import { prisma } from "../db/prisma.js";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = "The Fantastic Leagues <noreply@thefantasticleagues.com>";
const APP_URL = process.env.APP_URL || "https://thefantasticleagues.com";

/* ── Shared HTML template ─────────────────────────────────────────── */

function emailWrapper(body: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 24px;">⚾</span>
        <span style="font-size: 16px; font-weight: 700; color: #002d72; margin-left: 8px;">The Fantastic Leagues</span>
      </div>
      ${body}
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center;">
        <a href="${APP_URL}" style="color: #6366f1; text-decoration: none;">thefantasticleagues.com</a>
      </div>
    </div>
  `;
}

function actionButton(text: string, url: string): string {
  return `<a href="${url}" style="display: inline-block; background: #002d72; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-top: 16px;">${text}</a>`;
}

/* ── Shared headers ───────────────────────────────────────────────── */

const LIST_UNSUB = { "List-Unsubscribe": `<mailto:unsubscribe@thefantasticleagues.com>` };

/* ── Recipient resolution ─────────────────────────────────────────── */

export async function getTeamOwnerEmails(teamId: number): Promise<{ email: string; name: string; userId: number }[]> {
  // Multi-owner support via TeamOwnership
  const ownerships = await prisma.teamOwnership.findMany({
    where: { teamId },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (ownerships.length > 0) {
    return ownerships.map(o => ({ email: o.user.email, name: o.user.name ?? "", userId: o.user.id }));
  }

  // Fallback: Team.ownerUserId (legacy single-owner)
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { ownerUser: { select: { id: true, email: true, name: true } } },
  });
  if (team?.ownerUser) {
    return [{ email: team.ownerUser.email, name: team.ownerUser.name ?? "", userId: team.ownerUser.id }];
  }

  return [];
}

export async function getLeagueMemberEmails(leagueId: number): Promise<{ email: string; name: string; userId: number }[]> {
  const members = await prisma.leagueMembership.findMany({
    where: { leagueId },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  return members.map(m => ({ email: m.user.email, name: m.user.name ?? "", userId: m.user.id }));
}

/* ── Notify team owners helper (fire-and-forget) ─────────────────── */

export async function notifyTeamOwners(
  teamIds: number[],
  excludeUserId: number,
  sendFn: (owner: { email: string; name: string }) => Promise<void>,
): Promise<void> {
  for (const tid of teamIds) {
    try {
      const owners = await getTeamOwnerEmails(tid);
      for (const owner of owners) {
        if (owner.userId === excludeUserId) continue;
        await sendFn(owner);
      }
    } catch { /* fire-and-forget */ }
  }
}

/* ── Send helper (fire-and-forget, never throws) ──────────────────── */

async function sendEmail(to: string, subject: string, html: string, tag: string): Promise<void> {
  if (!resend) {
    logger.warn({ tag }, "RESEND_API_KEY not set — skipping email");
    return;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html, headers: LIST_UNSUB });
    logger.info({ to, tag }, "Email sent");
  } catch (err) {
    logger.warn({ err, to, tag }, "Failed to send email");
  }
}

/* ── Email functions ──────────────────────────────────────────────── */

/**
 * Send a league invite email. Fire-and-forget — never throws.
 */
/**
 * Dead-man's-switch alert: one or more ingestion jobs have had no SUCCESSFUL
 * run inside their window (todo #299).
 *
 * This is the durable half of the alerting the todo asks for. `lib/errorBuffer.ts`
 * is a 100-entry in-memory ring wiped on every restart, so an alarm raised there
 * disappears exactly when a crash-looping process would raise it. Email survives
 * the restart.
 */
export async function sendStaleJobAlertEmail(opts: {
  to: string;
  stale: { job: string; hoursSince: number | null; reason: string }[];
}) {
  const { to, stale } = opts;
  const rows = stale
    .map(
      (s) => `<tr>
        <td style="padding:6px 12px 6px 0; font-family:monospace;">${escapeHtml(s.job)}</td>
        <td style="padding:6px 12px 6px 0;">${escapeHtml(s.reason)}</td>
        <td style="padding:6px 0;">${s.hoursSince === null ? "never" : `${s.hoursSince.toFixed(1)}h ago`}</td>
      </tr>`,
    )
    .join("");
  await sendEmail(
    to,
    sanitizeSubject(`[FBST] ${stale.length} ingestion job(s) not running`),
    emailWrapper(`
      <h2 style="margin: 0 0 16px; font-size: 20px;">Ingestion jobs are not completing</h2>
      <p style="margin: 0 0 12px; font-size: 15px; color: #444; line-height: 1.5;">
        The following scheduled jobs have had no <strong>successful</strong> run
        inside their expected window. A job that is failing repeatedly still counts
        as stale — recent execution is not the same as recent success.
      </p>
      <table style="border-collapse:collapse; font-size:14px; margin:0 0 16px;">
        <tr style="text-align:left; color:#888;">
          <th style="padding:0 12px 6px 0;">Job</th><th style="padding:0 12px 6px 0;">Reason</th><th style="padding:0 0 6px;">Last success</th>
        </tr>
        ${rows}
      </table>
      <p style="margin: 0 0 12px; font-size: 13px; color: #888;">
        Stored data may be stale. Check the JobRun table and the Railway logs.
      </p>
    `),
    "stale-job-alert",
  );
}

export async function sendInviteEmail(opts: {
  to: string;
  leagueName: string;
  role: string;
  inviterName: string;
}) {
  const { to, leagueName, role, inviterName } = opts;
  await sendEmail(
    to,
    sanitizeSubject(`You're invited to ${leagueName}`),
    emailWrapper(`
      <h2 style="margin: 0 0 16px; font-size: 20px;">You've been invited to ${escapeHtml(leagueName)}</h2>
      <p style="margin: 0 0 12px; font-size: 15px; color: #444; line-height: 1.5;">
        <strong>${escapeHtml(inviterName)}</strong> has invited you to join
        <strong>${escapeHtml(leagueName)}</strong> as ${article(role)} <strong>${role}</strong>.
      </p>
      <p style="margin: 0 0 16px; font-size: 15px; color: #444; line-height: 1.5;">
        Sign up or log in to accept your invite — you'll be added to the league automatically.
      </p>
      ${actionButton("Join the League", `${APP_URL}/signup`)}
      <p style="margin: 16px 0 0; font-size: 13px; color: #888;">
        This invite expires in 30 days. If you already have an account, just
        <a href="${APP_URL}/login" style="color: #6366f1;">log in</a>.
      </p>
    `),
    "invite",
  );
}

/**
 * Notify counterparty team owners that a trade has been proposed.
 */
export async function sendTradeProposedEmail(opts: {
  to: string;
  recipientName: string;
  proposerTeamName: string;
  leagueName: string;
  playersSummary: string;
  leagueId: number;
}) {
  const { to, recipientName, proposerTeamName, leagueName, playersSummary, leagueId } = opts;
  await sendEmail(
    to,
    sanitizeSubject(`Trade proposal from ${proposerTeamName}`),
    emailWrapper(`
      <h2 style="margin: 0 0 16px; font-size: 20px;">New Trade Proposal</h2>
      <p style="margin: 0 0 12px; font-size: 15px; color: #444; line-height: 1.5;">
        Hi ${escapeHtml(recipientName || "there")},
      </p>
      <p style="margin: 0 0 12px; font-size: 15px; color: #444; line-height: 1.5;">
        <strong>${escapeHtml(proposerTeamName)}</strong> has proposed a trade in <strong>${escapeHtml(leagueName)}</strong>.
      </p>
      <div style="background: #f8fafc; border-radius: 8px; padding: 12px 16px; margin: 12px 0; font-size: 14px; color: #334155;">
        ${escapeHtml(playersSummary)}
      </div>
      ${actionButton("View Trade", `${APP_URL}/activity?leagueId=${leagueId}`)}
    `),
    "trade-proposed",
  );
}

/**
 * Notify all trade parties that a trade was executed.
 */
export async function sendTradeProcessedEmail(opts: {
  to: string;
  recipientName: string;
  summary: string;
  leagueName: string;
  leagueId: number;
}) {
  const { to, recipientName, summary, leagueName, leagueId } = opts;
  await sendEmail(
    to,
    sanitizeSubject(`Trade executed in ${leagueName}`),
    emailWrapper(`
      <h2 style="margin: 0 0 16px; font-size: 20px;">Trade Executed</h2>
      <p style="margin: 0 0 12px; font-size: 15px; color: #444; line-height: 1.5;">
        Hi ${escapeHtml(recipientName || "there")}, a trade has been processed in <strong>${escapeHtml(leagueName)}</strong>.
      </p>
      <div style="background: #f0fdf4; border-radius: 8px; padding: 12px 16px; margin: 12px 0; font-size: 14px; color: #166534;">
        ${escapeHtml(summary)}
      </div>
      ${actionButton("View Details", `${APP_URL}/activity?leagueId=${leagueId}`)}
    `),
    "trade-processed",
  );
}

/**
 * Notify all trade parties that a trade was vetoed.
 */
export async function sendTradeVetoedEmail(opts: {
  to: string;
  recipientName: string;
  leagueName: string;
  leagueId: number;
}) {
  const { to, recipientName, leagueName, leagueId } = opts;
  await sendEmail(
    to,
    sanitizeSubject(`Trade vetoed in ${leagueName}`),
    emailWrapper(`
      <h2 style="margin: 0 0 16px; font-size: 20px;">Trade Vetoed</h2>
      <p style="margin: 0 0 12px; font-size: 15px; color: #444; line-height: 1.5;">
        Hi ${escapeHtml(recipientName || "there")}, a trade in <strong>${escapeHtml(leagueName)}</strong> has been vetoed by the commissioner.
      </p>
      ${actionButton("View Activity", `${APP_URL}/activity?leagueId=${leagueId}`)}
    `),
    "trade-vetoed",
  );
}

/**
 * Notify a team owner of their waiver claim result.
 */
export async function sendWaiverResultEmail(opts: {
  to: string;
  recipientName: string;
  playerName: string;
  position: string;
  success: boolean;
  bidAmount: number;
  leagueName: string;
  leagueId: number;
}) {
  const { to, recipientName, playerName, position, success, bidAmount, leagueName, leagueId } = opts;
  const subject = sanitizeSubject(success
    ? `You won ${playerName} on waivers!`
    : `Waiver bid for ${playerName} failed`);
  const body = success
    ? `<p style="margin: 0 0 12px; font-size: 15px; color: #166534; line-height: 1.5;">
        Congratulations! You won <strong>${escapeHtml(playerName)}</strong> (${escapeHtml(position)}) for <strong>$${bidAmount}</strong> in <strong>${escapeHtml(leagueName)}</strong>.
      </p>`
    : `<p style="margin: 0 0 12px; font-size: 15px; color: #991b1b; line-height: 1.5;">
        Your waiver bid of <strong>$${bidAmount}</strong> for <strong>${escapeHtml(playerName)}</strong> (${escapeHtml(position)}) in <strong>${escapeHtml(leagueName)}</strong> was not successful.
      </p>`;

  await sendEmail(
    to,
    subject,
    emailWrapper(`
      <h2 style="margin: 0 0 16px; font-size: 20px;">${success ? "Waiver Claim Won" : "Waiver Claim Failed"}</h2>
      <p style="margin: 0 0 12px; font-size: 15px; color: #444; line-height: 1.5;">
        Hi ${escapeHtml(recipientName || "there")},
      </p>
      ${body}
      ${actionButton("View Activity", `${APP_URL}/activity?leagueId=${leagueId}`)}
    `),
    success ? "waiver-success" : "waiver-failed",
  );
}

/* ── Batch email helper (with delay to avoid Resend rate limits) ──── */

export async function sendBatchEmails(
  emails: { to: string; subject: string; html: string; tag: string }[],
  delayMs = 100,
): Promise<void> {
  for (const e of emails) {
    await sendEmail(e.to, e.subject, e.html, e.tag);
    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
  }
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sanitizeSubject(s: string): string {
  return s.replace(/[\r\n]/g, "").slice(0, 200);
}

function article(role: string): string {
  return /^[aeiou]/i.test(role) ? "an" : "a";
}
