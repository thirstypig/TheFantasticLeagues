import React, { useState, useEffect, useMemo } from "react";
import { useLeague } from "../../../contexts/LeagueContext";
import { useAuth } from "../../../auth/AuthProvider";
import { useToast } from "../../../contexts/ToastContext";
import { Button } from "../../../components/ui/button";
import PageHeader from "../../../components/ui/PageHeader";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ThemedTable, ThemedThead, ThemedTr, ThemedTh, ThemedTd } from "../../../components/ui/ThemedTable";
import { POS_ORDER } from "../../../lib/baseballUtils";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import { Zap } from "lucide-react";

interface DraftPickResult {
  pickNum: number;
  round: number;
  teamId: number;
  playerId: number | null;
  playerName: string | null;
  position: string | null;
  isAutoPick: boolean;
  timestamp: number;
}

interface TeamRoster {
  teamId: number;
  teamName: string;
  picks: DraftPickResult[];
}

export default function DraftResults() {
  const { leagueId } = useLeague();
  const { user } = useAuth();
  const { toast } = useToast();

  const [picks, setPicks] = useState<DraftPickResult[]>([]);
  const [teamMap, setTeamMap] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  // Load picks
  useEffect(() => {
    if (!leagueId) return;
    setLoading(true);
    setError(null);
    fetchJsonApi<{ picks: DraftPickResult[] }>(
      `${API_BASE}/draft/picks?leagueId=${leagueId}`
    ).then(res => {
      setPicks(res.picks || []);
      if (res.picks && res.picks.length > 0) {
        const firstPick = res.picks[0];
        setSelectedTeamId(firstPick.teamId);
      }
    }).catch(err => {
      setError((err as Error)?.message || "Failed to load draft results");
    }).finally(() => {
      setLoading(false);
    });
  }, [leagueId]);

  // Load teams
  useEffect(() => {
    if (!leagueId) return;
    fetchJsonApi<{ teams: { id: number; name: string }[] }>(
      `${API_BASE}/teams/${leagueId}`
    ).then(res => {
      const map: Record<number, string> = {};
      (res.teams || []).forEach(t => { map[t.id] = t.name; });
      setTeamMap(map);
    }).catch(() => {});
  }, [leagueId]);

  // Group picks by team
  const teamRosters = useMemo(() => {
    const rosters: Record<number, TeamRoster> = {};
    for (const pick of picks) {
      if (!rosters[pick.teamId]) {
        rosters[pick.teamId] = {
          teamId: pick.teamId,
          teamName: teamMap[pick.teamId] || `Team ${pick.teamId}`,
          picks: [],
        };
      }
      rosters[pick.teamId].picks.push(pick);
    }
    return Object.values(rosters).sort((a, b) => a.picks[0]?.pickNum || 0 - (b.picks[0]?.pickNum || 0));
  }, [picks, teamMap]);

  const selectedTeam = teamRosters.find(t => t.teamId === selectedTeamId);

  if (loading) {
    return (
      <div className="p-4 md:p-8 space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded-2xl bg-[var(--lg-tint)]" />
        <div className="h-64 rounded-2xl bg-[var(--lg-tint)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <EmptyState icon={Zap} title="Draft results unavailable" description={error} />
      </div>
    );
  }

  if (picks.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <EmptyState icon={Zap} title="No draft results" description="The draft has not been completed yet." />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <PageHeader
        title="Draft Results"
        subtitle={`${picks.length} picks across ${teamRosters.length} teams`}
      />

      {/* Team selector */}
      <div className="mb-6 flex flex-wrap gap-2">
        {teamRosters.map(team => (
          <button
            key={team.teamId}
            onClick={() => setSelectedTeamId(team.teamId)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase transition-colors ${
              selectedTeamId === team.teamId
                ? "bg-[var(--lg-accent)] text-white"
                : "bg-[var(--lg-tint)] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]"
            }`}
          >
            {team.teamName}
            <span className="ml-2 text-[10px]">({team.picks.length})</span>
          </button>
        ))}
      </div>

      {/* Selected team roster */}
      {selectedTeam && (
        <div className="rounded-xl border border-[var(--lg-border-subtle)] overflow-hidden">
          <h3 className="text-sm font-semibold p-4 border-b border-[var(--lg-border-faint)] text-[var(--lg-text-heading)]">
            {selectedTeam.teamName} — Final Roster
          </h3>
          <ThemedTable>
            <ThemedThead>
              <ThemedTr>
                <ThemedTh className="w-12">#</ThemedTh>
                <ThemedTh className="w-16">Round</ThemedTh>
                <ThemedTh>Player</ThemedTh>
                <ThemedTh className="w-12">Pos</ThemedTh>
                <ThemedTh className="w-16">Auto</ThemedTh>
              </ThemedTr>
            </ThemedThead>
            <tbody className="divide-y divide-[var(--lg-divide)]">
              {selectedTeam.picks.map(p => (
                <ThemedTr key={p.pickNum}>
                  <ThemedTd className="tabular-nums text-[var(--lg-text-muted)]">{p.pickNum}</ThemedTd>
                  <ThemedTd className="tabular-nums">{p.round}</ThemedTd>
                  <ThemedTd className="font-semibold text-[var(--lg-text-primary)]">{p.playerName || "SKIPPED"}</ThemedTd>
                  <ThemedTd className="text-[var(--lg-text-muted)]">{p.position || "--"}</ThemedTd>
                  <ThemedTd>{p.isAutoPick ? <span className="text-[10px] text-amber-400 font-bold">AUTO</span> : ""}</ThemedTd>
                </ThemedTr>
              ))}
            </tbody>
          </ThemedTable>
        </div>
      )}

      {/* All picks by round */}
      <div className="mt-10">
        <h3 className="text-sm font-semibold mb-4 text-[var(--lg-text-heading)]">All Picks by Round</h3>
        <div className="rounded-xl border border-[var(--lg-border-subtle)] overflow-hidden">
          <ThemedTable>
            <ThemedThead>
              <ThemedTr>
                <ThemedTh className="w-12">#</ThemedTh>
                <ThemedTh className="w-16">Round</ThemedTh>
                <ThemedTh className="w-48">Team</ThemedTh>
                <ThemedTh>Player</ThemedTh>
                <ThemedTh className="w-12">Pos</ThemedTh>
              </ThemedTr>
            </ThemedThead>
            <tbody className="divide-y divide-[var(--lg-divide)]">
              {picks.map(p => (
                <ThemedTr key={p.pickNum}>
                  <ThemedTd className="tabular-nums text-[var(--lg-text-muted)]">{p.pickNum}</ThemedTd>
                  <ThemedTd className="tabular-nums">{p.round}</ThemedTd>
                  <ThemedTd className="font-medium">{teamMap[p.teamId] || `Team ${p.teamId}`}</ThemedTd>
                  <ThemedTd className="font-semibold text-[var(--lg-text-primary)]">{p.playerName || "SKIPPED"}</ThemedTd>
                  <ThemedTd className="text-[var(--lg-text-muted)]">{p.position || "--"}</ThemedTd>
                </ThemedTr>
              ))}
            </tbody>
          </ThemedTable>
        </div>
      </div>
    </div>
  );
}
