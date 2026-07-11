---
title: "Email Notifications + Prospects Sync"
type: feat
status: active
date: 2026-04-03
---

# Email Notifications + AAA Prospects Sync

## Overview

Two features that close critical gaps in league operations:

1. **Email notifications** for trade, waiver, and commissioner events — using existing Resend infrastructure
2. **AAA prospects sync** scheduled on cron — using existing `syncAAARosters()` function

## Feature 1: Email Notification System

### Problem

League events (trades proposed, waivers processed) happen silently. Owners discover outcomes only by visiting the app. This delays trade responses, creates missed waiver windows, and reduces league engagement.

### Proposed Solution

Extend `server/src/lib/emailService.ts` with parameterized HTML email templates. Inject fire-and-forget calls into existing route handlers (same pattern as AI analysis calls at `trades/routes.ts:472`).

**Email-only for MVP.** No in-app notification center, no Notification DB model. Resend is already configured and funded.

### Events & Recipients

| Event | Trigger Location | Recipients | Template |
|-------|-----------------|------------|----------|
| Trade proposed | `trades/routes.ts` POST `/` | Counterparty team owners | "Trade proposal from {team}" |
| Trade accepted | `trades/routes.ts` POST `/:id/accept` | Proposer + other parties | "Trade accepted by {team}" |
| Trade processed | `trades/routes.ts` POST `/:id/process` | All trade parties | "Trade executed: {summary}" |
| Trade vetoed | `trades/routes.ts` POST `/:id/veto` | All trade parties | "Trade vetoed by commissioner" |
| Waiver success | `waivers/routes.ts` POST `/process/:leagueId` | Claiming team owner(s) | "You won {player} for ${bid}" |
| Waiver failed | `waivers/routes.ts` POST `/process/:leagueId` | Claiming team owner(s) | "Your bid for {player} failed" |

**Deferred (requires underlying features to be built first):**
- Period rollover — no auto-transition event exists; periods are manually managed
- Commissioner announcement — no announcement model/endpoint/UI exists yet

### Technical Approach

#### Phase 1: Email Infrastructure (`emailService.ts`)

```typescript
// server/src/lib/emailService.ts — new functions

export async function sendTradeProposedEmail(opts: {
  to: string;
  recipientName: string;
  proposerTeam: string;
  leagueName: string;
  playersSummary: string;
  tradeUrl: string;
}): Promise<void> { ... }

export async function sendTradeProcessedEmail(opts: {
  to: string;
  recipientName: string;
  summary: string;
  leagueName: string;
  aiAnalysis?: string;
}): Promise<void> { ... }

export async function sendWaiverResultEmail(opts: {
  to: string;
  recipientName: string;
  playerName: string;
  position: string;
  success: boolean;
  bidAmount: number;
  leagueName: string;
}): Promise<void> { ... }
```

**Pattern:** Follow `sendInviteEmail()` exactly — try-catch, graceful Resend key check, `logger.warn()` on failure, never throw.

**HTML template:** Shared base template function with header (TFL branding), body slot, action button, footer (unsubscribe placeholder).

**Headers:** Add `List-Unsubscribe` header to ALL emails (including existing invite emails) for Gmail/Outlook deliverability.

#### Phase 2: Recipient Resolution Helper

```typescript
// server/src/lib/emailService.ts

export async function getTeamOwnerEmails(teamId: number): Promise<{ email: string; name: string }[]> {
  // 1. Check TeamOwnership (multi-owner support)
  const ownerships = await prisma.teamOwnership.findMany({
    where: { teamId },
    include: { user: { select: { email: true, name: true } } },
  });
  if (ownerships.length > 0) return ownerships.map(o => ({ email: o.user.email, name: o.user.name ?? "" }));

  // 2. Fallback to Team.ownerUserId (legacy single-owner)
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { ownerUser: { select: { email: true, name: true } } },
  });
  if (team?.ownerUser) return [{ email: team.ownerUser.email, name: team.ownerUser.name ?? "" }];

  return []; // No owner — skip silently
}

export async function getLeagueMemberEmails(leagueId: number): Promise<{ email: string; name: string; userId: number }[]> {
  const members = await prisma.leagueMembership.findMany({
    where: { leagueId },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  return members.map(m => ({ email: m.user.email, name: m.user.name ?? "", userId: m.user.id }));
}
```

