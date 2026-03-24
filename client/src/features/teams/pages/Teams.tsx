// client/src/pages/Teams.tsx
//
// Teams list:
// - Derives team roster counts from /api/player-season-stats (single fetch)
// - Shows full team names via lib/ogbaTeams
// - Links to /teams/:teamCode

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Users } from "lucide-react";
import { getPlayerSeasonStats, type PlayerSeasonStat } from "../../../api";
import { getOgbaTeamName } from "../../../lib/ogbaTeams";
import { EmptyState } from "../../../components/ui/EmptyState";
import { isPitcher } from "../../../lib/playerDisplay";
import PageHeader from "../../../components/ui/PageHeader";
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";

function normCode(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

type TeamRow = {
  code: string;
  name: string;
  hitters: number;
  pitchers: number;
  total: number;
};

export default function Teams() {
  const [players, setPlayers] = useState<PlayerSeasonStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const rows = await getPlayerSeasonStats();
        if (!mounted) return;
        setPlayers(rows);
        setError(null);
      } catch (err: unknown) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load players for teams");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const teams: TeamRow[] = useMemo(() => {
    if (!players.length) return [];

    // group roster by OGBA team code
    const map = new Map<string, { hitters: number; pitchers: number }>();

    for (const p of players) {
      const code = normCode(p.team ?? p.ogba_team_code ?? "");
      if (!code) continue;
      if (code === "FA" || code.startsWith("FA")) continue;

      const slot = map.get(code) ?? { hitters: 0, pitchers: 0 };
      if (isPitcher(p)) slot.pitchers += 1;
      else slot.hitters += 1;
      map.set(code, slot);
    }

    const rows: TeamRow[] = [...map.entries()].map(([code, v]) => ({
      code,
      name: getOgbaTeamName(code) || code,
      hitters: v.hitters,
      pitchers: v.pitchers,
      total: v.hitters + v.pitchers,
    }));

    // Sort by full name, then code
    rows.sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));

    return rows;
  }, [players]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <PageHeader
        title="Teams"
        subtitle="Team roster counts derived from your season player pool."
      />

      {error && (
        <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-sm font-medium text-red-300">
          Failed to load teams – {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-[var(--lg-text-muted)] py-20 animate-pulse text-sm">Loading teams…</div>
      ) : teams.length === 0 ? (
        <EmptyState icon={Users} title="No teams found" description="Teams will appear here once they're added to the league." compact />
      ) : (
        <div className="lg-card p-0 overflow-hidden">
          <ThemedTable bare>
            <ThemedThead>
              <ThemedTr>
                <ThemedTh align="left">TEAM</ThemedTh>
                <ThemedTh align="left">CODE</ThemedTh>
                <ThemedTh align="center">HITTERS</ThemedTh>
                <ThemedTh align="center">PITCHERS</ThemedTh>
                <ThemedTh align="center">TOTAL</ThemedTh>
                <ThemedTh align="right">{""}</ThemedTh>
              </ThemedTr>
            </ThemedThead>

            <tbody className="divide-y divide-[var(--lg-divide)]">
              {teams.map((t) => (
                <ThemedTr key={t.code} className="hover:bg-[var(--lg-tint)]">
                  <ThemedTd className="font-medium">{t.name}</ThemedTd>
                  <ThemedTd className="text-xs text-[var(--lg-text-muted)]">{t.code}</ThemedTd>
                  <ThemedTd align="center">{t.hitters}</ThemedTd>
                  <ThemedTd align="center">{t.pitchers}</ThemedTd>
                  <ThemedTd align="center">{t.total}</ThemedTd>
                  <ThemedTd align="right">
                    <Link
                      to={`/teams/${encodeURIComponent(t.code)}`}
                      className="inline-flex items-center rounded-xl bg-[var(--lg-tint-hover)] px-4 py-2 text-xs font-medium text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint)]"
                    >
                      View roster
                    </Link>
                  </ThemedTd>
                </ThemedTr>
              ))}
            </tbody>
          </ThemedTable>
        </div>
      )}
    </div>
  );
}
