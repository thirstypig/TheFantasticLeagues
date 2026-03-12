
import React, { useEffect, useState } from 'react';
import { fetchJsonApi } from '../../../api/base';
import { POS_ORDER } from '../../../lib/baseballUtils';

interface Team {
  id: number;
  name: string;
  code?: string | null;
  budget?: number | null;
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

interface RosterGridProps {
  leagueId?: number;
  teams?: Team[];
  rosters?: RosterItem[];
  className?: string;
}

export default function RosterGrid({ leagueId, teams: initialTeams, rosters: initialRosters, className }: RosterGridProps) {
  const [teams, setTeams] = useState<Team[]>(initialTeams || []);
  const [rosters, setRosters] = useState<RosterItem[]>(initialRosters || []);
  const [loading, setLoading] = useState(!initialTeams || !initialRosters);
  const [error, setError] = useState<string | null>(null);

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
            fetchJsonApi<any>(`/api/commissioner/${leagueId}`),
            fetchJsonApi<any>(`/api/commissioner/${leagueId}/rosters`)
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

  const totalSpots = 12 * 25; // Approximate total capacity for visualization scaling? No, just list.

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
                   <div key={team.id} className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] overflow-hidden flex flex-col h-96">
                       <div className="p-3 bg-[var(--lg-tint)] border-b border-[var(--lg-border-faint)] flex justify-between items-center">
                           <div className="font-semibold text-[var(--lg-text-primary)] truncate max-w-[120px]" title={team.name}>{team.name}</div>
                           <div className="text-xs text-[var(--lg-text-secondary)] flex flex-col items-end">
                               <span className={remaining < 0 ? 'text-red-400' : 'text-green-400'}>${remaining} left</span>
                               <span className="text-[var(--lg-text-muted)]">{teamRoster.length} players</span>
                           </div>
                       </div>
                       <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-white/10">
                           {teamRoster.length === 0 && (
                               <div className="text-center text-xs text-[var(--lg-text-muted)] mt-10">No players</div>
                           )}
                           {[...teamRoster].sort((a, b) => {
                               const ia = POS_ORDER.indexOf(a.player.posPrimary);
                               const ib = POS_ORDER.indexOf(b.player.posPrimary);
                               return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
                           }).map(r => (
                               <div key={r.id} className="flex justify-between items-center text-xs p-1.5 hover:bg-[var(--lg-tint)] rounded group">
                                   <div className="flex items-center gap-2 overflow-hidden">
                                       <span className="font-mono text-[var(--lg-text-muted)] w-5 text-center shrink-0">{r.player.posPrimary}</span>
                                       <span className="text-[var(--lg-text-primary)] truncate group-hover:text-sky-300 transition-colors">{r.player.name}</span>
                                   </div>
                                   <div className="flex items-center gap-2">
                                        {r.player.mlbId && <span className="text-xs px-1 bg-[var(--lg-tint)] rounded text-[var(--lg-text-muted)]">MLB</span>}
                                        <span className="font-semibold text-amber-400 w-6 text-right">${r.price}</span>
                                   </div>
                               </div>
                           ))}
                       </div>
                   </div>
               );
           })}
       </div>
    </div>
  );
}
