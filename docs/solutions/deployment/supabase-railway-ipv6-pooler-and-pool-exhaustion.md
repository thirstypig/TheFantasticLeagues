---
title: "Production frozen for ~24h — Supabase IPv4 deprecation + session pool exhaustion stacked into a silent deploy failure"
category: deployment
tags:
  - railway
  - supabase
  - prisma
  - ipv6
  - ipv4-deprecation
  - connection-pooling
  - pgbouncer
  - deploy-config
  - github-actions
  - silent-failure
module: infrastructure
symptom: "Production at app.thefantasticleagues.com was serving a build from before PR #147 even though PRs #147–#160 had all merged to main and CI reported every deploy as `✅ Deploy triggered`. Login/signup pages still showed the legacy navy split-panel design instead of the merged Aurora redesign. Manual Redeploy from Railway dashboard failed with `MaxClientsInSessionMode: max clients reached`; subsequent attempts with DIRECT_URL pointed at the direct DB hostname failed with `P1001: Can't reach database server`."
root_cause: "Three independent failures stacked: (1) GitHub Actions `RAILWAY_DEPLOY_HOOK_URL` secret was empty, falling through to a stale Render hook that returned `Not Found` while the bash script printed `✅ Deploy triggered on Render (legacy)` and exited 0 — but this turned out to be a red herring because Railway's GitHub integration was already auto-deploying on every push. (2) Every auto-deploy was actually building and trying to apply `prisma migrate deploy`, but each one hit `MaxClientsInSessionMode` because dev and prod share the same Supabase DB and zombie local-Prisma sessions were squatting on session-pool slots. (3) Switching `DIRECT_URL` to the direct hostname `db.<project-ref>.supabase.co:5432` (the textbook Prisma recommendation) failed with `P1001` because Supabase deprecated IPv4 for direct connections on free tier in January 2024 — that hostname has only AAAA (IPv6) records, and Railway's egress is IPv4-only. The healthcheck failure on each attempted migration caused Railway to roll back to the last healthy build, so production silently stayed frozen on the pre-PR-#147 image while every new merge built, attempted, failed, and got rolled back."
severity: high
date_resolved: 2026-04-29
session: 82
---

# Production frozen for ~24h — Supabase IPv4 deprecation + session pool exhaustion stacked into a silent deploy failure

## Symptom

The Aurora design system rollout (PRs #147–#160) merged to `main` over Sessions 81–82 with green CI on every push. Local browser verification on `http://localhost:3010/login` showed the new Aurora design rendering correctly. Production at `https://app.thefantasticleagues.com/login` continued serving the pre-Aurora navy split-panel layout for ~24 hours after PR #147 merged.

Three distinct error fingerprints surfaced during diagnosis (each one initially looked like the cause):

**Fingerprint 1 — CI deploy step:**
```
RAILWAY_DEPLOY_HOOK_URL:           ← empty
RENDER_DEPLOY_HOOK_URL: ***        ← set but stale
Not Found                          ← what the Render hook returns
✅ Deploy triggered on Render (legacy)   ← script exits 0
```

**Fingerprint 2 — Railway deploy log on first manual redeploy:**
```
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-1-us-west-1.pooler.supabase.com:5432"
Error: Schema engine error:
FATAL: MaxClientsInSessionMode: max clients reached - in Session mode max clients are limited to pool_size
```

**Fingerprint 3 — Railway deploy log after switching DIRECT_URL to `db.<ref>.supabase.co:5432`:**
```
Datasource "db": PostgreSQL database "postgres", schema "public" at "db.oaogpsshewmcazhehryl.supabase.co:5432"
Error: P1001: Can't reach database server at `db.oaogpsshewmcazhehryl.supabase.co:5432`
Please make sure your database server is running at `db.oaogpsshewmcazhehryl.supabase.co:5432`.
```

In all three cases, Railway's healthcheck retried twice on `/api/health`, gave up after ~30s, and rolled the deployment back to the last healthy container. The last healthy container was the pre-PR-#147 build.

## Investigation

The session burned several hours chasing each fingerprint as if it were the cause. The investigation that *actually* produced the fix happened in this order:

### 1. Confirmed CI was reporting silent success

`gh run view <run-id> --log` on the most recent CI run showed:
```
RAILWAY_DEPLOY_HOOK_URL:           ← empty
RENDER_DEPLOY_HOOK_URL: ***
Not Found
✅ Deploy triggered on Render (legacy)
```

Initial conclusion: CI never triggers Railway, fix the deploy step. **This was a red herring.** Railway's GitHub integration was already auto-deploying on every push to `main` — the CI deploy step had been redundant since the Render→Railway migration. (See `railway-migration-deploy-missing.md` for the migration-on-boot context that's relevant here.)

