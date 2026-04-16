---
status: complete
priority: p1
issue_id: "091"
tags: [code-review, security, secrets, gdpr]
dependencies: []
---

# P0: IP_HASH_SECRET value committed to server/data/todo-tasks.json

## Resolution (2026-04-16)

Rotated and redacted. Jimmy generated a fresh secret via `openssl rand -hex 32`, updated Railway's `IP_HASH_SECRET` env var, confirmed green redeploy. Same commit redacted `server/data/todo-tasks.json` line 44 to placeholder text. Old value is now cryptographically inert — even though it remains in git history, no Railway deploy uses it and no production hash can be reversed with it.

## Problem Statement

`server/data/todo-tasks.json` (task id `set-ip-hash-secret-railway`, instructions array) previously contained a literal 64-char hex value intended for Railway's `IP_HASH_SECRET` env var.

Surrounding instructions directed the operator to copy-paste this exact value — there was no "replace this placeholder" language. The value was carried over from pre-Session-65 `todo-tasks.json`; Session 65 consolidation did not introduce the leak but did not redact it either.

**Impact** — `IP_HASH_SECRET` is the HMAC key for both:
- `lib/ipHash.ts` — user IP hashing
- `lib/ipHash.ts` `hashEmail()` — `UserDeletionLog.hashedEmail`

An attacker with this value can:
- Reverse session-tracking IP hashes by precomputing HMACs for candidate IPs (small space — feasible)
- Reverse `hashedEmail` against a candidate email list
- Defeats the GDPR/privacy posture documented in session-tracking plan R8

**Provenance** — The value pre-existed in `todo-tasks.json` before Session 65; Session 65 did not introduce the leak. However, Session 65 re-wrote this file without redacting it, and this review is the first audit that caught it. Git history contains the value regardless of file state now.

## Findings

### Agent: security-sentinel
- Literal secret in instructions field, no placeholder language
- `IP_HASH_SECRET` HMACs both IP hashes AND email hashes
- Defense: rotation invalidates previously-captured hashes; no recovery needed
- Also flagged: `lastActivityAt` isn't the sensitive column; the hashes are

### Agent: learnings-researcher
- Recommendation: "IP_HASH_SECRET hex value in `server/data/todo-tasks.json` must be removed or replaced with a placeholder before committing. Store actual secret in `.env` only."

## Proposed Solutions

### Solution 1: Rotate + redact (recommended)
1. Generate new secret: `openssl rand -hex 32`
2. Set new value in Railway env var (`IP_HASH_SECRET`)
3. Verify Railway redeploy succeeds
4. Edit `server/data/todo-tasks.json` line 44 — replace literal value with `"Value: <paste the 64-char hex you generated with openssl rand -hex 32>"`
5. Commit redaction in same commit as the Session 65 consolidation
6. Acknowledge: git history still contains the old secret, but steps 1-3 invalidate it
- **Pros**: Low effort, full rotation, no history rewrite
- **Cons**: None
- **Effort**: Small (15 min)
- **Risk**: Low — new hashes written from redeploy forward; old hashes in DB become unrecoverable (fine — they weren't supposed to be reversible anyway)

### Solution 2: Rotate + redact + history rewrite
As Solution 1 plus `git filter-repo` to purge the secret from git history
- **Pros**: Removes the value from repo history entirely
- **Cons**: Rewrites shared history — forces re-clone for all collaborators; risky; Railway deploys may need re-linking
- **Effort**: Medium (1-2 hrs)
- **Risk**: High — breaks CI, PR branches, external forks
- **Only do this if**: compliance reporting requires proof of history purge

### Solution 3: Just redact, don't rotate
Edit the file, commit, call it done
- **Pros**: Fast
- **Cons**: Doesn't actually fix anything — value is still in git history AND still the production secret
- **Effort**: Trivial
- **Risk**: Does not resolve the finding
- **REJECT**

## Recommended Action

Solution 1. Rotation makes the leak harmless; history rewrite is overkill for a solo/small-team repo.

## Technical Details

**Affected files:**
- `server/data/todo-tasks.json` line 44 (and surrounding instructions)
- Railway env var `IP_HASH_SECRET` on FBST API service
- `server/src/lib/ipHash.ts` — uses the secret (no change needed)

**Database impact:**
- Existing `UserSession.ipHashed` rows become un-correlatable to new sessions (they were never supposed to correlate across rotation — this is the designed behavior)
- Existing `UserDeletionLog.hashedEmail` rows similarly detached — this is a log table, no functional impact

## Acceptance Criteria

- [ ] New secret generated with `openssl rand -hex 32`
- [ ] Railway env var `IP_HASH_SECRET` updated
- [ ] Railway deployment shows green
- [ ] `server/data/todo-tasks.json` line 44 value replaced with placeholder
- [ ] Commit includes both the Session 65 consolidation AND the redaction
- [ ] Grep confirms no other secret-shaped 64-char hex values in the repo: `grep -rE '[a-f0-9]{64}' --include='*.json' --include='*.md' --exclude-dir=node_modules .`

## Work Log

- **2026-04-14** (Session 65 `/ce:review`): Flagged by security-sentinel. Value is 64-char hex literal in plain-text instructions. Rotation requires Jimmy (only he has Railway access).
- **2026-04-16** (Session 65 commit): Jimmy rotated via Railway → green deploy confirmed. File line 44 redacted to placeholder. Todo marked complete.

## Resources

- Session 65 FEEDBACK entry
- `server/src/lib/ipHash.ts` — HMAC implementation using the secret
- `docs/plans/2026-04-13-admin-users-session-tracking-plan.md` R8 — yearly rotation policy
