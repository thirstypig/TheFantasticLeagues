import React, { useEffect, useMemo, useState } from "react";
import { useToast } from "../../../contexts/ToastContext";
import {
  getIlAudit,
  postBulkIlStash,
  postCleanupDropped,
  type IlAuditResponse,
  type IlAuditRow,
  type BulkIlStashResponse,
  type CleanupDroppedResponse,
} from "../api";

/**
 * Commissioner bulk-ops panel.
 *
 * Two sections:
 *   1. "League IL audit" — table of MLB-IL players currently on active rosters
 *      across the league, with per-row "Stash" buttons and a "Stash all"
 *      header button that batches the call to /api/commissioner/:leagueId/bulk-il-stash.
 *
 *   2. "Roster cleanup" — day picker + button that purges old released-roster
 *      rows (`releasedAt < cutoff`).
 *
 * Idempotency: the server treats already-on-IL entries as `outcome: "noop"`
 * inside `succeeded`, so re-clicking "Stash all" after a partial failure is
 * safe.
 */
const SLOT_ORDER = ['C', '1B', '2B', '3B', 'SS', 'MI', 'CM', 'OF', 'DH', 'P', 'SP', 'RP', 'BN', 'IL'];
function slotRank(slot: string | null | undefined): number {
  const idx = SLOT_ORDER.indexOf((slot ?? 'BN').toUpperCase());
  return idx === -1 ? SLOT_ORDER.length : idx;
}

