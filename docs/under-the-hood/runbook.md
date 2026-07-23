---
id: DOC-019
title: "Runbook"
description: "How to operate the system — deploy, verify, rotate keys, and what to do when something breaks."
type: runbook
status: active
phase: null
owner: james
tags: [deploy, database, league-admin]
links: [DOC-007, DOC-014, DOC-016]
updated: 2026-07-23
---

# Runbook

> **Existing rollback runbooks** live in [`docs/runbooks/`](../runbooks/) — one per risky
> migration, plus `_template_rollback.md`. This page is the **operational** layer above
> them: deploy, verify, rotate, recover. It does not replace them.

<!-- Prompt-to-self: a runbook is read by a stressed person at 11pm. Commands first,
     explanation second. Anything that requires thinking should already have been thought. -->

---

## Deploy

Railway builds and runs `prisma migrate deploy` on boot. Merging to `main` triggers it.

### The only check that matters

A health endpoint returning 200 **cannot** detect a frozen deploy — the previous image
keeps serving happily. Compare versions:

```bash
curl -s https://app.thefantasticleagues.com/api/health | jq .version
git rev-parse origin/main        # these two must match
```

`.github/workflows/verify-deploy.yml` runs this automatically and emails on mismatch within
~12 minutes (PR #405).

### Two build hazards that have bitten

1. **The prod build installs without devDependencies.** A build-touching change must be verified with a literal `npm run build`, not just `tsc`. (PR #396 froze prod 3.5 h.)
2. **The client build compiles `src/test/**`.** Test files can break a production build.

---

## When a deploy is frozen

**Symptom:** `/api/health` reports an old SHA. Merges appear successful. Nothing changes in
prod.

**Almost always a failed migration.** Prisma wraps each migration in a transaction; a failed
one is left with `finished_at = null`, which triggers `P3009` and blocks **every** future
deploy.

```bash
# 1. Confirm — look for P3009 in the boot logs
env -u RAILWAY_API_TOKEN railway logs

# 2. Point at PROD (prod URLs live only in Railway env, in no local file)
export DATABASE_URL="$(env -u RAILWAY_API_TOKEN railway variables --kv | grep '^DATABASE_URL=' | cut -d= -f2-)"
export DIRECT_URL="$(env -u RAILWAY_API_TOKEN railway variables --kv | grep '^DIRECT_URL=' | cut -d= -f2-)"

# 3. Clear the failed migration, then redeploy
npx prisma migrate resolve --applied <migration_name>
```

**Precedents:** 21 h (2026-05-05, `CREATE INDEX CONCURRENTLY` → PG `25001`) and **8 days**
(2026-06-29, bare `CREATE TYPE` on an existing type → `42710`). The second went unnoticed
for over a week because nothing alerted on it — which is why `verify-deploy.yml` exists.

### Two migration rules

1. **Never `CREATE INDEX CONCURRENTLY` in a Prisma migration.** It cannot run inside a transaction.
2. **Never write a bare `CREATE TYPE` / `CREATE TABLE`** for something that might already exist. Guard it.

---

## Know which database you're touching

**Three databases. Verify before every mutation.**

| Source | Points at |
|---|---|
| `server/.env` | **LOCAL** Supabase (`127.0.0.1:54322`). Standalone `tsx` scripts land here. |
| `server/.env.local` | A **separate cloud project**. `npm run server` uses this — *not* local. |
| Railway env only | **PRODUCTION.** In no local file. |

```bash
# What am I actually connected to? (host only — never echo the full URL)
node -e "console.log(new URL(process.env.DATABASE_URL).host)"
```

Any prod mutation made for testing must be **reversed in the same session** — including
both the row *and* any `TransactionEvent` rows it generated. Activity-log residue in a live
league erodes trust faster than the bug you were chasing.

---

## Rotating a key

No key values live in this repo. Production secrets live only in Railway.

```bash
env -u RAILWAY_API_TOKEN railway variables            # names + current values
env -u RAILWAY_API_TOKEN railway variables --set KEY=value
```

| Key | Rotation notes |
|---|---|
| `IP_HASH_SECRET` | ⚠️ **Rotating breaks correlation of all existing `ipHash` values.** They aren't reversible, so old and new hashes will never match. Rotate only deliberately. |
| `SUPABASE_SERVICE_ROLE_KEY` | Full DB bypass. Highest-value secret here. |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | AI features degrade; Gemini already has a disable-on-failure path |
| `RESEND_API_KEY` | Transactional email stops — invites and signup confirmations fail silently from the user's view |
| `VAPID_*` | ⚠️ Rotating **invalidates every existing push subscription.** Users must re-subscribe. |
| `DATABASE_URL` / `DIRECT_URL` | Both must use the pooler with `connection_limit=1` — free-tier direct connection is IPv6-only and fails from Railway |

After any rotation, confirm the service is back via [system-status](system-status.md).

---

## When a service breaks

| Service | Symptom | First move |
|---|---|---|
| **Supabase (DB)** | 500s everywhere | Check Supabase status; verify pooler + `connection_limit=1`. Free tier has connection ceilings. |
| **Supabase (auth)** | Logins fail, app loads | Verify `SUPABASE_URL` / keys in Railway; check OAuth provider config |
| **Railway** | Site down | Check deploy status; a frozen deploy looks like "old behaviour," not an outage |
| **Anthropic / Gemini** | AI features fail, rest fine | Non-critical. Gemini self-disables on repeated failure. Check quota. |
| **Resend** | Invites/confirmations not arriving | Check the Resend dashboard and domain verification for `alephco.io` |
| **MLB StatsAPI** | Stats stale, standings frozen | ⚠️ **Fails silently today** — no run tracking, no alerting (`RISK-004`, todo `299`) |

### The failure with no alarm

**Ingestion jobs can fail silently.** Stats sync runs on cron 4×/day. There is no run
tracking and no alerting, and no `syncedAt` column on scoring tables — so stale data is
indistinguishable from fresh data.

Until `todo 299` and `todo 300` land, the only detection is a manual audit or an owner
complaining that their standings look wrong. In a league with payouts, that's the highest
open operational risk in this document.

---

## Routine operations

| Task | Command / note |
|---|---|
| Refresh generated docs | `npm run docs:refresh` — **before every push** |
| Refresh the comment inbox | `node scripts/sync-inbox.mjs` |
| Check feature isolation | `node scripts/check-feature-isolation.mjs` |
| Run tests | `npm test` |
| Close a period | Commissioner UI. **Manual — no cron.** Auto-bills contested IL fees; a late close misdates owners' moves. |

<!-- TODO(james): the gaps I could not fill from the repo —
     (1) Is there a TESTED database restore procedure? Supabase free-tier backup guarantees
         should be confirmed, not assumed. An untested backup is a hypothesis.
     (2) What is the plan if you are unavailable mid-season? Period close is manual and
         only you can do it.
     Both are bigger than anything above, and neither is visible in code. -->
