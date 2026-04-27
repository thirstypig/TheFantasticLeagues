
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getCommissionerRosters } from '../api';
import RosterGrid from '../../roster/components/RosterGrid';
import AddDropPanel from '../../transactions/components/RosterMovesTab/AddDropPanel';
import CommissionerTradeTool from './CommissionerTradeTool';
import PlaceOnIlPanel from '../../transactions/components/RosterMovesTab/PlaceOnIlPanel';
import ActivateFromIlPanel from '../../transactions/components/RosterMovesTab/ActivateFromIlPanel';
import { Button } from '../../../components/ui/button';
import { getPlayerSeasonStats, PlayerSeasonStat } from '../../../api';

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
    assignedPosition?: string | null;
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
  // Lifted effective-date state — one picker in the header drives the
  // shared AddDropPanel + the IL panels (all three accept `effectiveDate`
  // as an optional prop). Empty string = server default (tomorrow 12:00 AM PT).
  const [effectiveDate, setEffectiveDate] = useState<string>('');
  const [ilMode, setIlMode] = useState<IlMode>('place-il');
  // Preselection nonces from the per-row IL shortcut on RosterGrid. We use
  // a {playerId, nonce} tuple instead of a bare playerId so clicking the
  // same player twice still triggers the panel's useEffect (otherwise React
  // would skip the state update because the value didn't change).
  const [stashPreselect, setStashPreselect] = useState<{ playerId: number; nonce: number } | null>(null);
  const [activatePreselect, setActivatePreselect] = useState<{ playerId: number; nonce: number } | null>(null);
  const ilCardRef = useRef<HTMLDivElement | null>(null);

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

  // Lookup of Player.id → mlbStatus, used by RosterGrid to gate the per-row
  // "IL" shortcut button to rows whose MLB status actually matches the IL
  // regex (otherwise commissioners would click and hit a server rejection).
  const mlbStatusByPlayerId = useMemo(() => {
    const map = new Map<number, string | undefined>();
    for (const p of players) {
      const pid = (p as unknown as { id?: number }).id;
      if (pid) map.set(pid, (p as unknown as { mlbStatus?: string }).mlbStatus);
    }
    return map;
  }, [players]);

  // Per-row IL shortcut handlers. We jump the acting-as team to whichever
  // team owns the clicked roster row, because the commissioner clicked
  // *that* player — the IL panels are scoped to actingAsTeamId, so the
  // Acting As must follow. We then preselect the player and switch ilMode.
  function handlePlaceIlShortcut(item: RosterItem) {
    setActingAsTeamId(item.teamId);
    setIlMode('place-il');
    setStashPreselect({ playerId: item.player.id, nonce: Date.now() });
    requestAnimationFrame(() => {
      ilCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  function handleActivateIlShortcut(item: RosterItem) {
    setActingAsTeamId(item.teamId);
    setIlMode('activate-il');
    setActivatePreselect({ playerId: item.player.id, nonce: Date.now() });
    requestAnimationFrame(() => {
      ilCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Annotate each player with the fantasy team it belongs to. Two flavors:
  //   - ogba_team_code/name → human-readable, used by AddDropPanel's
  //     "isTaken" UI and the watchlist
  //   - _dbTeamId / _dbPlayerId / assignedPosition → numeric DB ids that
  //     AddDropPanel + IL panels filter against (`p._dbTeamId === teamId`).
  //     The shared PlayerSeasonStat schema does NOT include these — they're
  //     derived client-side from the rosters join. Without this enrichment,
  //     drop dropdowns and IL pickers are always empty regardless of which
  //     team is selected. Session 80 bug — same class as the
  //     `_dbPlayerId` / react-key collision of PR #125.
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
      return {
        ...p,
        ogba_team_code: team.code ?? team.name.substring(0, 3).toUpperCase(),
        ogba_team_name: team.name,
        _dbTeamId: r.teamId,
        _dbPlayerId: pid,
        _rosterId: r.id,
        assignedPosition: r.assignedPosition ?? p.assignedPosition,
      };
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

       {/* Acting team feedback line — visual confirmation that the Acting As
           change took effect. Bold team name only; counts/last-move chrome
           cut per the deepened plan's simplicity review. */}
       {actingAsTeamId && (
         <div className="text-xs text-[var(--lg-text-muted)]">
           Acting on roster for{' '}
           <span className="font-semibold text-[var(--lg-text-primary)]">
             {teams.find((t) => t.id === actingAsTeamId)?.name ?? `team ${actingAsTeamId}`}
           </span>
         </div>
       )}

       {/* Focused single-team roster view — primary pane. Shows the acting-as
           team's roster only (no editable price/position; those are auction
           setup concerns now in the Season tab). Per-row IL/Activate buttons
           from #128 still work via the same callbacks. */}
       {actingAsTeamId && !loading && (() => {
         const actingTeam = teams.find((t) => t.id === actingAsTeamId);
         return actingTeam ? (
           <RosterGrid
             teams={[actingTeam]}
             rosters={rosters.filter((r) => r.teamId === actingAsTeamId)}
             canRelease
             onRelease={handleUpdate}
             onPlaceIl={handlePlaceIlShortcut}
             onActivateIl={handleActivateIlShortcut}
             mlbStatusByPlayerId={mlbStatusByPlayerId}
             unbounded
           />
         ) : null;
       })()}

       {/* Add / Drop — shared AddDropPanel from RosterMovesTab. The owner-side
           and commissioner-side now use the SAME pair-action component;
           server-side `requireTeamOwnerOrCommissioner` middleware handles
           cross-team commissioner authority. Server enforces DROP_REQUIRED
           in-season so the panel disables submit until a drop is picked. */}
       <div className="lg-card p-0 bg-transparent">
         <div className="px-4 py-3 border-b border-[var(--lg-border-subtle)]">
           <h3 className="text-sm font-semibold text-[var(--lg-text-primary)]">Add / Drop</h3>
           <p className="text-xs text-[var(--lg-text-muted)] mt-1">
             Commissioner view — adds go to the Acting As team. In-season every add must pair with a drop. Effective date from the header above is used.
           </p>
         </div>
         {loading || !actingAsTeamId ? (
           <div className="p-6 text-xs text-[var(--lg-text-muted)]">
             {loading ? "Loading players…" : "Select an Acting As team above."}
           </div>
         ) : (
           <div className="p-4">
             <AddDropPanel
               key={`add-drop-${actingAsTeamId}`}
               leagueId={leagueId}
               teamId={actingAsTeamId}
               players={playersWithRosterState as unknown as any}
               onComplete={handleUpdate}
               effectiveDate={effectiveDate || undefined}
             />
           </div>
         )}
       </div>

       {/* IL Management — place on IL (paired with replacement add) or
           activate from IL (paired with drop). Both halves commit atomically
           server-side. Uses the acting-as team + lifted effective date.
           Panels remount on team change (via key) so their internal picker
           state resets to avoid cross-team bleed. */}
       <div ref={ilCardRef} className="lg-card p-0 bg-transparent">
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
               initialStashPlayerId={
                 stashPreselect && stashPreselect.nonce
                   ? stashPreselect.playerId
                   : null
               }
             />
           ) : (
             <ActivateFromIlPanel
               key={`activate-${actingAsTeamId}`}
               leagueId={leagueId}
               teamId={actingAsTeamId}
               players={playersWithRosterState as unknown as any}
               onComplete={handleUpdate}
               effectiveDate={effectiveDate || undefined}
               initialActivatePlayerId={
                 activatePreselect && activatePreselect.nonce
                   ? activatePreselect.playerId
                   : null
               }
             />
           )}
         </div>
       </div>

       {/* Retroactive Trades — collapsible. Folded in from the deleted Trades
           tab (PR #130). Commissioner can record trades that already happened. */}
       <details className="lg-card p-0 bg-transparent">
         <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-[var(--lg-text-primary)] select-none">
           Record retroactive trade
           <span className="ml-2 text-[10px] font-normal text-[var(--lg-text-muted)] uppercase tracking-wide">
             (collapsible)
           </span>
         </summary>
         <div className="p-4 border-t border-[var(--lg-border-subtle)]">
           <CommissionerTradeTool leagueId={leagueId} teams={teams} />
         </div>
       </details>

       {/* All Teams Quick View — collapsible glance across the league.
           Default closed; lazy-mounted (the contents only render when open)
           so eight teams worth of roster rendering doesn't run on first paint. */}
       <details className="lg-card p-0 bg-transparent">
         <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-[var(--lg-text-primary)] select-none">
           All Teams Quick View
           <span className="ml-2 text-[10px] font-normal text-[var(--lg-text-muted)] uppercase tracking-wide">
             (collapsible)
           </span>
         </summary>
         <div className="p-4 border-t border-[var(--lg-border-subtle)]">
           <RosterGrid
             teams={teams}
             rosters={rosters}
             canRelease
             canEditPrice
             canEditPosition
             onRelease={handleUpdate}
             onPlaceIl={handlePlaceIlShortcut}
             onActivateIl={handleActivateIlShortcut}
             mlbStatusByPlayerId={mlbStatusByPlayerId}
           />
         </div>
       </details>
    </div>
  );
}
