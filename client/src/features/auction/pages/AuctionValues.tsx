// client/src/pages/AuctionValues.tsx
import React, { useEffect, useMemo, useState } from "react";

import { getAuctionValues, type PlayerSeasonStat } from "../../../api";
import PlayerDetailModal from "../../../components/PlayerDetailModal";
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";

function norm(v: any) {
  return String(v ?? "").trim();
}

function playerName(p: PlayerSeasonStat) {
  return norm((p as any).player_name ?? (p as any).name);
}

function ogbaTeam(p: PlayerSeasonStat) {
  return norm((p as any).ogba_team_code ?? (p as any).team);
}

function posStr(p: PlayerSeasonStat) {
  return norm((p as any).positions ?? (p as any).pos);
}

function rowIsPitcher(p: PlayerSeasonStat) {
  const v = (p as any).is_pitcher;
  if (typeof v === "boolean") return v;
  const g = String((p as any).group ?? "").toUpperCase();
  if (g === "P") return true;
  if (g === "H") return false;
  return Boolean((p as any).isPitcher);
}

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Canonical “auction value” getter (handles multiple field names)
function getValue(p: PlayerSeasonStat): number {
  // prefer dollar_value then value
  const dv = (p as any).dollar_value ?? (p as any).dollarValue;
  const v = (p as any).value;
  const z = (p as any).z_total ?? (p as any).relValue;
  // We display “value” (dollars). z_total is not used for ranking here.
  return toNum(dv ?? v ?? 0);
}

function fmt1(v: number): string {
  return v.toFixed(1);
}

export default function AuctionValues() {
  const [rows, setRows] = useState<PlayerSeasonStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [group, setGroup] = useState<"hitters" | "pitchers">("hitters");
  const [query, setQuery] = useState<string>("");

  const [selected, setSelected] = useState<PlayerSeasonStat | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getAuctionValues();
        if (!mounted) return;
        setRows(data ?? []);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? "Failed to load auction values.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const wantPitchers = group === "pitchers";

    let out = (rows ?? []).filter((p) => (wantPitchers ? rowIsPitcher(p) : !rowIsPitcher(p)));

    if (q) {
      out = out.filter((p) => {
        const name = playerName(p).toLowerCase();
        const team = ogbaTeam(p).toLowerCase();
        const pos = posStr(p).toLowerCase();
        return name.includes(q) || team.includes(q) || pos.includes(q);
      });
    }

    // Sort by value desc, then name asc
    out.sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (bv !== av) return bv - av;
      return playerName(a).localeCompare(playerName(b));
    });

    return out;
  }, [rows, group, query]);

  const maxValue = useMemo(() => {
    // numeric accumulator, always returns number
    return filtered.reduce<number>((max, r) => {
      const v = getValue(r);
      return v > max ? v : max;
    }, 0);
  }, [filtered]);

  return (
    <div className="px-10 py-8">
      <div className="mb-6 text-center">
        <div className="text-4xl font-semibold text-[var(--lg-text-heading)]">Auction Values</div>
        <div className="mt-2 text-sm text-white/60">
          Read-only display of auction values (engine is deferred).
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
        <div className="rounded-full bg-[var(--lg-tint)] p-1">
          <button
            className={`rounded-full px-4 py-2 text-sm ${
              group === "hitters" ? "bg-sky-600/80 text-white" : "text-white/70 hover:bg-[var(--lg-tint-hover)]"
            }`}
            onClick={() => setGroup("hitters")}
          >
            Hitters
          </button>
          <button
            className={`rounded-full px-4 py-2 text-sm ${
              group === "pitchers" ? "bg-sky-600/80 text-white" : "text-white/70 hover:bg-[var(--lg-tint-hover)]"
            }`}
            onClick={() => setGroup("pitchers")}
          >
            Pitchers
          </button>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search player / team / pos…"
          className="w-[320px] rounded-full border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] px-4 py-2 text-sm text-white placeholder:text-white/40"
        />
      </div>

      <div className="mx-auto max-w-6xl">
        <ThemedTable>
          <ThemedThead>
            <ThemedTr>
              <ThemedTh>PLAYER</ThemedTh>
              <ThemedTh className="w-[90px]">TEAM</ThemedTh>
              <ThemedTh className="w-[110px]">POS</ThemedTh>
              <ThemedTh align="right" className="w-[110px]">VALUE</ThemedTh>
              <ThemedTh className="w-[220px]">REL</ThemedTh>
            </ThemedTr>
          </ThemedThead>

          <tbody>
            {loading ? (
              <ThemedTr>
                <ThemedTd colSpan={5} className="py-6">
                  <span className="text-[var(--lg-text-muted)]">Loading…</span>
                </ThemedTd>
              </ThemedTr>
            ) : error ? (
              <ThemedTr>
                <ThemedTd colSpan={5} className="py-6">
                  <span className="text-red-300">{error}</span>
                </ThemedTd>
              </ThemedTr>
            ) : filtered.length === 0 ? (
              <ThemedTr>
                <ThemedTd colSpan={5} className="py-6">
                  <span className="text-[var(--lg-text-muted)]">No results.</span>
                </ThemedTd>
              </ThemedTr>
            ) : (
              filtered.map((p) => {
                const value = getValue(p); // number
                const ratio = value > 0 && maxValue > 0 ? value / maxValue : 0;

                return (
                  <ThemedTr
                    key={(p as any).row_id ?? `${p.mlb_id}-${rowIsPitcher(p) ? "P" : "H"}`}
                    onClick={() => setSelected(p)}
                  >
                    <ThemedTd>{playerName(p)}</ThemedTd>
                    <ThemedTd>{ogbaTeam(p) || "FA"}</ThemedTd>
                    <ThemedTd>{posStr(p) || (rowIsPitcher(p) ? "P" : "—")}</ThemedTd>
                    <ThemedTd align="right">{value > 0 ? fmt1(value) : "-"}</ThemedTd>
                    <ThemedTd>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--lg-tint-hover)]">
                        <div
                          className="h-2 rounded-full bg-sky-500/80"
                          style={{ width: `${Math.round(ratio * 100)}%` }}
                        />
                      </div>
                    </ThemedTd>
                  </ThemedTr>
                );
              })
            )}
          </tbody>
        </ThemedTable>
      </div>

      <PlayerDetailModal open={!!selected} player={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

