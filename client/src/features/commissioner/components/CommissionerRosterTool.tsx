
import React, { useState, useEffect, useMemo } from 'react';
import { getCommissionerRosters } from '../api';
import RosterGrid from '../../roster/components/RosterGrid';
import RosterControls from '../../roster/components/RosterControls';
import AddDropTab from '../../roster/components/AddDropTab';
import PlaceOnIlPanel from '../../transactions/components/RosterMovesTab/PlaceOnIlPanel';
import ActivateFromIlPanel from '../../transactions/components/RosterMovesTab/ActivateFromIlPanel';
import { Button } from '../../../components/ui/button';
import { getPlayerSeasonStats, PlayerSeasonStat } from '../../../api';
import { fetchJsonApi, API_BASE } from '../../../api/base';
import { reportError } from '../../../lib/errorBus';

type IlMode = 'place-il' | 'activate-il';

interface Team {
  id: number;
  name: string;
  code?: string | null;
  budget?: number | null;
  owner?: string | null;
}

interface RosterItem {
    id: number;
    teamId: number;
    player: {
        id: number;
        name: string;
        posPrimary: string;
        mlbId?: number;
    };
    price: number;
}

interface CommissionerRosterToolProps {
  leagueId: number;
  teams: Team[];
  onUpdate: () => void;
}

