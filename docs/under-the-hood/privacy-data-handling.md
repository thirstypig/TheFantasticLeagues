---
id: DOC-018
title: "Privacy and data handling"
description: "What personal data is recorded, where it's stored, how long it's kept, and what gets deleted."
type: privacy
status: active
phase: null
owner: james
tags: [auth, database, league-admin]
links: [DOC-007, DOC-016]
updated: 2026-07-23
---

# Privacy and data handling

> ## ⚠️ This product handles sensitive personal data
>
> Not "user preferences." **Email addresses, IP addresses, session behaviour, and payment
> handles** (Venmo / Zelle / PayPal usernames), for a league with real entry fees and
> payouts. Treat this page as load-bearing, not paperwork.

Everything below was **read from `prisma/schema.prisma` and the server source on
2026-07-23**, not from policy documents. Where the code and an intention disagree, the code
is what's true.

---

## What is recorded

### Account data — `User`, `UserProfile`

| Field | Notes |
|---|---|
| `email` | Unique. Also the login identifier. |
| `passwordHash` | Nullable — OAuth users have none |
| `avatarUrl` | |
| `venmoHandle`, `zelleHandle`, `paypalHandle` | **Payment identifiers.** Stored as plain text, character-validated. Not credentials — but they identify a real financial account and are how league money actually moves. |
| `bio` | 200 chars, user-authored |

> **These handles are not processed by any payment system.** There is no Stripe, no PayPal
> SDK, no card data anywhere in this repo. League members settle up manually. That means
> **no PCI surface** — genuinely good — but it also means these strings are pure liability
> with no offsetting control: they exist only to be read by another human.

### Session and behavioural data — `UserSession`

The most sensitive table, and the most carefully designed.

| Field | Retention | Notes |
|---|---|---|
| `ipHash` | With the row | HMAC-SHA256 of the raw IP using `IP_HASH_SECRET` |
| `ipTruncated` | 90 days | `/24` for IPv4, `/48` for IPv6 |
| `ipRaw` | **7 days** | Full IP. Fraud window only, then nulled. |
| `userAgent`, `country` | With the row | Country from Cloudflare `CF-IPCountry` |
| `startedAt`, `lastSeenAt`, `endedAt`, `durationSec`, `endReason` | With the row | |

**The retention policy is implemented, not aspirational.** A daily cron at **04:15 UTC**
nulls `ipRaw` older than 7 days and deletes session rows older than 90 days
(`server/src/index.ts`). I verified the job exists and runs — this is the kind of claim that
is usually a comment with no code behind it.

`server/src/lib/ipHash.ts` **fails fast if `IP_HASH_SECRET` is missing**, so the app cannot
silently fall back to storing unhashed identifiers.

### Aggregate data — `UserMetrics`

A per-user rollup: `totalLogins`, `totalSessions`, `totalSecondsOnSite`, `avgSessionSec`,
league counts, `firstSeenAt` / `lastSeenAt` / `lastLoginAt`, plus `signupSource`,
`signupUtmSource`, `signupUtmCampaign`.

Aggregate, but **still personal** — it is keyed to one identified user and describes their
behaviour over time.

### Audit data — `AuditLog`

`userId`, `action`, `resourceType`, `resourceId`, `metadata`, `createdAt`.
Cascade-deletes with the user.

This is the commissioner's evidence trail for money-affecting actions. Its integrity is a
product requirement, not just a compliance one.

### Marketing list — `Subscriber`

Separate from accounts. **Double opt-in**: confirmation email required, one-click
unsubscribe. Only the email address, status, tokens, and timestamps. **No names, no
tracking scripts.** RLS-locked against the anon key.

This is the best-designed data collection in the app and a good template for the rest.

### Third-party processors

| Service | Receives |
|---|---|
| Supabase | Everything — it is the database and the auth provider |
| Resend | Recipient email addresses for transactional mail |
| Anthropic (Claude Sonnet) | Whatever is in AI prompts — <!-- TODO(james): does any prompt include user-identifying data, or only player stats? Worth an actual read of aiAnalysisService.ts before answering. --> |
| Google (Gemini 2.5 Flash) | Same question as above |
| PostHog | Pageviews and identity (`identifyUser` sends id, email, name, admin flag) |
| Google Analytics | Page-level analytics |
| Cloudflare | All traffic — DNS/CDN, supplies `CF-IPCountry` |
| Railway | Hosts the process and holds production env |

> **Note:** `identifyUser()` sends the user's **email** to PostHog. That's a deliberate
> choice for a dozen known league members; it would need revisiting before any public
> launch.

---

## What gets deleted

`UserDeletionLog` is deliberately designed to **survive the cascade** — `userId` is stored
as a plain integer, not a foreign key, alongside an `emailHash` (HMAC, not the address),
`deletedAt`, `deletedBy`, and `reason`.

This is the right shape: it proves a deletion happened without retaining what was deleted.

<!-- TODO(james): three things I could not verify from the schema alone —
     (1) Does user deletion actually cascade to every table holding their data? AuditLog
         cascades; UserSession, UserMetrics, PushSubscription, roster history need checking.
     (2) Is there a user-facing "delete my account" path, or is deletion admin-only?
     (3) Supabase free-tier backups may retain deleted rows beyond the app's own policy —
         a deletion honoured in the app is not necessarily honoured in a backup. -->

---

## Known gaps

Stated plainly rather than glossed:

| Gap | Status |
|---|---|
| **No published privacy policy in this repo** | The marketing site may have one — it's a separate repo. Not verified. |
| **GDPR / CCPA posture undetermined** | League members are believed US-based, but nothing enforces or records that. |
| **No data-export ("access my data") path** | Not built. |
| **Deletion cascade not fully audited** | See the TODO above. |
| **AI prompt contents not audited for PII** | Two external model providers receive prompt text; nobody has checked what's in it. |

---

## If you do one thing

**Audit what goes into the AI prompts.** It's the only item above where data may already be
leaving the system in a shape nobody has looked at. Everything else is a documentation or
process gap; that one is a live unknown with two external processors on the receiving end.