#### Phase 3: Inject into Route Handlers

**Trade proposed** (`trades/routes.ts` after line ~146):
```typescript
// Fire-and-forget: notify counterparty
const counterpartyTeamIds = [...new Set(items.filter(i => i.recipientId !== trade.proposerId).map(i => i.recipientId))];
for (const tid of counterpartyTeamIds) {
  getTeamOwnerEmails(tid).then(owners => {
    for (const owner of owners) {
      sendTradeProposedEmail({ to: owner.email, ... }).catch(err =>
        logger.warn({ error: String(err), tradeId: trade.id }, "Failed to send trade proposed email")
      );
    }
  });
}
```

**Waiver results** (`waivers/routes.ts` after line ~348):
```typescript
// Fire-and-forget: notify each team of their claim results
for (const claim of processedClaims) {
  getTeamOwnerEmails(claim.teamId).then(owners => {
    for (const owner of owners) {
      sendWaiverResultEmail({ to: owner.email, success: claim.status === "SUCCESS", ... }).catch(err =>
        logger.warn({ error: String(err), claimId: claim.id }, "Failed to send waiver result email")
      );
    }
  });
}
```

**Rate limiting:** Add 100ms delay between email sends within batch operations (waiver processing). Resend plan limits vary; fire-and-forget pattern gracefully handles 429s.

### Edge Cases