export default function CommissionerRosterTool({ leagueId, teams, onUpdate }: CommissionerRosterToolProps) {
  const [rosters, setRosters] = useState<RosterItem[]>([]);
  const [players, setPlayers] = useState<PlayerSeasonStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingAsTeamId, setActingAsTeamId] = useState<number | null>(teams[0]?.id ?? null);
  const [actionInFlight, setActionInFlight] = useState(false);
  // Lifted effective-date state — one picker in the header drives both the
  // Add/Drop table (via AddDropTab's controlled `effectiveDate` prop) and
  // the IL panels (via their new `effectiveDate` prop). Empty string = server
  // default (tomorrow 12:00 AM PT).
  const [effectiveDate, setEffectiveDate] = useState<string>('');
  const [ilMode, setIlMode] = useState<IlMode>('place-il');

  const [refreshKey, setRefreshKey] = useState(0);

  const fetchRosters = async () => {
    setLoading(true);
    try {
      const [rosterData, playerData] = await Promise.all([
        getCommissionerRosters(leagueId),
        getPlayerSeasonStats(leagueId),
      ]);
      setRosters(rosterData);
      setPlayers(playerData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (leagueId) fetchRosters();
  }, [leagueId, refreshKey]);

  const handleUpdate = () => {
      setRefreshKey(prev => prev + 1);
      onUpdate();
  };

  // Commissioner claim — uses actingAsTeamId (admin bypass allowed server-side).
  // `effectiveDate` (YYYY-MM-DD) backdates stats attribution; undefined = server default (tomorrow PT).
  const handleClaim = async (player: PlayerSeasonStat, _dropPlayerId?: number, effectiveDate?: string) => {
    if (!actingAsTeamId) {
      alert("Select a team in 'Acting As' first.");
      return;
    }
    const playerId = (player as unknown as { id?: number }).id;
    if (!playerId) {
      alert("Player is missing a DB id — cannot claim.");
      return;
    }
    setActionInFlight(true);
    try {
      await fetchJsonApi(`${API_BASE}/transactions/claim`, {
        method: "POST",
        body: JSON.stringify({
          leagueId,
          teamId: actingAsTeamId,
          playerId,
          mlbId: player.mlb_id,
          ...(effectiveDate ? { effectiveDate } : {}),
        }),
      });
      handleUpdate();
    } catch (err) {
      reportError(err, { source: "commissioner-claim" });
    } finally {
      setActionInFlight(false);
    }
  };

  // Commissioner drop — drops the player from whichever team actually owns them.
  // `effectiveDate` (YYYY-MM-DD) backdates; undefined = server default.
  const handleDrop = async (player: PlayerSeasonStat, effectiveDate?: string) => {
    const playerId = (player as unknown as { id?: number }).id;
    if (!playerId) {
      alert("Player is missing a DB id — cannot drop.");
      return;
    }
    const owningRoster = rosters.find((r) => r.player.id === playerId);
    if (!owningRoster) {
      alert("Player is not on any roster.");
      return;
    }
    const dateLabel = effectiveDate ? ` effective ${effectiveDate}` : "";
    if (!confirm(`Drop ${player.player_name} from ${teams.find(t => t.id === owningRoster.teamId)?.name ?? 'the team'}${dateLabel}?`)) {
      return;
    }
    setActionInFlight(true);
    try {
      await fetchJsonApi(`${API_BASE}/transactions/drop`, {
        method: "POST",
        body: JSON.stringify({
          leagueId,
          teamId: owningRoster.teamId,
          playerId,
          ...(effectiveDate ? { effectiveDate } : {}),
        }),
      });
      handleUpdate();
    } catch (err) {
      reportError(err, { source: "commissioner-drop" });
    } finally {
      setActionInFlight(false);
    }
  };

  // Annotate each player with the fantasy team code they belong to so
  // AddDropTab's `isTaken` check lights up correctly. getPlayerSeasonStats
  // already does this for public rosters, but we refresh here after each
  // commissioner action.
  const playersWithRosterState = useMemo(() => {
    if (rosters.length === 0) return players;
    const rosterByPlayerId = new Map(rosters.map(r => [r.player.id, r]));
    return players.map(p => {
      const pid = (p as unknown as { id?: number }).id;
      if (!pid) return p;
      const r = rosterByPlayerId.get(pid);
      if (!r) return p;
      const team = teams.find(t => t.id === r.teamId);
      if (!team) return p;
      return { ...p, ogba_team_code: team.code ?? team.name.substring(0, 3).toUpperCase(), ogba_team_name: team.name };
    });
  }, [players, rosters, teams]);

  if (error) {
    return <div className="text-red-500 text-sm">Error loading rosters: {error}</div>;
  }

  return (
    <div className="space-y-6">
       {/* Header — Acting As team + shared effective-date picker. One picker
           drives both Add/Drop and IL actions (matches Fangraphs' always-
           visible control at the top of the commissioner roster page). */}
       <div className="flex items-end gap-6 flex-wrap">
         <div className="flex flex-col gap-1">
           <label className="text-[10px] font-medium uppercase text-[var(--lg-text-muted)]">Acting As</label>
           <select
             value={actingAsTeamId ?? ''}
             onChange={(e) => setActingAsTeamId(Number(e.target.value))}
             className="bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl px-4 py-2 text-xs font-bold text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-all"
           >
             {teams.map((t) => (
               <option key={t.id} value={t.id} className="text-black">{t.name}</option>
             ))}
           </select>
         </div>
         <div className="flex flex-col gap-1">
           <label htmlFor="commissioner-effective-date" className="text-[10px] font-medium uppercase text-[var(--lg-text-muted)]">
             Effective date
           </label>
           <div className="flex items-center gap-2">
             <input
               id="commissioner-effective-date"
               type="date"
               value={effectiveDate}
               onChange={(e) => setEffectiveDate(e.target.value)}
               className="bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-all"
             />
             {effectiveDate ? (
               <button
                 type="button"
                 onClick={() => setEffectiveDate('')}
                 className="text-[10px] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] underline"
               >
                 clear
               </button>
             ) : (
               <span className="text-[10px] text-[var(--lg-text-muted)]">empty = tomorrow</span>
             )}
           </div>
         </div>
       </div>

       {/* Controls: single-player typeahead + bulk CSV */}
       <RosterControls leagueId={leagueId} teams={teams} onUpdate={handleUpdate} />

       {/* Add / Drop — full searchable player table with watchlist stars for the acting team */}
       <div className="lg-card p-0 bg-transparent">
         <div className="px-4 py-3 border-b border-[var(--lg-border-subtle)]">
           <h3 className="text-sm font-semibold text-[var(--lg-text-primary)]">Add / Drop Search</h3>
           <p className="text-xs text-[var(--lg-text-muted)] mt-1">
             Commissioner view — claims go to the Acting As team; drops release whichever team owns the player. Stars reflect the Acting As team's watchlist. Effective date from the header above is used.
           </p>
         </div>
         {loading ? (
           <div className="p-6 text-xs text-[var(--lg-text-muted)]">Loading players…</div>
         ) : (
           <AddDropTab
             players={playersWithRosterState}
             onClaim={handleClaim}
             onDrop={handleDrop}
             disabled={actionInFlight}
             teamIdOverride={actingAsTeamId}
             effectiveDate={effectiveDate}
           />
         )}
       </div>

       {/* IL Management — place on IL (paired with replacement add) or
           activate from IL (paired with drop). Both halves commit atomically
           server-side. Uses the acting-as team + lifted effective date.
           Panels remount on team change (via key) so their internal picker
           state resets to avoid cross-team bleed. */}
       <div className="lg-card p-0 bg-transparent">
         <div className="px-4 py-3 border-b border-[var(--lg-border-subtle)]">
           <div className="flex items-center justify-between gap-4 flex-wrap">
             <div>
               <h3 className="text-sm font-semibold text-[var(--lg-text-primary)]">IL Management</h3>
               <p className="text-xs text-[var(--lg-text-muted)] mt-1">
                 Place on IL pairs with a replacement add; Activate from IL pairs with a drop. Both commit atomically.
               </p>
             </div>
             <div className="lg-card p-1 inline-flex gap-1">
               <Button
                 onClick={() => setIlMode('place-il')}
                 variant={ilMode === 'place-il' ? 'default' : 'ghost'}
                 size="sm"
                 className="px-4"
               >
                 Place on IL
               </Button>
               <Button
                 onClick={() => setIlMode('activate-il')}
                 variant={ilMode === 'activate-il' ? 'default' : 'ghost'}
                 size="sm"
                 className="px-4"
               >
                 Activate from IL
               </Button>
             </div>
           </div>
         </div>
         <div className="p-4">
           {!actingAsTeamId ? (
             <p className="text-[11px] text-[var(--lg-text-muted)]">Select an Acting As team above.</p>
           ) : ilMode === 'place-il' ? (
             <PlaceOnIlPanel
               key={`place-${actingAsTeamId}`}
               leagueId={leagueId}
               teamId={actingAsTeamId}
               players={playersWithRosterState as unknown as any}
               onComplete={handleUpdate}
               effectiveDate={effectiveDate || undefined}
             />
           ) : (
             <ActivateFromIlPanel
               key={`activate-${actingAsTeamId}`}
               leagueId={leagueId}
               teamId={actingAsTeamId}
               players={playersWithRosterState as unknown as any}
               onComplete={handleUpdate}
               effectiveDate={effectiveDate || undefined}
             />
           )}
         </div>
       </div>

       {/* Live Rosters — release/edit in-place */}
       <RosterGrid teams={teams} rosters={rosters} canRelease canEditPrice canEditPosition onRelease={handleUpdate} />
    </div>
  );
}
