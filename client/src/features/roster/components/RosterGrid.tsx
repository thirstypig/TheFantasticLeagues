
import React, { useEffect, useState } from 'react';
import { X, BedDouble, Activity } from 'lucide-react';
import { fetchJsonApi, API_BASE } from '../../../api/base';
import { POS_ORDER } from '../../../lib/baseballUtils';
import { mapPosition } from '../../../lib/sportConfig';
import { isMlbIlStatus } from '../../../lib/mlbStatus';
import { useLeague } from '../../../contexts/LeagueContext';
import { useToast } from '../../../contexts/ToastContext';

interface Team {
  id: number;
  name: string;
  code?: string | null;
  budget?: number | null;
}

interface RosterItem {
    id: number;
    teamId: number;
    assignedPosition?: string | null;
    player: {
        id: number;
        name: string;
        posPrimary: string;
        posList?: string;
        mlbId?: number;
    };
    price: number;
}

interface RosterGridProps {
  leagueId?: number;
  teams?: Team[];
  rosters?: RosterItem[];
  className?: string;
  canRelease?: boolean;
  canEditPrice?: boolean;
  canEditPosition?: boolean;
  onRelease?: () => void;
  /**
   * Per-row "IL" quick-action — fired with the roster item when the
   * commissioner clicks the IL button. Caller is responsible for opening
   * the IL Management UI and preselecting the player. Button only renders
   * when this callback AND `mlbStatusByPlayerId` are both provided AND
   * the player's status matches the MLB-IL regex.
   */
  onPlaceIl?: (item: RosterItem) => void;
  /**
   * Per-row "Activate" quick-action — fired with the roster item when the
   * commissioner clicks Activate on an IL-slotted row.
   */
  onActivateIl?: (item: RosterItem) => void;
  /**
   * Lookup of `Player.id → mlbStatus` so the grid can decide which rows
   * are IL-eligible. Built by the parent from its PlayerSeasonStat[]
   * data; without it, the "IL" button is hidden on every row.
   */
  mlbStatusByPlayerId?: Map<number, string | undefined>;
  /**
   * Drop the per-card `h-96` height constraint so each team card grows
   * to fit all rows without internal scroll. Use this when the grid
   * renders ONE team as the primary pane (e.g., the focused single-team
   * view in CommissionerRosterTool); leave default (false) for the
   * 8-up grid where fixed-height cards keep the layout uniform.
   */
  unbounded?: boolean;
}

