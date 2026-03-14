
import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { getPlayerSeasonStats, type PlayerSeasonStat } from "../api";
import { fetchJsonApi, API_BASE } from "../api/base";
import { TableCard, Table, THead, Tr, Th, Td } from "../components/ui/TableCard";
import PageHeader from "../components/ui/PageHeader";
import { formatAvg } from "../lib/playerDisplay";
import { joinLeague } from "../features/leagues/api";
import { useToast } from "../contexts/ToastContext";

function num(v: string | number | null | undefined): number {
  return Number(v) || 0;
}

interface Player {
  mlbId: number;
  name: string;
  posPrimary: string;
}

interface RosterEntry {
  id: number;
  teamId: number;
  player: Player;
  stat?: PlayerSeasonStat;
}

interface Team {
  id: number;
  name: string;
  code?: string;
  ownerUserId?: number;
  ownerships?: Array<{ userId: number }>;
}

export default function Home() {
  const { user, loading: authLoading, refresh } = useAuth();
  const { toast } = useToast();

  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [stats, setStats] = useState<PlayerSeasonStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!user) return;

    let mounted = true;
    (async () => {
       try {
         setLoading(true);

         const lid = user.memberships?.[0]?.leagueId;
         if (!lid) return;

         // Parallel fetch: league detail + rosters + player stats
         const [leagueRes, rostersRes, statsData] = await Promise.all([
           fetchJsonApi<any>(`${API_BASE}/leagues/${lid}`),
           fetchJsonApi<any>(`${API_BASE}/leagues/${lid}/rosters`),
           getPlayerSeasonStats(),
         ]);
         if (!mounted) return;

         const teams = leagueRes.league?.teams || [];
         const uid = Number(user.id);
         const mine = teams.find((t: { ownerUserId?: number | null; ownerships?: Array<{ userId: number }> }) =>
           t.ownerUserId === uid || (t.ownerships || []).some((o) => o.userId === uid)
         );

         if (mine) {
            setMyTeam(mine);
            const myRoster = (rostersRes.rosters || []).filter((r: { teamId: number }) => r.teamId === mine.id);
            setRoster(myRoster);
            setStats(statsData || []);
         }

       } catch (err) {
         console.error("Home load error", err);
       } finally {
         if (mounted) setLoading(false);
       }
    })();
    return () => { mounted = false; };
  }, [user]);

   const rosterWithStats = useMemo(() => {
       const statsMap = new Map(stats.map(s => [Number(s.mlb_id), s]));
       return roster.map(r => ({
           ...r,
           stat: statsMap.get(r.player.mlbId),
       }));
   }, [roster, stats]);

  const hitters = rosterWithStats.filter(r => r.player.posPrimary !== 'P' && r.player.posPrimary !== 'RP' && r.player.posPrimary !== 'SP');
  const pitchers = rosterWithStats.filter(r => r.player.posPrimary === 'P' || r.player.posPrimary === 'RP' || r.player.posPrimary === 'SP');

  if (!user && !authLoading) {
    return null; // Should be handled by App.tsx routing Landing
  }

  if (!user) return null; // Fallback during loading

  return (
    <div className="relative min-h-full max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10 scrollbar-hide">
      <div className="mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
        <PageHeader 
          title="Dashboard"
          subtitle={<span>Welcome, <span className="text-[var(--lg-accent)] font-semibold uppercase">{user.name || user.email}</span>. Data loaded.</span>}
        />
      </div>

      {loading ? (
          <div className="flex flex-col items-center justify-center py-32 text-[var(--lg-text-muted)] animate-pulse">
            <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
            <div className="text-xs font-medium uppercase">Loading...</div>
          </div>
      ) : !myTeam ? (
          <div className="lg-card p-8 md:p-16 text-center max-w-2xl mx-auto shadow-2xl animate-in fade-in zoom-in-95 duration-700">
             <div className="w-20 h-20 rounded-full bg-[var(--lg-tint)] flex items-center justify-center mx-auto mb-8 border border-[var(--lg-border-subtle)] text-4xl">
               <svg className="w-10 h-10 text-[var(--lg-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
               </svg>
             </div>
             <h2 className="text-3xl font-semibold text-[var(--lg-text-heading)] mb-2">Welcome, {user.name || user.email}</h2>
             <p className="text-sm font-medium text-[var(--lg-text-secondary)] mb-8 leading-relaxed opacity-60">
               You're not on a team yet. Enter an invite code from your league commissioner to join.
             </p>

             <form
               onSubmit={async (e) => {
                 e.preventDefault();
                 const code = inviteCode.trim();
                 if (!code) return;
                 setJoining(true);
                 try {
                   const res = await joinLeague(code);
                   toast(`Joined ${res.league.name}!`, "success");
                   setInviteCode("");
                   await refresh();
                 } catch (err) {
                   toast(err instanceof Error ? err.message : "Failed to join league", "error");
                 } finally {
                   setJoining(false);
                 }
               }}
               className="flex items-center gap-3 max-w-sm mx-auto mb-8"
             >
               <input
                 type="text"
                 value={inviteCode}
                 onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                 placeholder="Enter invite code"
                 className="flex-1 h-12 px-4 rounded-xl bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] focus:border-[var(--lg-accent)] focus:ring-1 focus:ring-[var(--lg-accent)] outline-none transition-all text-sm font-mono tracking-widest text-center uppercase"
               />
               <button
                 type="submit"
                 disabled={joining || !inviteCode.trim()}
                 className="h-12 px-6 bg-[var(--lg-accent)] hover:bg-[var(--lg-accent-hover)] text-white font-semibold text-sm rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
               >
                 {joining ? "Joining..." : "Join"}
               </button>
             </form>

             <p className="text-xs text-[var(--lg-text-muted)] opacity-50">
               Ask your league commissioner for an invite code, or{" "}
               <Link to="/guide" className="text-[var(--lg-accent)] hover:underline">view the guide</Link>{" "}
               to learn more.
             </p>
          </div>
      ) : (
          <div className="space-y-6 md:space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
             <div className="lg-card p-0 overflow-hidden border-b-8 border-[var(--lg-accent)] shadow-2xl bg-transparent">
                 <div className="p-4 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-10 bg-[var(--lg-tint)]">
                     <div>
                        <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)] mb-3 opacity-60">My Team</div>
                        <h2 className="text-3xl font-semibold text-[var(--lg-text-heading)] leading-none">{myTeam.name}</h2>
                        <div className="mt-4 flex items-center gap-3">
                           <span className="text-xs font-medium uppercase text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-1 rounded-md">Active</span>
                           <span className="text-xs font-mono text-[var(--lg-text-muted)] opacity-40">#{myTeam.id}</span>
                        </div>
                     </div>
                     <div className="flex items-center">
                       <Link to="/players" className="lg-button lg-button-primary px-8 py-3 shadow-xl shadow-blue-500/20 group">
                         Players <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
                       </Link>
                     </div>
                 </div>

                 <div className="p-4 md:p-10 grid grid-cols-1 gap-14">
                   {/* Hitters */}
                   <div>
                     <div className="flex items-center gap-4 mb-8">
                        <div className="w-1.5 h-6 bg-blue-500 rounded-full shadow-lg shadow-blue-500/20"></div>
                        <h3 className="text-2xl font-semibold uppercase text-[var(--lg-text-heading)]">Hitters <span className="text-[var(--lg-text-muted)] font-medium text-xs ml-3 uppercase opacity-40">Roster</span></h3>
                     </div>
                     <div className="lg-card p-0 overflow-hidden bg-black/20">
                     <TableCard>
                     <Table>
                        <THead>
                            <Tr>
                                <Th align="left">Role</Th>
                                <Th align="left">Player</Th>
                                <Th align="center">MLB</Th>
                                <Th align="center">R</Th>
                                <Th align="center">HR</Th>
                                <Th align="center">RBI</Th>
                                <Th align="center">SB</Th>
                                <Th align="center">AVG</Th>
                                <Th align="center">AB</Th>
                            </Tr>
                        </THead>
                        <tbody className="divide-y divide-[var(--lg-divide)]">
                            {hitters.length === 0 && <Tr><td colSpan={9} className="p-16 text-center text-xs font-medium text-[var(--lg-text-muted)] uppercase opacity-30">No hitters on roster</td></Tr>}
                            {hitters.map(r => {
                                const s = (r.stat || {}) as PlayerSeasonStat;
                                return (
                                    <Tr key={r.id} className="hover:bg-[var(--lg-tint)]">
                                        <Td className="py-4">
                                          <span className="text-xs font-medium uppercase text-blue-400 bg-blue-400/10 border border-blue-400/20 px-2 py-0.5 rounded-md">
                                            {r.player.posPrimary}
                                          </span>
                                        </Td>
                                        <Td>{r.player.name}</Td>
                                        <Td align="center"><span className="text-xs text-[var(--lg-text-muted)]">{(r.player as any).mlbTeam || "—"}</span></Td>
                                        <Td align="center">{num(s.R)}</Td>
                                        <Td align="center"><span className="text-blue-500">{num(s.HR)}</span></Td>
                                        <Td align="center">{num(s.RBI)}</Td>
                                        <Td align="center"><span className="text-emerald-500">{num(s.SB)}</span></Td>
                                        <Td align="center"><span className="text-[var(--lg-accent)]">{formatAvg(s.AVG || 0)}</span></Td>
                                        <Td align="center"><span className="text-[var(--lg-text-muted)] opacity-40">{num(s.AB)}</span></Td>
                                    </Tr>
                                );
                            })}
                        </tbody>
                     </Table>
                     </TableCard>
                     </div>
                   </div>

                   {/* Pitchers */}
                   <div>
                     <div className="flex items-center gap-4 mb-8">
                        <div className="w-1.5 h-6 bg-purple-500 rounded-full shadow-lg shadow-purple-500/20"></div>
                        <h3 className="text-2xl font-semibold uppercase text-[var(--lg-text-heading)]">Pitchers <span className="text-[var(--lg-text-muted)] font-medium text-xs ml-3 uppercase opacity-40">Roster</span></h3>
                     </div>
                     <div className="lg-card p-0 overflow-hidden bg-black/20">
                     <TableCard>
                     <Table>
                        <THead>
                            <Tr>
                                <Th align="left">Role</Th>
                                <Th align="left">Player</Th>
                                <Th align="center">MLB</Th>
                                <Th align="center">W</Th>
                                <Th align="center">SV</Th>
                                <Th align="center">K</Th>
                                <Th align="center">ERA</Th>
                                <Th align="center">WHIP</Th>
                            </Tr>
                        </THead>
                        <tbody className="divide-y divide-[var(--lg-divide)]">
                            {pitchers.length === 0 && <Tr><td colSpan={8} className="p-16 text-center text-xs font-medium text-[var(--lg-text-muted)] uppercase opacity-30">No pitchers on roster</td></Tr>}
                            {pitchers.map(r => {
                                const s = (r.stat || {}) as PlayerSeasonStat;
                                return (
                                    <Tr key={r.id} className="hover:bg-[var(--lg-tint)]">
                                        <Td className="py-4">
                                          <span className="text-xs font-medium uppercase text-purple-400 bg-purple-400/10 border border-purple-400/20 px-2 py-0.5 rounded-md">
                                            {r.player.posPrimary}
                                          </span>
                                        </Td>
                                        <Td>{r.player.name}</Td>
                                        <Td align="center"><span className="text-xs text-[var(--lg-text-muted)]">{(r.player as any).mlbTeam || "—"}</span></Td>
                                        <Td align="center"><span className="text-emerald-500">{num(s.W)}</span></Td>
                                        <Td align="center"><span className="text-amber-500">{num(s.SV)}</span></Td>
                                        <Td align="center"><span className="text-blue-500">{num(s.K)}</span></Td>
                                        <Td align="center"><span className="text-blue-400">{s.ERA !== undefined ? Number(s.ERA).toFixed(2) : '—'}</span></Td>
                                        <Td align="center"><span className="text-purple-400">{s.WHIP !== undefined ? Number(s.WHIP).toFixed(2) : '—'}</span></Td>
                                    </Tr>
                                );
                            })}
                        </tbody>
                     </Table>
                     </TableCard>
                     </div>
                   </div>
                 </div>
              </div>
          </div>
      )}
      <BuildInfoPanel />
    </div>
  );
}

function BuildInfoPanel() {
  return (
    <div className="fixed bottom-4 right-6 pointer-events-none z-50">
      <div className="text-xs font-medium uppercase tracking-[0.5em] text-[var(--lg-text-muted)] opacity-20 select-none">
        TFL // {__COMMIT_HASH__}
      </div>
    </div>
  );
}