export default function BulkOpsPanel({ leagueId }: { leagueId: number }) {
  const { toast, confirm } = useToast();

  // ── IL audit state ────────────────────────────────────────────────
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [audit, setAudit] = useState<IlAuditResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingRowKey, setPendingRowKey] = useState<string | null>(null);
  const [lastBulkResult, setLastBulkResult] = useState<BulkIlStashResponse | null>(null);

  async function loadAudit() {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await getIlAudit(leagueId);
      setAudit(res);
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : "Failed to load IL audit");
    } finally {
      setAuditLoading(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(leagueId)) return;
    loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  const teamCount = useMemo(() => audit?.totalTeams ?? 0, [audit]);
  const rowCount = useMemo(() => audit?.totalRows ?? 0, [audit]);

  function rowKey(r: IlAuditRow) {
    return `${r.teamId}-${r.playerId}`;
  }

  async function handleStashAll() {
    if (!audit || audit.rows.length === 0) return;
    const ok = await confirm(
      `Stash ${audit.totalRows} player${audit.totalRows === 1 ? "" : "s"} across ${audit.totalTeams} team${audit.totalTeams === 1 ? "" : "s"}?`,
    );
    if (!ok) return;

    setSubmitting(true);
    setLastBulkResult(null);
    try {
      const entries = audit.rows.map(r => ({ teamId: r.teamId, playerId: r.playerId }));
      const result = await postBulkIlStash(leagueId, entries);
      setLastBulkResult(result);
      const stashed = result.succeeded.filter(s => s.outcome === "stashed").length;
      const noop = result.succeeded.filter(s => s.outcome === "noop").length;
      const failed = result.failed.length;
      const parts: string[] = [];
      parts.push(`Stashed ${stashed}`);
      if (noop > 0) parts.push(`already on IL: ${noop}`);
      parts.push(`failed ${failed}`);
      toast(parts.join(" · "), failed > 0 ? "warning" : "success");
      await loadAudit();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Bulk stash failed", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStashOne(row: IlAuditRow) {
    setPendingRowKey(rowKey(row));
    try {
      const result = await postBulkIlStash(leagueId, [{ teamId: row.teamId, playerId: row.playerId }]);
      const succeeded = result.succeeded[0];
      const failure = result.failed[0];
      if (succeeded) {
        if (succeeded.outcome === "stashed") {
          toast(`${row.playerName} stashed.`, "success");
        } else {
          toast(`${row.playerName} was already on IL.`, "info");
        }
      } else if (failure) {
        toast(`Stash failed: ${failure.reason}`, "error");
      }
      await loadAudit();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Stash failed", "error");
    } finally {
      setPendingRowKey(null);
    }
  }

  // ── Cleanup state ─────────────────────────────────────────────────
  const [olderThanDays, setOlderThanDays] = useState<number>(30);
  const [cleanupSubmitting, setCleanupSubmitting] = useState(false);
  const [lastCleanup, setLastCleanup] = useState<CleanupDroppedResponse | null>(null);

  async function handleCleanup() {
    if (!Number.isFinite(olderThanDays) || olderThanDays < 1) {
      toast("Enter a positive number of days.", "warning");
      return;
    }
    const ok = await confirm(
      `Delete released roster rows older than ${olderThanDays} day${olderThanDays === 1 ? "" : "s"}?`,
    );
    if (!ok) return;
    setCleanupSubmitting(true);
    try {
      const result = await postCleanupDropped(leagueId, olderThanDays);
      setLastCleanup(result);
      toast(`Cleaned up ${result.deletedCount} released roster row${result.deletedCount === 1 ? "" : "s"}.`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Cleanup failed", "error");
    } finally {
      setCleanupSubmitting(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="bulk-ops-panel">
      {/* League IL audit */}
      <section
        className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5"
        data-testid="league-il-audit"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--lg-text-heading)]">League IL audit</h3>
            <p className="text-sm text-[var(--lg-text-muted)]">
              {auditLoading
                ? "Scanning league rosters…"
                : rowCount === 0
                ? "No MLB-IL players are sitting on active rosters."
                : `${rowCount} MLB-IL player${rowCount === 1 ? "" : "s"} across ${teamCount} team${teamCount === 1 ? "" : "s"}.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadAudit}
              disabled={auditLoading || submitting}
              className="rounded-lg border border-[var(--lg-border-subtle)] px-3 py-2 text-xs font-semibold uppercase text-[var(--lg-text-muted)] hover:text-[var(--lg-text-heading)] disabled:opacity-50"
              data-testid="il-audit-refresh"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={handleStashAll}
              disabled={auditLoading || submitting || rowCount === 0}
              className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold uppercase text-white hover:bg-sky-600 disabled:opacity-50"
              data-testid="il-stash-all"
            >
              {submitting ? "Stashing…" : `Stash all (${rowCount})`}
            </button>
          </div>
        </div>

        {auditError && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200" data-testid="il-audit-error">
            {auditError}
          </div>
        )}

        {audit && audit.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="il-audit-table">
              <thead>
                <tr className="border-b border-[var(--lg-border-subtle)] text-left text-xs uppercase text-[var(--lg-text-muted)]">
                  <th className="py-2 pr-3">Team</th>
                  <th className="py-2 pr-3">Player</th>
                  <th className="py-2 pr-3">MLB status</th>
                  <th className="py-2 pr-3">Slot</th>
                  <th className="py-2 pr-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {audit.rows.slice().sort((a, b) => slotRank(a.assignedPosition) - slotRank(b.assignedPosition)).map(r => {
                  const key = rowKey(r);
                  return (
                    <tr key={key} className="border-b border-[var(--lg-border-subtle)]/60">
                      <td className="py-2 pr-3 font-medium">{r.teamName}</td>
                      <td className="py-2 pr-3">{r.playerName}</td>
                      <td className="py-2 pr-3 text-[var(--lg-text-muted)]">{r.mlbStatus}</td>
                      <td className="py-2 pr-3 text-[var(--lg-text-muted)]">{r.assignedPosition ?? "—"}</td>
                      <td className="py-2 pr-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleStashOne(r)}
                          disabled={submitting || pendingRowKey === key}
                          className="rounded-md border border-[var(--lg-border-subtle)] px-2 py-1 text-xs hover:bg-sky-500/20 disabled:opacity-50"
                          data-testid={`il-stash-row-${key}`}
                        >
                          {pendingRowKey === key ? "…" : "Stash"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {lastBulkResult && lastBulkResult.failed.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs" data-testid="il-bulk-failures">
            <div className="font-semibold text-amber-200 mb-1">Failures ({lastBulkResult.failed.length})</div>
            <ul className="ml-4 list-disc space-y-1 text-amber-100">
              {lastBulkResult.failed.map(f => (
                <li key={`${f.teamId}-${f.playerId}`}>
                  team #{f.teamId} player #{f.playerId} — {f.reason}
                  {f.code ? ` (${f.code})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Roster cleanup */}
      <section
        className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5"
        data-testid="roster-cleanup"
      >
        <h3 className="text-lg font-semibold text-[var(--lg-text-heading)]">Roster cleanup</h3>
        <p className="text-sm text-[var(--lg-text-muted)] mb-3">
          Hard-deletes released roster rows older than the chosen cutoff. The
          original transaction history is preserved (TransactionEvent rows
          aren't touched).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-[var(--lg-text-muted)]">
            Released player rows older than{" "}
            <input
              type="number"
              min={1}
              max={3650}
              value={olderThanDays}
              onChange={(e) => setOlderThanDays(Number(e.target.value))}
              className="ml-1 w-20 rounded-md border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] px-2 py-1 text-sm"
              data-testid="cleanup-days-input"
            />{" "}
            days
          </label>
          <button
            type="button"
            onClick={handleCleanup}
            disabled={cleanupSubmitting}
            className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold uppercase text-white hover:bg-sky-600 disabled:opacity-50"
            data-testid="cleanup-run"
          >
            {cleanupSubmitting ? "Cleaning…" : "Cleanup"}
          </button>
        </div>
        {lastCleanup && (
          <div className="mt-3 text-xs text-[var(--lg-text-muted)]" data-testid="cleanup-result">
            Last run: deleted <strong>{lastCleanup.deletedCount}</strong> row
            {lastCleanup.deletedCount === 1 ? "" : "s"}; kept rows newer than{" "}
            {new Date(lastCleanup.cutoff).toLocaleString()}.
          </div>
        )}
      </section>
    </div>
  );
}
