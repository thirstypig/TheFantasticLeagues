// client/src/pages/Teams.tsx
//
// Teams list:
// - Derives team roster counts from /api/player-season-stats (single fetch)
// - Shows full team names via lib/ogbaTeams
// - Links to /teams/:teamCode

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getPlayerSeasonStats, type PlayerSeasonStat } from "../../../api";
import { getOgbaTeamName } from "../../../lib/ogbaTeams";
import { isPitcher } from "../../../lib/playerDisplay";
import PageHeader from "../../../components/ui/PageHeader";

function normCode(v: any): string {
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
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? "Failed to load players for teams");
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

    for (const p of players as any[]) {
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
    <div className="px-10 py-8 text-slate-100">
      <PageHeader 
        title="Teams" 
        subtitle="Team roster counts derived from your season player pool." 
      />

      {error && (
        <div className="mb-4 rounded-md border border-red-400 bg-red-900/40 px-4 py-2 text-sm text-red-100">
          Failed to load teams – {error}
        </div>
      )}

      {loading ? (
        <div className="mt-4 text-sm text-slate-300">Loading teams…</div>
      ) : teams.length === 0 ? (
        <div className="mt-4 text-sm text-slate-300">No teams found.</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/60">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs text-slate-300">TEAM</th>
                <th className="px-4 py-3 text-left text-xs text-slate-300">CODE</th>
                <th className="px-4 py-3 text-center text-xs text-slate-300">HITTERS</th>
                <th className="px-4 py-3 text-center text-xs text-slate-300">PITCHERS</th>
                <th className="px-4 py-3 text-center text-xs text-slate-300">TOTAL</th>
                <th className="px-4 py-3 text-right text-xs text-slate-300"></th>
              </tr>
            </thead>

            <tbody>
              {teams.map((t) => (
                <tr key={t.code} className="border-t border-slate-800/80">
                  <td className="px-4 py-3 text-sm font-medium text-slate-100">{t.name}</td>
                  <td className="px-4 py-3 text-xs text-slate-300">{t.code}</td>
                  <td className="px-4 py-3 text-center">{t.hitters}</td>
                  <td className="px-4 py-3 text-center">{t.pitchers}</td>
                  <td className="px-4 py-3 text-center">{t.total}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/teams/${encodeURIComponent(t.code)}`}
                      className="inline-flex items-center rounded-xl bg-[var(--lg-tint-hover)] px-4 py-2 text-xs font-medium text-slate-100 hover:bg-[var(--lg-tint-hover)]"
                    >
                      View roster
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