### 2. First Railway deploy logs revealed the real failure mode

Manual redeploy in Railway showed `MaxClientsInSessionMode`. This is the moment we should have realized that *every previous CI-triggered deploy had also been silently doing this*: Railway was building and attempting deploys all along, but each attempt failed at the migration step, healthcheck failed, and Railway rolled back to the last healthy build. The "production frozen" appearance wasn't from missing deploys — it was from every deploy *aborting at startup*.

Cross-referencing memory: the project memory file `shared_supabase_db.md` notes that local `.env` `DATABASE_URL` points at the prod Supabase instance, meaning local Prisma processes had been holding session-pool slots open. With a small free-tier pool size, even a few zombie sessions exhaust it.

### 3. Following the textbook Prisma fix made things worse

The standard Prisma + connection-pooler advice is "use the transaction pooler for `DATABASE_URL` and the direct connection for `DIRECT_URL`." We pointed `DIRECT_URL` at `postgresql://postgres:<pwd>@db.oaogpsshewmcazhehryl.supabase.co:5432/postgres` and got `P1001: Can't reach database server`.

Initial assumption: typo in URL, wrong password, wrong project ref. Iterated through all three with no progress.

### 4. The empirical check that unlocked the right fix

```sh
$ dig +short A db.oaogpsshewmcazhehryl.supabase.co
                                                    ← EMPTY
$ dig +short AAAA db.oaogpsshewmcazhehryl.supabase.co
2600:1f1c:f9:4d1a:8d81:f1a6:2508:2816               ← only IPv6

$ dig +short A aws-1-us-west-1.pooler.supabase.com
3.101.5.153
54.241.91.151                                       ← IPv4 works
```

The direct hostname has **only AAAA records**. Railway's egress is IPv4-only by default. The hostname is unreachable from Railway no matter what password or URL we use. This is Supabase's January 2024 IPv4 deprecation hitting free-tier projects — confirmed in the Supabase community forum and explicitly mentioned in their connection-string docs as "IPv4 add-on required" for free tier direct connections.

### 5. The architectural fix

Both connection URLs must use the pooler endpoints (which kept IPv4 specifically for this scenario). Use `connection_limit=1` on `DIRECT_URL` to prevent future session-pool exhaustion regardless of zombie connections in dev.

## Fix

### Immediate (unstall production)

Set both env vars in Railway → service → Variables tab:

```sh
DATABASE_URL = postgresql://postgres.<PROJECT-REF>:<PWD>@aws-1-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL   = postgresql://postgres.<PROJECT-REF>:<PWD>@aws-1-us-west-1.pooler.supabase.com:5432/postgres?connection_limit=1
```

Saving Variables triggers an auto-redeploy. The migration step now succeeds:
```
Datasource "db": ... at "aws-1-us-west-1.pooler.supabase.com:5432"
Applying migration 20260428000000_add_team_stats_category_daily
... All migrations have been successfully applied.
Server listening on port 4010
Healthcheck succeeded!
```

Differences between the two URLs:
- Port: `6543` (transaction pooler) vs `5432` (session pooler)
- Query string: `?pgbouncer=true&connection_limit=1` vs `?connection_limit=1`
- Hostname, username pattern (`postgres.<REF>`), password, database name — identical

### Structural (prevent recurrence)

**Remove the dead CI deploy step.** Railway's GitHub integration handles deploys; the GitHub Actions deploy job was either silently failing or duplicating work depending on which secrets were set. Deleted in PR #161:

```yaml
  # Deploys are handled by Railway's GitHub integration:
  # every push to main triggers a Railway build automatically.
  # No CI deploy step is needed (Railway has no inbound deploy
  # webhook URL — its "Webhooks" feature is outbound-only).
```

**Document the architecture as load-bearing.** Saved to project memory at `~/.claude/projects/.../memory/supabase_railway_connection_setup.md` so future sessions don't try to "fix" `DIRECT_URL` to use the direct hostname again.

**Pre-flight reachability check** before any DB-related infra change:
```sh
dig +short A db.<project-ref>.supabase.co
# Empty result = IPv6-only = Railway can't reach it = use pooler
```

## Lessons

1. **Stacked failures with silent fingerprints are the most expensive class of bug.** Three independent failures (empty deploy-hook secret, session pool exhaustion, IPv6-only direct connection) all produced "production looks frozen" symptoms but had no shared error message. Fixing each individually didn't move the needle. The actual unblock came from a 30-second `dig` command — but only after stepping back from individual symptoms to ask "what would a senior DevOps engineer check first?" Lesson: when three fixes in a row don't move the symptom, you're treating symptoms not the cause. Stop fixing, start diagnosing.

