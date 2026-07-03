# Pipeline Staleness & Integrity Audit — 2026-07-02

**Trigger:** repeated FanGraphs audits kept surfacing "differences," raising the question *"is our tool stale?"* This audit answers that from a data-engineering angle: not "does the scoring math match FanGraphs" (it does — see `docs/solutions/integration-issues/fangraphs-era-residual-is-rounding-not-a-bug.md`), but *"can the pipeline that feeds the scoring silently go stale, and would we know?"*

**Method:** three read-only codebase sweeps (ingestion/cron, cache/snapshot/freshness, dead-code) + a read-only prod probe (leagueId 20). No writes. All file:line cites verified by the sweeps.

**Confidence:** HIGH on all cited findings. Financial impact of Finding 1 is UNKNOWN pending a read of the handler (flagged, not yet done).

---

## Headline

**The scoring math is correct and the live data is fresh.** The active period (P4) reconciles to the MLB game log to the earned run, sync is running, snapshots are current. **But the tool is structurally blind to its own staleness** — no freshness timestamps on the scoring tables, and every ingestion job fails silently with no persisted "last run" and no real alerting. That blindness was already hiding a real, month-old, money-adjacent bug (Finding 1) that no stat audit could ever have caught.

---

## Empirical prod probe (2026-07-02, read-only)

| Check | Result | Verdict |
|---|---|---|
| Active period (P4) PSP coverage | 219 rows | ✅ sync running, not a missed sync |
| P4 reconciles to MLB game log | Δ=0 per pitcher (this session) | ✅ live data correct |
| PlayerStatsDaily latest `gameDate` | 2026-07-01 | ✅ expected (07-02 daily job runs 07-03 UTC) |
| Category snapshot vs daily feed | snapshot 07-02 ≥ daily 07-01 | ✅ 11:00 UTC snapshot ran |
| Closed periods outside 5-day reconciler window | **P1 (76d), P2 (48d), P3 (27d)** | ⚠️ unmonitored (Finding 4) |
| `OutboxEvent` pending > 1h | **2 rows, stuck since 2026-06-03** | 🔴 Finding 1 |
| Deprecated `TeamStatsSeason` rows | 8 | 🟡 Finding 7 |

**Bottom line:** nothing is *currently* stale in the scoring path, but the probe found a dead outbox handler no one was watching — proving the blindness is not hypothetical.

---

## Risk register (prioritized)

### 🔴 Finding 1 — IL fee reconciliation dead for Period 2 & 3 (money-adjacent) → todo #298
`OutboxEvent` rows `id=1` (leagueId 20, periodIds `[36]`=P2, since **2026-06-03**) and `id=2` (`[37]`=P3, since **2026-06-08**), both `kind=IL_FEE_RECONCILE`, `attempts=5` (retries exhausted, stuck permanently). Every attempt throws:
```
Postgres 42883: function pg_advisory_xact_lock(integer, bigint) does not exist
```
The handler acquires an advisory lock with mismatched arg types — matches neither `pg_advisory_xact_lock(bigint)` nor `(int, int)`. **IL-fee reconciliation for two closed periods has never run.**
- **Impact (UNKNOWN, needs handler read):** may mean P2/P3 IL fees were never assessed/reconciled. OGBA has real entry fees + payouts, so treat as top priority to *scope*. Do NOT re-run until idempotency + financial effect are understood.
- **Why nothing caught it:** the FanGraphs audit checks *stats*, not fees; the outbox worker logged to an ephemeral buffer, exhausted retries, and there is no alerting (Finding 2). Hidden ~30 days.
- **Fix direction:** cast the lock args (e.g. `pg_advisory_xact_lock($1::int, $2::int)` or a single `bigint` key); then decide whether to reset `attempts`/re-enqueue after confirming idempotency.

### 🟠 Finding 2 — Ingestion jobs fail silently; no "last successful run"; alerting is ephemeral → todo #299
All scheduled ingestion is in-process `node-cron` in `server/src/index.ts` (no Railway cron, no scheduled GH Action). Every job is `try/catch → logger.error → continue`. There is **no `SyncLog`/`JobRun`/last-success timestamp anywhere** in the schema, and the only alert path writes to `server/src/lib/errorBuffer.ts` — an **in-memory 100-entry ring buffer wiped on every restart**. No email/webhook/push.
- **Worst case:** the 4×/day period-stats sync (`index.ts:320`, `syncAllActivePeriods` → `mlbStatsSyncService.ts:221`) returns `void` and logs "complete" even when the MLB circuit breaker is open and **0 rows were written**. A partial/total MLB outage during all four windows = stale standings with no signal.
- **Fix direction:** a `JobRun` table (job, startedAt, finishedAt, ok, rows, error) written by every cron; a real alert (Resend email / webhook) on failure or on "no successful run in N hours"; surface `syncAllActivePeriods` result instead of discarding it.

### 🟠 Finding 3 — No freshness timestamp on the scoring tables → todo #300
`PlayerStatsPeriod` (`schema.prisma:729`), `PlayerStatsDaily` (`:783`), `TeamStatsPeriod` (`:651`) have **no `updatedAt`/`syncedAt`**. Staleness is only detectable via expensive cross-referential queries. This is the root reason the June boundary-freeze bug hid for 7 weeks.
- **Fix direction:** `syncedAt DateTime @updatedAt` on `PlayerStatsPeriod` (and ideally `TeamStatsPeriod`). Turns "active-period PSP older than 24h" into a trivial alarm.

