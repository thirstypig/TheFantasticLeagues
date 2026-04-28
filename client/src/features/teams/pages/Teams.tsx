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
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";

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
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <Glass strong>
        <SectionLabel>✦ Teams</SectionLabel>
        <h1 style={{ fontFamily: "var(--am-display)", fontSize: 30, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>
          Teams
        </h1>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>
          Team roster counts derived from your season player pool.
        </div>
      </Glass>

      {error && (
        <Glass>
          <div style={{ padding: 8, color: "rgb(248, 113, 113)", fontSize: 13, textAlign: "center" }}>
            Failed to load teams – {error}
          </div>
        </Glass>
      )}

      {loading ? (
        <Glass>
          <div style={{ padding: 32, textAlign: "center", color: "var(--am-text-muted)", fontSize: 13 }}>Loading teams…</div>
        </Glass>
      ) : teams.length === 0 ? (
        <Glass>
          <EmptyState icon={Users} title="No teams found" description="Teams will appear here once they're added to the league." compact />
        </Glass>
      ) : (
        <Glass padded={false}><div style={{ overflow: "hidden", borderRadius: 24 }}>
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
        </div></Glass>
      )}
    </div>
  );
}