- **No owner email:** Skip silently (some teams may have no `ownerUserId` or `TeamOwnership`)
- **Self-notification:** Skip when the acting user is also a recipient (e.g., commissioner processing their own team's waivers)
- **Resend API down:** Fire-and-forget catches errors; no user-facing impact
- **Duplicate emails on retry:** Accept as low-risk; no idempotency mechanism for MVP
- **CAN-SPAM:** Trade/waiver emails are transactional (response to user action) — no opt-out required. Period rollover/announcements (deferred) would need unsubscribe.

---

## Feature 2: AAA Prospects Sync

### Problem

`syncAAARosters()` exists in `mlbSyncService.ts:479-565` but isn't scheduled. The admin manual trigger endpoint exists at `POST /api/admin/sync-prospects`. League owners can't discover minor league prospects without manual admin intervention.

### Proposed Solution

Add `syncAAARosters()` to the weekly cron schedule. This syncs ALL ~800 Triple-A roster players (not a curated "Top 100" — the MLB Stats API doesn't provide prospect rankings).

### Technical Approach

#### Cron Schedule

```typescript
// server/src/index.ts — add after existing cron jobs (line ~252)

// Weekly AAA prospects sync: Monday 14:00 UTC (~7 AM PT)
// Scheduled 2hrs after daily MLB sync to avoid Player table write conflicts
cron.schedule('0 14 * * 1', async () => {
  const season = new Date().getFullYear();
  logger.info({ season }, "Starting weekly AAA prospects sync");
  try {
    const result = await syncAAARosters(season);
    logger.info(result, "AAA prospects sync complete");
  } catch (err) {
    logger.error({ error: String(err) }, "AAA prospects sync failed");
  }
});
logger.info({}, "Scheduled weekly AAA prospects sync (Monday 14:00 UTC)");
```

**Why weekly, not daily:** AAA rosters change infrequently. Weekly reduces API calls by 85% with minimal staleness.

**Why Monday 14:00 UTC:** Runs after the daily MLB sync (12:00 UTC) with a 2-hour buffer. Monday captures weekend roster moves.

#### Position Overwrite Fix

**Bug:** `syncAAARosters()` line 539 overwrites `posPrimary` for existing FA players. A player released from a 40-man roster who's on a fantasy team could have their position changed.

**Fix:**
```typescript
// mlbSyncService.ts line 539 — change update to only set mlbTeam, not position
data: { name, mlbTeam: parentAbbr }
// Remove: posPrimary: posAbbr (only set on create, not update)
```

#### Admin Endpoint

Already exists at `POST /api/admin/sync-prospects` (admin/routes.ts:354-367). No changes needed.

### Edge Cases

- **AAA team without parent org:** Handled — defaults to `"FA"` (mlbSyncService.ts:498)
- **Player promoted to MLB same day:** MLB sync runs first (12:00), AAA sync runs 2hrs later (14:00) — AAA sync correctly skips players already on a 40-man roster
- **Rate limiting:** 200ms delay between team fetches; ~30 teams = ~6 seconds total
- **MLB API down:** Function catches per-team errors and continues; partial sync is acceptable

---

## Acceptance Criteria

### Email Notifications
- [ ] `sendTradeProposedEmail()` sends to counterparty team owners when a trade is proposed
- [ ] `sendTradeProcessedEmail()` sends to all trade parties when processed
- [ ] `sendTradeVetoedEmail()` sends to all trade parties when vetoed
- [ ] `sendWaiverResultEmail()` sends success/failure to claiming team owners
- [ ] All emails use shared HTML template with TFL branding
- [ ] All emails include `List-Unsubscribe` header
- [ ] Self-notifications are skipped (acting user doesn't get notified of their own action)
- [ ] Multi-owner teams: all co-owners receive notifications
- [ ] Missing Resend API key: logs warning, skips silently
- [ ] Email sends never block HTTP response (fire-and-forget)
- [ ] 100ms delay between batch emails (waiver processing)

### AAA Prospects Sync
- [ ] Weekly cron: Monday 14:00 UTC runs `syncAAARosters()`
- [ ] Position overwrite bug fixed (only set `posPrimary` on create, not update)
- [ ] Admin manual trigger still works (`POST /api/admin/sync-prospects`)
- [ ] Cron job logged on startup
- [ ] Success/failure logged with counts

### Testing
- [ ] Unit tests for email template functions (mock Resend)
- [ ] Unit tests for `getTeamOwnerEmails()` and `getLeagueMemberEmails()`
- [ ] Integration test: trade propose → email sent (mock Resend, verify call args)
- [ ] Server TypeScript clean

---

## Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| Resend rate limits | 100ms delay between batch sends; fire-and-forget swallows 429s |
| No unsubscribe for transactional emails | Trade/waiver emails are transactional (user-initiated); deferred features need it |
| Player table write conflicts (MLB + AAA sync) | 2-hour scheduling gap; AAA sync skips 40-man players |
| AAA position overwrite | Fix before scheduling cron |

## Files to Modify

| File | Change |
|------|--------|
| `server/src/lib/emailService.ts` | Add 4 email functions + recipient helpers + shared template |
| `server/src/features/trades/routes.ts` | Inject fire-and-forget email calls at propose/accept/process/veto |
| `server/src/features/waivers/routes.ts` | Inject fire-and-forget email calls after batch processing |
| `server/src/features/players/services/mlbSyncService.ts` | Fix position overwrite on AAA update |
| `server/src/index.ts` | Add weekly cron for `syncAAARosters()` |

## Sources & References

- **Email pattern:** `server/src/lib/emailService.ts:14-58` (sendInviteEmail)
- **Fire-and-forget:** `server/src/features/trades/routes.ts:472-475`
- **AAA sync:** `server/src/features/players/services/mlbSyncService.ts:479-565`
- **Cron setup:** `server/src/index.ts:208-252`
- **Admin endpoint:** `server/src/features/admin/routes.ts:354-367`
- **Team owner query:** `prisma/schema.prisma` Team.ownerUserId + TeamOwnership model
