/*
 * AuctionValues — Aurora port (PR-1 of Auction module rollout).
 *
 * Aurora bento layout for the projected-auction-values viewer used
 * during draft prep. Mirrors the legacy page's behavior 1:1 (Hitters/
 * Pitchers toggle, debounced search, value-relative bar, click-to-open
 * PlayerDetailModal) under AmbientBg with Glass cards.
 *
 * Per the auction-rollout plan this is the lowest-risk auction surface
 * to Aurora-ize first: pre/post-draft only, no WebSocket coupling, no
 * timers, no real-time state machines. PR-2 will tackle the post-draft
 * results surfaces (AuctionComplete + DraftReport + BidHistoryChart);
 * PR-3 will tackle the live floor in a dedicated session.
 *
 * The legacy 247-LOC page is preserved at /auction-values-classic via
 * `AuctionValuesLegacy.tsx`. The /auction-values route is new — the
 * file existed but was orphaned (exported from the module index, but
 * never wired into App.tsx). The Aurora rollout restores reachability.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";

import {
  AmbientBg, Glass, IridText, SectionLabel, Chip,
} from "../../../components/aurora/atoms";
import "../../../components/aurora/aurora.css";
import { getAuctionValues, getLeague, type PlayerSeasonStat } from "../../../api";
import { toNum } from "../../../api/base";
import { useLeague } from "../../../contexts/LeagueContext";
import { useSeasonGating } from "../../../hooks/useSeasonGating";
import { mapPosition } from "../../../lib/sportConfig";
import PlayerDetailModal from "../../../components/shared/PlayerDetailModal";

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
function getValue(p: PlayerSeasonStat): number {
  const dv = (p as any).dollar_value ?? (p as any).dollarValue;
  const v = (p as any).value;
  return toNum(dv ?? v ?? 0);
}
function fmt1(v: number): string {
  return v.toFixed(1);
}

export default function AuctionValues() {
  const { leagueId, outfieldMode } = useLeague();
  const { canViewAuctionResults } = useSeasonGating();
  const [rows, setRows] = useState<PlayerSeasonStat[]>([]);
  const [teamNameMap, setTeamNameMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [group, setGroup] = useState<"hitters" | "pitchers">("hitters");
  const [query, setQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 250);
  };

  const [selected, setSelected] = useState<PlayerSeasonStat | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [data, league] = await Promise.all([
          getAuctionValues(),
          getLeague(leagueId).catch(() => null),
        ]);
        if (!mounted) return;
        setRows(data ?? []);
        if (league?.league?.teams) {
          const map: Record<string, string> = {};
          for (const t of league.league.teams) map[t.code?.toUpperCase() ?? ""] = t.name;
          setTeamNameMap(map);
        }
      } catch (err: unknown) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load auction values.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [leagueId]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
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
    out.sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (bv !== av) return bv - av;
      return playerName(a).localeCompare(playerName(b));
    });
    return out;
  }, [rows, group, debouncedQuery]);

  const maxValue = useMemo(() => {
    return filtered.reduce<number>((max, r) => {
      const v = getValue(r);
      return v > max ? v : max;
    }, 0);
  }, [filtered]);

  const resultCount = filtered.length;

  return (
    <div className="aurora-theme" style={{ position: "relative", minHeight: "100svh" }}>
      <AmbientBg />
      <div style={{ position: "relative", zIndex: 1, padding: "24px 16px 48px", maxWidth: 1200, margin: "0 auto" }}>
        {/* Hero */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div>
            <SectionLabel>✦ Auction Values</SectionLabel>
            <h1 style={{ fontFamily: "var(--am-display)", fontSize: 32, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>
              Projected dollar values.
            </h1>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>
              {canViewAuctionResults
                ? "Pre-draft projections — historical reference only. Season is underway."
                : "Pre-draft projected values for budget planning."}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <SectionLabel style={{ marginBottom: 2 }}>Players</SectionLabel>
            <IridText size={28} weight={300}>{resultCount.toLocaleString()}</IridText>
          </div>
        </div>

        {canViewAuctionResults && (
          <Glass style={{ marginBottom: 16, borderColor: "rgba(217, 119, 6, 0.3)" }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: "rgb(245, 158, 11)" }}>
              These are pre-draft projected values and do not reflect in-season performance. Check the Team page for current stats.
            </div>
          </Glass>
        )}

        {/* Filter row */}
        <Glass strong padded={false} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", padding: 16 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={() => setGroup("hitters")} style={tabBtnStyle(group === "hitters")}>Hitters</button>
              <button type="button" onClick={() => setGroup("pitchers")} style={tabBtnStyle(group === "pitchers")}>Pitchers</button>
            </div>
            <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 480 }}>
              <Search
                size={14}
                style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--am-text-faint)" }}
              />
              <input
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="Search player / team / pos…"
                style={{
                  width: "100%",
                  padding: "9px 14px 9px 36px",
                  borderRadius: 99,
                  border: "1px solid var(--am-border)",
                  background: "var(--am-surface-faint)",
                  color: "var(--am-text)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>
          </div>
        </Glass>

        {/* Table */}
        <Glass padded={false}>
          {loading ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <span style={{ fontSize: 13, color: "var(--am-text-muted)" }}>Loading…</span>
            </div>
          ) : error ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <span style={{ fontSize: 13, color: "rgb(248, 113, 113)" }}>{error}</span>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <span style={{ fontSize: 13, color: "var(--am-text-muted)", fontStyle: "italic" }}>No results.</span>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontVariantNumeric: "tabular-nums" }}>
                <thead>
                  <tr style={{ fontSize: 10, color: "var(--am-text-faint)", textTransform: "uppercase", letterSpacing: 1.2 }}>
                    <th style={thStyle("left")}>Player</th>
                    <th style={thStyle("left", 140)}>Team</th>
                    <th style={thStyle("left", 110)}>Pos</th>
                    <th style={thStyle("right", 100)}>Value</th>
                    <th style={thStyle("left", 220)}>Rel</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => {
                    const value = getValue(p);
                    const ratio = value > 0 && maxValue > 0 ? value / maxValue : 0;
                    const isTop = i === 0 && value > 0;
                    return (
                      <tr
                        key={(p as any).row_id ?? `${p.mlb_id}-${rowIsPitcher(p) ? "P" : "H"}`}
                        onClick={() => setSelected({ ...p, ogba_team_name: teamNameMap[ogbaTeam(p).toUpperCase()] || "" } as PlayerSeasonStat)}
                        style={{ cursor: "pointer", transition: "background 200ms ease" }}
                        className="hover:bg-[var(--am-surface-faint)]"
                      >
                        <td style={tdStyle("left")}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text)" }}>{playerName(p)}</span>
                        </td>
                        <td style={tdStyle("left")}>
                          <span style={{ fontSize: 12, color: "var(--am-text-muted)" }}>
                            {teamNameMap[ogbaTeam(p).toUpperCase()] || ogbaTeam(p) || "FA"}
                          </span>
                        </td>
                        <td style={tdStyle("left")}>
                          <Chip>{mapPosition(posStr(p) || (rowIsPitcher(p) ? "P" : "—"), outfieldMode)}</Chip>
                        </td>
                        <td style={tdStyle("right")}>
                          {isTop ? (
                            <IridText size={15}>${fmt1(value)}</IridText>
                          ) : (
                            <span style={{ fontSize: 13, fontWeight: 600, color: value > 0 ? "var(--am-text)" : "var(--am-text-faint)" }}>
                              {value > 0 ? `$${fmt1(value)}` : "—"}
                            </span>
                          )}
                        </td>
                        <td style={tdStyle("left")}>
                          <div
                            style={{
                              height: 6,
                              width: "100%",
                              borderRadius: 99,
                              background: "var(--am-surface-faint)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: 6,
                                width: `${Math.round(ratio * 100)}%`,
                                background: isTop ? "var(--am-irid)" : "var(--am-chip-strong)",
                                borderRadius: 99,
                                transition: "width 200ms ease",
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Glass>

        {/* Footer escape link */}
        <div style={{ marginTop: 16, textAlign: "center", fontSize: 11, color: "var(--am-text-faint)" }}>
          Need a feature you can't find? <Link to="/auction-values-classic" style={{ color: "var(--am-text-muted)", textDecoration: "underline" }}>View classic Auction Values →</Link>
        </div>
      </div>

      <PlayerDetailModal open={!!selected} player={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function tabBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: "8px 16px",
    borderRadius: 99,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    border: active ? "1px solid var(--am-border-strong)" : "1px solid var(--am-border)",
    background: active ? "var(--am-irid)" : "var(--am-chip)",
    color: active ? "#fff" : "var(--am-text-muted)",
    cursor: "pointer",
    transition: "all 200ms ease",
  };
}

function thStyle(align: "left" | "right" | "center", width?: number): React.CSSProperties {
  return {
    textAlign: align,
    padding: "12px 14px",
    fontWeight: 600,
    width,
    borderBottom: "1px solid var(--am-border)",
  };
}

function tdStyle(align: "left" | "right" | "center"): React.CSSProperties {
  return {
    textAlign: align,
    padding: "10px 14px",
    borderBottom: "1px solid var(--am-border)",
    verticalAlign: "middle",
  };
}