2. **Empirical reachability checks beat reading documentation.** Prisma's docs say "use the direct URL for migrations." Supabase's docs (current version) do mention the IPv4 add-on, but it's buried. A `dig` against the actual hostname produced the answer in 5 seconds. **For any "can't reach X" error, run a DNS check first** — it eliminates an entire class of root causes (IPv6-only, regional DNS, stale records) before you start questioning credentials or config.

3. **Silent fail-on-success in CI deploy steps is dangerous.** The original `ci.yml` printed `✅ Deploy triggered` even when the underlying curl returned `Not Found`. Generic recipe for fail-loud bash deploy hooks:
    ```bash
    response_body=$(mktemp)
    status=$(curl -sS -o "$response_body" -w "%{http_code}" -X POST "$URL")
    body=$(cat "$response_body"); rm -f "$response_body"
    if [ "$status" -lt 200 ] || [ "$status" -ge 300 ]; then
      echo "::error::Deploy hook returned HTTP $status"
      echo "Response body: $body"
      exit 1
    fi
    ```
    Use `::error::` annotations so failures show as red in the GitHub Actions run summary, not buried in scrollback.

4. **Shared dev/prod databases plus session-mode pooling = unstable migrations.** The `MaxClientsInSessionMode` error wasn't a Prisma bug or a Supabase bug — it was the predictable consequence of running `prisma migrate dev` in local development against the same DB that prod migrations target. `connection_limit=1` on `DIRECT_URL` is the surgical fix, but the deeper lesson is that this stack (free-tier Supabase + shared dev/prod + Railway) has tight coupling that wouldn't exist with a separate dev DB. If we ever feel friction here again, the right move is a separate dev Supabase project, not more pool tuning.

5. **Railway's healthcheck-rollback behavior masks deploy failures as "production looks normal."** When migrations fail at startup, Railway keeps the last healthy container serving traffic. There's no banner, no notification — production simply stops advancing. Over 24 hours, ~6 PRs merged to main and none made it live. Detection: monitor the bundle hash served by production (`curl -s https://app.thefantasticleagues.com/login | grep -oE 'index-[A-Za-z0-9]+\.js'`) and compare against the latest commit's expected hash, OR set up a Railway webhook to Slack on `deployment.failed`.

6. **The "Connect" modal in Supabase is the right place to grab connection strings.** Don't transcribe URLs by hand. The modal's `ORMs → Prisma` tab gives both `DATABASE_URL` and `DIRECT_URL` pre-formatted with the correct project ref filled in. The only manual step is substituting `[YOUR-PASSWORD]`. Anything more elaborate (typing project refs, building URLs from parts) introduces typos that look like real failures.

## Detection queries

**Is production serving the latest build?**
```sh
LATEST_SHA=$(git rev-parse main)
PROD_BUNDLE=$(curl -s https://app.thefantasticleagues.com/login | grep -oE 'index-[A-Za-z0-9]+\.js' | head -1)
echo "Latest commit: $LATEST_SHA"
echo "Prod bundle:   $PROD_BUNDLE"
# If $PROD_BUNDLE doesn't change after a recent merge, production is frozen
```

**Is the Supabase direct hostname reachable from Railway?**
```sh
dig +short A db.<project-ref>.supabase.co
# Empty = IPv6-only = use pooler URLs only
# Has IPv4 = direct connection works (paid IPv4 add-on enabled or upgraded plan)
```

**Are zombie Prisma sessions squatting on the pool?** (run in Supabase SQL Editor)
```sql
SELECT pid, usename, application_name, state, state_change, query_start
FROM pg_stat_activity
WHERE application_name LIKE '%prisma%'
  AND state IN ('idle', 'idle in transaction')
ORDER BY state_change;
-- If many rows older than ~30 min, dev environment is leaking connections
```

## Related

- `railway-migration-deploy-missing.md` — the prior migration-pipeline incident (Session 74) where `railway.json` was missing `migrate deploy`. That incident's structural fix (run `migrate deploy` in `startCommand`) is what made *this* incident's pool-exhaustion failure possible — without that fix, migrations didn't run at all and the pool was never an issue. Both incidents share the lesson that platform-migration aftermath has long tail risks.
- `silent-railway-build-failures-vite-tsc-gap.md` — different class of silent Railway failure (build succeeds, runtime crashes); shares the diagnostic principle that Railway's healthcheck-rollback can hide the actual error from casual observation.
- `csp-websocket-and-cdn-issues.md` — different domain but same lesson on silent-failure surfaces (CSP violations are silent in browsers).
