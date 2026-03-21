import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getMyRoster, saveKeepers } from "../../leagues/api";
import { getKeeperAiRecommendations, KeeperRecommendResult } from "../api";
import PageHeader from "../../../components/ui/PageHeader";
import { useToast } from "../../../contexts/ToastContext";
import { useLeague } from "../../../contexts/LeagueContext";
import { mapPosition } from "../../../lib/sportConfig";
import { Sparkles, Loader2 } from "lucide-react";
import { track } from "../../../lib/posthog";

// Helper to format currency
const fmtMoney = (n: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
};

export default function KeeperSelection() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast, confirm } = useToast();
  const { outfieldMode } = useLeague();
  const leagueId = Number(id);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [team, setTeam] = useState<any>(null);
  const [roster, setRoster] = useState<any[]>([]);
  
  // Local state for selections (Set of Roster IDs)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isLocked, setIsLocked] = useState(false);
  const [keeperLimit, setKeeperLimit] = useState(4);

  // AI Recommendations state
  const [aiResult, setAiResult] = useState<KeeperRecommendResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

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
  const hasValues = roster.some(r => r.projectedValue != null);

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
            {/* AI Recommendations Button */}
            <div className="flex justify-end">
              <button
                onClick={async () => {
                  if (!team?.id) return;
                  setAiLoading(true);
                  setAiError(null);
                  track("ai_keeper_recommend_requested", { leagueId, teamId: team.id });
                  try {
                    const result = await getKeeperAiRecommendations(leagueId, team.id);
                    setAiResult(result);
                  } catch (e: unknown) {
                    setAiError(e instanceof Error ? e.message : "Failed to get recommendations");
                  } finally {
                    setAiLoading(false);
                  }
                }}
                disabled={aiLoading || !team?.id}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-[var(--lg-accent)]/30 bg-[var(--lg-accent)]/5 text-[var(--lg-accent)] hover:bg-[var(--lg-accent)]/10 transition-colors disabled:opacity-50"
              >
                {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Get AI Recommendations
              </button>
            </div>

            {/* AI Recommendations Result */}
            {aiError && <div className="text-xs text-red-400 text-center">{aiError}</div>}
            {aiResult && (
              <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} className="text-[var(--lg-accent)]" />
                  <span className="text-xs font-semibold uppercase text-[var(--lg-text-muted)]">AI Keeper Recommendations</span>
                </div>
                <div className="space-y-2">
                  {(aiResult.recommendations || []).map((rec, idx) => (
                    <div key={idx} className="flex items-start gap-3 py-2 border-b border-[var(--lg-divide)] last:border-0">
                      <div className="w-6 h-6 rounded-full bg-[var(--lg-accent)]/10 flex items-center justify-center text-xs font-bold text-[var(--lg-accent)] shrink-0">
                        {rec.rank || idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[var(--lg-text-primary)]">{rec.playerName}</span>
                          <span className="text-[10px] font-mono text-[var(--lg-text-muted)]">${rec.keeperCost}</span>
                        </div>
                        <p className="text-xs text-[var(--lg-text-secondary)] mt-0.5 leading-relaxed">{rec.reasoning}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {aiResult.strategy && (
                  <div className="pt-2 border-t border-[var(--lg-divide)]">
                    <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">Strategy</div>
                    <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed italic">{aiResult.strategy}</p>
                  </div>
                )}
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
                          {hasValues && <th className="px-6 py-4 text-right">Value</th>}
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
                                  <td className="px-6 py-4 font-mono text-[var(--lg-text-muted)] opacity-60">{mapPosition(r.player?.posPrimary || r.assignedPosition || "", outfieldMode)}</td>
                                  <td className="px-6 py-4 font-medium text-[var(--lg-text-primary)]">{r.player?.name || "Unknown"}</td>
                                  <td className="px-6 py-4 text-[var(--lg-text-muted)] opacity-60">{r.player?.mlbTeam || (r.player as any)?.mlb_team}</td>
                                  <td className="px-6 py-4 text-right font-mono text-[var(--lg-text-primary)]">{fmtMoney(r.price)}</td>
                                  {hasValues && (
                                    <td className={`px-6 py-4 text-right font-mono ${
                                      r.projectedValue != null
                                        ? r.projectedValue > r.price ? "text-emerald-500" : r.projectedValue < r.price ? "text-red-400" : "text-[var(--lg-text-primary)]"
                                        : "text-[var(--lg-text-muted)] opacity-60"
                                    }`}>
                                      {r.projectedValue != null ? `$${r.projectedValue}` : "—"}
                                    </td>
                                  )}
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
                          <tr><td colSpan={hasValues ? 6 : 5} className="p-8 text-center text-[var(--lg-text-muted)] opacity-60">No players on roster.</td></tr>
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
