import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getMyRoster, saveKeepers } from "../../leagues/api";
import PageHeader from "../../../components/ui/PageHeader";
import { useToast } from "../../../contexts/ToastContext";

// Helper to format currency
const fmtMoney = (n: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
};

export default function KeeperSelection() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast, confirm } = useToast();
  const leagueId = Number(id);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [team, setTeam] = useState<any>(null);
  const [roster, setRoster] = useState<any[]>([]);
  
  // Local state for selections (Set of Roster IDs)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isLocked, setIsLocked] = useState(false);
  const [keeperLimit, setKeeperLimit] = useState(4);

  // Load Data
  useEffect(() => {
    if (!leagueId) return;
    setLoading(true);
    getMyRoster(leagueId)
      .then(data => {
        setTeam(data.team);
        setRoster(data.roster || []);
        setIsLocked(data.isLocked || false);
        setKeeperLimit(data.keeperLimit || 4);
        
        // Initialize selections based on server state
        const initialKeepers = new Set<number>();
        (data.roster || []).forEach((r: any) => {
             if (r.isKeeper) initialKeepers.add(r.id);
        });
        setSelectedIds(initialKeepers);
      })
      .catch(err => {
        console.error(err);
        setError("Failed to load roster. " + (err.message || ""));
      })
      .finally(() => setLoading(false));
  }, [leagueId]);

  // Derived Stats
  const budget = team?.budget || 260; // Default fantasy budget if missing
  const totalCost = useMemo(() => {
      let sum = 0;
      roster.forEach(r => {
          if (selectedIds.has(r.id)) sum += (r.price || 0);
      });
      return sum;
  }, [roster, selectedIds]);

  const remaining = budget - totalCost;
  const count = selectedIds.size;

  // Handlers
  const toggleKeeper = (rosterId: number) => {
      if (isLocked) return;

      const next = new Set(selectedIds);
      if (next.has(rosterId)) {
          next.delete(rosterId);
      } else {
          if (next.size >= keeperLimit) {
              toast(`Keeper limit is ${keeperLimit}.`, "warning");
              return;
          }
          next.add(rosterId);
      }
      setSelectedIds(next);
  };

  const handleSave = async () => {
      if (!await confirm(`Confirm ${count} keepers for ${fmtMoney(totalCost)}?`)) return;

      try {
          setLoading(true);
          await saveKeepers(leagueId, Array.from(selectedIds));
          toast("Keepers saved successfully!", "success");
      } catch (err: unknown) {
          toast("Error saving: " + (err instanceof Error ? err.message : "Unknown error"), "error");
      } finally {
          setLoading(false);
      }
  };

  if (loading && !team) return <div className="text-center text-[var(--lg-text-muted)] py-20 animate-pulse text-sm">Loading...</div>;
  if (error) return <div className="text-center text-red-300 py-20 text-sm">{error}</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <PageHeader
        title="Keeper Selection"
        subtitle={`Select players to keep for ${team?.name || "Team"}`}
        backTo={`/commissioner/${leagueId}`}
      />

      <div>
        <div className="space-y-6">
            
            {isLocked && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-center text-amber-200">
                    <div className="text-lg font-semibold">Keepers are Locked</div>
                    <p className="text-sm opacity-80">The commissioner has locked keeper selections for the upcoming auction. You can no longer modify your team.</p>
                </div>
            )}
            {/* Summary Card */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-6 text-center shadow-xl backdrop-blur-sm">
                <div>
                   <div className="text-xs uppercase tracking-wider text-[var(--lg-text-muted)]">Total Budget</div>
                   <div className="mt-1 text-2xl font-semibold text-[var(--lg-text-primary)]">{fmtMoney(budget)}</div>
                </div>
                <div>
                   <div className="text-xs uppercase tracking-wider text-[var(--lg-text-muted)]">Keeper Cost</div>
                   <div className={`mt-1 text-2xl font-bold ${totalCost > budget ? "text-red-400" : "text-sky-300"}`}>
                       {fmtMoney(totalCost)}
                   </div>
                   <div className="text-xs text-[var(--lg-text-muted)] opacity-60">{count} / {keeperLimit} Players</div>
                </div>
                <div>
                   <div className="text-xs uppercase tracking-wider text-[var(--lg-text-muted)]">Available</div>
                   <div className={`mt-1 text-2xl font-bold ${remaining < 0 ? "text-red-500" : "text-green-400"}`}>
                       {fmtMoney(remaining)}
                   </div>
                </div>
            </div>

            {/* Roster Table */}
            <div className="overflow-hidden rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)]">
              <table className="w-full text-left text-sm text-[var(--lg-text-secondary)]">
                  <thead className="bg-[var(--lg-tint)] text-xs font-semibold uppercase tracking-wider text-[var(--lg-text-muted)]">
                      <tr>
                          <th className="px-6 py-4">Pos</th>
                          <th className="px-6 py-4">Player</th>
                          <th className="px-6 py-4">MLB</th>
                          <th className="px-6 py-4 text-right">Cost</th>
                          <th className="px-6 py-4 text-center">Keep?</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--lg-divide)]">
                      {roster.map(r => {
                          const isSelected = selectedIds.has(r.id);
                          return (
                              <tr 
                                key={r.id} 
                                className={`transition-colors hover:bg-[var(--lg-tint)] ${isSelected ? "bg-sky-900/10" : ""}`}
                                onClick={() => toggleKeeper(r.id)}
                              >
                                  <td className="px-6 py-4 font-mono text-[var(--lg-text-muted)] opacity-60">{r.player?.posPrimary || r.assignedPosition}</td>
                                  <td className="px-6 py-4 font-medium text-[var(--lg-text-primary)]">{r.player?.name || "Unknown"}</td>
                                  <td className="px-6 py-4 text-[var(--lg-text-muted)] opacity-60">{r.player?.mlbTeam || (r.player as any)?.mlb_team}</td>
                                  <td className="px-6 py-4 text-right font-mono text-[var(--lg-text-primary)]">{fmtMoney(r.price)}</td>
                                  <td className="px-6 py-4 text-center">
                                      <input 
                                        type="checkbox" 
                                        checked={isSelected} 
                                        disabled={isLocked}
                                        onChange={() => {}} // handled by row click
                                        className="h-5 w-5 rounded border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] text-sky-500 focus:ring-sky-500/50 disabled:opacity-30"
                                      />
                                  </td>
                              </tr>
                          );
                      })}
                      {roster.length === 0 && (
                          <tr><td colSpan={5} className="p-8 text-center text-[var(--lg-text-muted)] opacity-60">No players on roster.</td></tr>
                      )}
                  </tbody>
              </table>
            </div>

            {/* Sticky Action Footer (Mobile friendly) */}
            <div className="sticky bottom-4 mx-auto max-w-md rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-4 shadow-2xl backdrop-blur-md">
                 <div className="flex items-center justify-between gap-4">
                     <div className="text-sm">
                         <div className="text-[var(--lg-text-muted)]">Keeping</div>
                         <div className="font-semibold text-[var(--lg-text-primary)]">{count} / {keeperLimit} for {fmtMoney(totalCost)}</div>
                     </div>
                      <button
                        onClick={handleSave}
                        disabled={remaining < 0 || loading || isLocked}
                        className={`rounded-xl px-6 py-3 font-semibold text-white shadow-lg transition-all 
                            ${(remaining < 0 || isLocked)
                                ? "cursor-not-allowed bg-red-500/20 text-red-200" 
                                : "bg-sky-500 hover:bg-sky-400 active:scale-95"
                            }`}
                      >
                         {isLocked ? "Keepers Locked" : "Save Keepers"}
                      </button>
                 </div>
            </div>

        </div>
      </div>
    </div>
  );
}
