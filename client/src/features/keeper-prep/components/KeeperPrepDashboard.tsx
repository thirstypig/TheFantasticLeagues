// client/src/components/KeeperPrepDashboard.tsx
import React, { useEffect, useState, useCallback } from "react";
import { 
  getKeeperPrepStatus, 
  populateRosters, 
  lockKeepers, 
  unlockKeepers, 
  getTeamRosterForKeeperPrep, 
  saveKeepersCommish,
  type TeamKeeperStatus 
} from "../api";

interface KeeperPrepDashboardProps {
  leagueId: number;
}

export default function KeeperPrepDashboard({ leagueId }: KeeperPrepDashboardProps) {
  const [statuses, setStatuses] = useState<TeamKeeperStatus[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-team management
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [teamRoster, setTeamRoster] = useState<any[]>([]);
  const [selectedKeeperIds, setSelectedKeeperIds] = useState<Set<number>>(new Set());
  const [keeperLimit, setKeeperLimit] = useState(4);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getKeeperPrepStatus(leagueId);
      setStatuses(data.statuses);
      setIsLocked(data.isLocked);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handlePopulate = async () => {
    if (!confirm("This will clear all rosters and re-populate from the 2025 end-of-season data. Proceed?")) return;
    try {
      setBusy(true);
      const res = await populateRosters(leagueId);
      alert(`Success! Populated ${res.teamsPopulated} teams and added ${res.playersAdded} players.`);
      fetchStatus();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleLock = async () => {
    try {
      setBusy(true);
      if (isLocked) {
        await unlockKeepers(leagueId);
      } else {
        await lockKeepers(leagueId);
      }
      fetchStatus();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleEditTeam = async (teamId: number) => {
    try {
      setBusy(true);
      const data = await getTeamRosterForKeeperPrep(leagueId, teamId);
      setTeamRoster(data.roster);
      setKeeperLimit(data.keeperLimit);
      setSelectedKeeperIds(new Set(data.roster.filter((r: any) => r.isKeeper).map((r: any) => r.id)));
      setEditingTeamId(teamId);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleKeeper = (id: number) => {
    const next = new Set(selectedKeeperIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (next.size >= keeperLimit) {
        alert(`Keeper limit reached (${keeperLimit}).`);
        return;
      }
      next.add(id);
    }
    setSelectedKeeperIds(next);
  };

  const handleSaveKeepers = async () => {
    if (editingTeamId === null) return;
    try {
      setBusy(true);
      await saveKeepersCommish(leagueId, editingTeamId, Array.from(selectedKeeperIds));
      setEditingTeamId(null);
      fetchStatus();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="p-4 text-[var(--lg-text-muted)]">Loading keeper status...</div>;
  if (error) return <div className="p-4 text-red-400">Error: {error}</div>;

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handlePopulate}
            disabled={busy || isLocked}
            className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
          >
            Populate Rosters (2025)
          </button>
          <button
            onClick={handleToggleLock}
            disabled={busy}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors ${
              isLocked ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {isLocked ? "Unlock Selections" : "Lock All Selections"}
          </button>
        </div>
        <div className="text-sm text-[var(--lg-text-muted)]">
          Keeper Limit: <span className="text-[var(--lg-text-primary)]">{statuses[0]?.keeperLimit || 4}</span>
        </div>
      </div>

      {isLocked && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Keepers are currently **LOCKED**. Individual owners cannot modify their selections. 
          As a commissioner, you can still edit or unlock them.
        </div>
      )}

      {/* Status Table */}
      <div className="overflow-hidden rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--lg-border-subtle)] bg-[var(--lg-tint)]">
            <tr>
              <th className="px-4 py-3 font-semibold text-[var(--lg-text-secondary)]">Team</th>
              <th className="px-4 py-3 font-semibold text-[var(--lg-text-secondary)]">Roster</th>
              <th className="px-4 py-3 font-semibold text-[var(--lg-text-secondary)]">Keepers</th>
              <th className="px-4 py-3 font-semibold text-[var(--lg-text-secondary)]">Status</th>
              <th className="px-4 py-3 text-right font-semibold text-[var(--lg-text-secondary)]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--lg-divide)]">
            {statuses.map((s) => (
              <tr key={s.teamId} className="hover:bg-[var(--lg-tint)]">
                <td className="px-4 py-3">
                  <div className="font-semibold text-[var(--lg-text-primary)]">{s.teamName}</div>
                  {/* teamCode hidden from display */}
                </td>
                <td className="px-4 py-3 text-[var(--lg-text-secondary)]">{s.rosterCount} players</td>
                <td className="px-4 py-3">
                  <span className={s.keeperCount > s.keeperLimit ? "text-red-400" : "text-[var(--lg-text-primary)]"}>
                    {s.keeperCount} / {s.keeperLimit}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {s.rosterCount === 0 ? (
                    <span className="text-xs text-[var(--lg-text-muted)]">Not Populated</span>
                  ) : s.keeperCount === s.keeperLimit ? (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">Ready</span>
                  ) : (
                    <span className="rounded-full bg-[var(--lg-tint-hover)] px-2 py-0.5 text-xs text-[var(--lg-text-muted)]">In Progress</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleEditTeam(s.teamId)}
                    className="text-sky-400 hover:text-sky-300"
                  >
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal (Simple overlay for now) */}
      {editingTeamId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-secondary)] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-[var(--lg-text-primary)]">
                  Manage Keepers: {statForTeam(editingTeamId)?.teamName}
                </h3>
                <p className="text-sm text-[var(--lg-text-muted)]">
                  Select up to {keeperLimit} players to keep.
                </p>
              </div>
              <button 
                onClick={() => setEditingTeamId(null)}
                className="text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto pr-2">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[var(--lg-bg-secondary)] border-b border-[var(--lg-border-subtle)]">
                  <tr>
                    <th className="pb-2 text-[var(--lg-text-muted)] font-medium">Keep?</th>
                    <th className="pb-2 text-[var(--lg-text-muted)] font-medium">Player</th>
                    <th className="pb-2 text-[var(--lg-text-muted)] font-medium">Pos</th>
                    <th className="pb-2 text-[var(--lg-text-muted)] font-medium text-right">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--lg-divide)]">
                  {teamRoster.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2">
                        <input
                          type="checkbox"
                          checked={selectedKeeperIds.has(r.id)}
                          onChange={() => toggleKeeper(r.id)}
                          className="h-4 w-4 rounded border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] text-sky-500"
                        />
                      </td>
                      <td className="py-2 text-[var(--lg-text-primary)]">{r.player.name}</td>
                      <td className="py-2 text-[var(--lg-text-muted)]">{r.player.posPrimary}</td>
                      <td className="py-2 text-right font-mono text-amber-400">${r.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-[var(--lg-border-subtle)] pt-4">
               <div className="text-sm text-[var(--lg-text-secondary)]">
                 Selected: <span className="text-[var(--lg-text-primary)] font-bold">{selectedKeeperIds.size} / {keeperLimit}</span>
               </div>
               <div className="flex gap-3">
                 <button
                   onClick={() => setEditingTeamId(null)}
                   className="rounded-xl px-4 py-2 text-sm text-[var(--lg-text-secondary)] hover:bg-[var(--lg-tint)]"
                 >
                   Cancel
                 </button>
                 <button
                   onClick={handleSaveKeepers}
                   disabled={busy}
                   className="rounded-xl bg-sky-500 px-6 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
                 >
                   Save Selections
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function statForTeam(id: number) {
    return statuses.find(s => s.teamId === id);
  }
}