### 🟠 Finding 4 — Self-heal reconciler window is too narrow → todo #301
`reconcileRecentlyClosedPeriods` (`mlbStatsSyncService.ts:531`) only covers `status='completed'` AND `endDate ≥ now-5d`, **PSP-only**, **core-fields-only** (`RECONCILE_INT_FIELDS`, `:390`). Not covered: long-closed periods (P1/P2/P3 are all outside the window — 76/48/27 days), **active periods** (no drift backstop), **`PlayerStatsDaily`** (never reconciled), and extended/rate fields (OBP/SLG/BB/TB/L/GS…).
- **Fix direction:** a nightly "re-audit *all* closed periods vs MLB" alarm (cheap diff, alert-only, no auto-heal needed for old periods), or widen `windowDays`. Pairs with detection query Q1 below.

### 🟡 Finding 5 — Dead divergent `calculateStandings()` importable by mistake → todo #302
`server/src/services/scoringEngine.ts:234` exports a full **H2H** standings implementation (W/L/streak over `H2HMatchup`) — completely different semantics from the production roto path, and the `H2HMatchup` table has **zero writers** (returns empty if called). Zero importers today, but it's a second exported function literally named `calculateStandings` in a generic `services/` file. Same file has dead `calculateNFLPoints`/`calculateNBACategories`/`compareNBACategories`.
- **Fix direction:** delete the dead exports (keep `getDefaultScoringRules`, the one live export). Also: `server/src/scripts/audit_period.ts` is documented non-faithful (overlap double-count) but script-only — leave, or add a header guard.

### 🟡 Finding 6 — Two live waiver systems → todo #303
Legacy `WaiverClaim` at `/api/waivers` (`index.ts:235`, `features/waivers/routes.ts`) is still fully mounted and called by the client (`WaiverClaimForm.tsx`, `ActivityWaiversTab.tsx`), in parallel with the newer Wire List (`WaiverPeriod`/`WaiverAddEntry`/`WaiverDropEntry`, `/api/wire-list`). Both reachable.
- **Fix direction:** product decision — confirm which OGBA uses; retire or clearly deprecate the other.

### 🟡 Finding 7 — Cache/data drift + vestigial rows → todo #304
- `data/mlbTeamCache.ts:141` never refreshes existing ids (`warmTeamCacheOnce` fills only *missing*), and the SQLite team-map TTL is 24h (`lib/mlbApi.ts:12`): a traded player's `Player.mlbTeam` can stay wrong for a day-plus, or forever in the JSON cache.
- `Team.tradeBlockPlayerIds` JSON (`schema.prisma:453`) can diverge from the `TradingBlock` table — no consistency enforcement.
- 8 deprecated `TeamStatsSeason` rows (`schema.prisma:705`) sit in prod, read by nothing.

---

## Reusable detection queries (read-only)

Because the stat tables lack freshness columns (Finding 3), most checks are cross-referential. Run against prod only after exporting the prod DB URLs (CLAUDE.md recipe).

1. **Closed periods outside the reconciler window** (the June-bug shape):
   ```sql
   SELECT id, name, "endDate", now()::date - "endDate"::date AS days_since_end
   FROM "Period" WHERE status='completed' AND "endDate" < now() - interval '5 days'
   ORDER BY "endDate" DESC;
   ```
2. **Active period with zero PSP rows** (fully-missed sync):
   ```sql
   SELECT p.id, p.name, COUNT(psp.id) AS psp_rows
   FROM "Period" p LEFT JOIN "PlayerStatsPeriod" psp ON psp."periodId"=p.id
   WHERE p.status='active' GROUP BY p.id, p.name HAVING COUNT(psp.id)=0;
   ```
3. **Category snapshot lagging the daily feed** (missed 11:00 UTC snapshot):
   ```sql
   SELECT MAX(tcd.date) last_snapshot,
          (SELECT MAX("gameDate") FROM "PlayerStatsDaily") last_daily
   FROM "TeamStatsCategoryDaily" tcd JOIN "Team" t ON t.id=tcd."teamId"
   WHERE t."leagueId"=20 HAVING MAX(tcd.date) < (SELECT MAX("gameDate") FROM "PlayerStatsDaily") - 1;
   ```
4. **OutboxEvent backlog** (stalled worker — this is what found Finding 1):
   ```sql
   SELECT kind, COUNT(*), MIN("createdAt") oldest FROM "OutboxEvent"
   WHERE "completedAt" IS NULL AND "createdAt" < now() - interval '1 hour' GROUP BY kind;
   ```
5. **tradeBlockPlayerIds JSON vs TradingBlock rows** (denorm drift):
   ```sql
   SELECT t.id FROM "Team" t
   WHERE (SELECT COUNT(*) FROM jsonb_array_elements_text(t."tradeBlockPlayerIds"::jsonb))
       <> (SELECT COUNT(*) FROM "TradingBlock" tb WHERE tb."teamId"=t.id);
   ```

---

## Explicitly NOT problems (to prevent re-investigation)

- **Scoring math / stat attribution** — correct; audits reconcile to MLB exactly. Ownership-window model is intentional (ADR-013).
- **`PlayerStatsDaily` vs `PlayerStatsPeriod`** — both load-bearing by design (hybrid attribution, `standingsService.ts:515`). Not stale/dead.
- **`x-classic` legacy pages** — intentional preservation artifacts (CLAUDE.md).
- **FanGraphs residuals** — FG-side rounding/timing, not us (see the solutions doc above).

---

## Recommended sequence
1. **#298** (scope + fix IL fee bug) — the one in-the-wild, money-touching failure. Read handler → assess impact → fix lock → reconcile.
2. **#299 + #300** (visibility layer + `syncedAt`) — the systemic fix that would have caught #298 in June.
3. **#301** (periodic closed-period re-audit alarm).
4. **#302 / #303 / #304** (dead-code + drift cleanup) — lower risk, reduces surface.