export default function RosterGrid({ leagueId, teams: initialTeams, rosters: initialRosters, className, canRelease, canEditPrice, canEditPosition, onRelease, onPlaceIl, onActivateIl, mlbStatusByPlayerId, unbounded }: RosterGridProps) {
  const { outfieldMode, leagueId: contextLeagueId, seasonStatus } = useLeague();
  const priceDeemphasized = seasonStatus === "IN_SEASON" || seasonStatus === "COMPLETED";
  const { toast, confirm } = useToast();
  const [teams, setTeams] = useState<Team[]>(initialTeams || []);
  const [rosters, setRosters] = useState<RosterItem[]>(initialRosters || []);
  const [loading, setLoading] = useState(!initialTeams || !initialRosters);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState("");

  useEffect(() => {
    // If props update, sync state
    if (initialTeams) setTeams(initialTeams);
    if (initialRosters) setRosters(initialRosters);
  }, [initialTeams, initialRosters]);

  useEffect(() => {
    // If we have data via props, don't fetch unless leagueId changed and props didn't?
    // Simplified: Fetch if we rely on leagueId and have no props.
    if ((initialTeams && initialRosters) || !leagueId) {
        setLoading(false);
        return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Parallel fetch
        const [teamsRes, rostersRes] = await Promise.all([
            fetchJsonApi<any>(`${API_BASE}/commissioner/${leagueId}`),
            fetchJsonApi<any>(`${API_BASE}/commissioner/${leagueId}/rosters`)
        ]);

        if (teamsRes.error) throw new Error(teamsRes.error);
        if (rostersRes.error) throw new Error(rostersRes.error);

        // Normalize commissioner response to just teams
        const teamsList = teamsRes.teams || []; 
        setTeams(teamsList);
        setRosters(rostersRes.rosters || []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load grid data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [leagueId, initialTeams, initialRosters]);

  if (loading) return <div className="p-4 text-center text-[var(--lg-text-muted)] text-sm">Loading grid...</div>;
  if (error) return <div className="p-4 text-center text-red-400 text-sm">{error}</div>;

  // Group rosters
  const rostersByTeam = teams.reduce((acc, team) => {
    acc[team.id] = rosters.filter(r => r.teamId === team.id);
    return acc;
  }, {} as Record<number, RosterItem[]>);

  const effectiveLeagueId = leagueId || contextLeagueId;

  const handleSavePrice = async (rosterId: number, playerName: string) => {
    if (!effectiveLeagueId) return;
    const newPrice = Number(editPrice);
    if (!Number.isFinite(newPrice) || newPrice < 0) { toast("Invalid price", "error"); return; }
    try {
      await fetchJsonApi(`${API_BASE}/commissioner/${effectiveLeagueId}/roster/${rosterId}`, {
        method: "PATCH",
        body: JSON.stringify({ price: newPrice }),
      });
      setRosters(prev => prev.map(r => r.id === rosterId ? { ...r, price: newPrice } : r));
      toast(`Updated ${playerName} price to $${newPrice}`, "success");
      setEditingId(null);
      onRelease?.();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Edit failed", "error");
    }
  };

  const handlePositionChange = async (rosterId: number, teamId: number, playerName: string, newPos: string) => {
    if (!effectiveLeagueId) return;
    try {
      await fetchJsonApi(`${API_BASE}/teams/${teamId}/roster/${rosterId}`, {
        method: "PATCH",
        body: JSON.stringify({ assignedPosition: newPos }),
      });
      setRosters(prev => prev.map(r => r.id === rosterId ? { ...r, assignedPosition: newPos } : r));
      toast(`Updated ${playerName} position to ${newPos}`, "success");
      onRelease?.();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Position update failed", "error");
    }
  };

  const handleRelease = async (rosterId: number, playerName: string) => {
    if (!effectiveLeagueId) return;
    const ok = await confirm(`Release ${playerName} from their team?`);
    if (!ok) return;
    try {
      await fetchJsonApi(`${API_BASE}/commissioner/${effectiveLeagueId}/roster/release`, {
        method: 'POST',
        body: JSON.stringify({ rosterId }),
      });
      toast(`Released ${playerName}`, 'success');
      // Remove from local state immediately
      setRosters(prev => prev.filter(r => r.id !== rosterId));
      onRelease?.();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Release failed', 'error');
    }
  };

  return (
    <div className={className}>
       <h3 className="mb-4 text-xl font-semibold text-[var(--lg-text-primary)] border-b border-[var(--lg-border-subtle)] pb-2">Live Rosters</h3>
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
           {teams.map(team => {
               const teamRoster = rostersByTeam[team.id] || [];
               const totalSpent = teamRoster.reduce((sum, r) => sum + (r.price || 0), 0);
               const budget = team.budget || 300;
               const remaining = budget - totalSpent;
               
               return (
                   <div key={team.id} className={`rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] overflow-hidden flex flex-col ${unbounded ? '' : 'h-96'}`}>
                       <div className="p-3 bg-[var(--lg-tint)] border-b border-[var(--lg-border-faint)] flex justify-between items-center">
                           <div className="font-semibold text-[var(--lg-text-primary)] truncate max-w-[120px]" title={team.name}>{team.name}</div>
                           <div className="text-xs text-[var(--lg-text-secondary)] flex flex-col items-end">
                               <span className={remaining < 0 ? 'text-red-400' : 'text-green-400'}>${remaining} left</span>
                               <span className="text-[var(--lg-text-muted)]">{teamRoster.length} players</span>
                           </div>
                       </div>
                       <div className={`flex-1 p-2 space-y-1 ${unbounded ? '' : 'overflow-y-auto scrollbar-thin scrollbar-thumb-white/10'}`}>
                           {teamRoster.length === 0 && (
                               <div className="text-center text-xs text-[var(--lg-text-muted)] mt-10">No players</div>
                           )}
                           {[...teamRoster].sort((a, b) => {
                               const posA = a.assignedPosition || a.player.posPrimary;
                               const posB = b.assignedPosition || b.player.posPrimary;
                               const ia = POS_ORDER.indexOf(posA);
                               const ib = POS_ORDER.indexOf(posB);
                               return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
                           }).map(r => {
                               const displayPos = r.assignedPosition || mapPosition(r.player.posPrimary, outfieldMode);
                               const isPitcherPos = ["P", "SP", "RP"].includes(displayPos);
                               return (
                               <div key={r.id} className="flex justify-between items-center text-xs p-1.5 hover:bg-[var(--lg-tint)] rounded group">
                                   <div className="flex items-center gap-2 overflow-hidden">
                                       {canEditPosition ? (
                                         <select
                                           className="font-mono text-[var(--lg-accent)] w-8 text-center shrink-0 bg-transparent border border-[var(--lg-border-faint)] rounded cursor-pointer text-[10px] outline-none hover:border-[var(--lg-accent)] transition-colors"
                                           value={displayPos}
                                           onChange={(e) => handlePositionChange(r.id, r.teamId, r.player.name, e.target.value)}
                                         >
                                           {(isPitcherPos ? ["P"] : ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH"]).map(p => (
                                             <option key={p} value={p} className="text-black">{p}</option>
                                           ))}
                                         </select>
                                       ) : (
                                         <span className="font-mono text-[var(--lg-accent)] w-5 text-center shrink-0 text-[10px] font-semibold">{displayPos}</span>
                                       )}
                                       <span className="text-[var(--lg-text-primary)] truncate group-hover:text-sky-300 transition-colors">{r.player.name}</span>
                                   </div>
                                   <div className="flex items-center gap-1.5">
                                        {canEditPrice && editingId === r.id ? (
                                          <form onSubmit={(e) => { e.preventDefault(); handleSavePrice(r.id, r.player.name); }} className="flex items-center gap-1">
                                            <span className="text-amber-400">$</span>
                                            <input
                                              type="number"
                                              value={editPrice}
                                              onChange={(e) => setEditPrice(e.target.value)}
                                              className="w-10 bg-[var(--lg-bg-card)] border border-[var(--lg-accent)] rounded px-1 py-0.5 text-xs text-[var(--lg-text-primary)] text-right outline-none"
                                              autoFocus
                                              onBlur={() => setEditingId(null)}
                                              onKeyDown={(e) => { if (e.key === "Escape") setEditingId(null); }}
                                              min={0}
                                            />
                                          </form>
                                        ) : (
                                          <span
                                            className={`w-6 text-right ${priceDeemphasized ? "text-[10px] text-[var(--lg-text-muted)] opacity-50" : "font-semibold text-amber-400"} ${canEditPrice ? "cursor-pointer hover:text-amber-300" : ""}`}
                                            onClick={() => { if (canEditPrice) { setEditingId(r.id); setEditPrice(String(r.price)); } }}
                                            title={canEditPrice ? "Click to edit price" : undefined}
                                          >${r.price}</span>
                                        )}
                                        {/* Per-row IL quick-actions. "IL" appears on active rows whose
                                            MLB status matches /^Injured (List )?\d+-Day$/; "Activate"
                                            appears on rows already in the IL slot. Both gated by an
                                            opt-in callback so non-commissioner contexts hide them. */}
                                        {onActivateIl && r.assignedPosition === 'IL' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onActivateIl(r); }}
                                                className="p-0.5 text-[var(--lg-text-muted)] opacity-40 hover:opacity-100 hover:text-emerald-400 hover:bg-emerald-900/20 rounded transition-all"
                                                title={`Activate ${r.player.name} from IL`}
                                                aria-label={`Activate ${r.player.name} from IL`}
                                            >
                                                <Activity size={12} />
                                            </button>
                                        )}
                                        {onPlaceIl
                                          && r.assignedPosition !== 'IL'
                                          && mlbStatusByPlayerId
                                          && isMlbIlStatus(mlbStatusByPlayerId.get(r.player.id)) && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onPlaceIl(r); }}
                                                className="p-0.5 text-[var(--lg-text-muted)] opacity-40 hover:opacity-100 hover:text-amber-400 hover:bg-amber-900/20 rounded transition-all"
                                                title={`Place ${r.player.name} on IL`}
                                                aria-label={`Place ${r.player.name} on IL`}
                                            >
                                                <BedDouble size={12} />
                                            </button>
                                        )}
                                        {canRelease && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleRelease(r.id, r.player.name); }}
                                                className="p-0.5 text-[var(--lg-text-muted)] opacity-40 hover:opacity-100 hover:text-red-400 hover:bg-red-900/20 rounded transition-all"
                                                title={`Release ${r.player.name}`}
                                            >
                                                <X size={12} />
                                            </button>
                                        )}
                                   </div>
                               </div>
                           );})}
                       </div>
                   </div>
               );
           })}
       </div>
    </div>
  );
}
