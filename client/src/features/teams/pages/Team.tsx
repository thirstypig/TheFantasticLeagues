import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { getPlayerSeasonStats, type PlayerSeasonStat, getTeamDetails, getTeams } from "../../../api";
import PlayerDetailModal from "../../../components/PlayerDetailModal";
import PlayerExpandedRow from "../../auction/components/PlayerExpandedRow";
import TeamRosterManager from "../components/TeamRosterManager";
import { useLeague } from "../../../contexts/LeagueContext";

import { getOgbaTeamName } from "../../../lib/ogbaTeams";
import { isPitcher, normalizePosition, formatAvg, getMlbTeamAbbr } from "../../../lib/playerDisplay";
import { mapPosition } from "../../../lib/sportConfig";
import { TableCard, Table, THead, Tr, Th, Td } from "../../../components/ui/TableCard";
import { Button } from "../../../components/ui/button";

function normCode(v: any): string {
  return String(v ?? "").trim().toUpperCase();
}

function asNum(v: any): number {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function numFromAny(p: any, ...keys: string[]): number {
  for (const k of keys) {
    if (p?.[k] != null && String(p[k]).trim() !== "") return asNum(p[k]);
  }
  return 0;
}

function rowKey(p: any): string {
  return String(p?.row_id ?? p?.id ?? `${p?.mlb_id ?? p?.mlbId ?? ""}-${isPitcher(p) ? "P" : "H"}`);
}

function normalizePosList(raw: any, ofMode: string = "OF"): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  const parts = s
    .split(/[/,| ]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const n = mapPosition(normalizePosition(part), ofMode);
    if (!n) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }

  return out.join("/");
}

function posEligible(p: any, ofMode: string = "OF"): string {
  const raw = p?.positions ?? p?.pos ?? p?.position ?? p?.positionEligible ?? p?.position_eligible ?? "";
  return normalizePosList(raw, ofMode);
}


export default function Team() {
  const { teamCode } = useParams();
  const code = normCode(teamCode);
  const { leagueId, outfieldMode } = useLeague();

  const loc = useLocation();
  const activeTab: "hitters" | "pitchers" = loc.hash === "#pitchers" ? "pitchers" : "hitters";

  const [players, setPlayers] = useState<PlayerSeasonStat[]>([]);
  const [loading, setLoading] = useState(true);
  // Roster Manager State
  const [isManaging, setIsManaging] = useState(false);
  const [dbTeamId, setDbTeamId] = useState<number | null>(null);
  const [currentRoster, setCurrentRoster] = useState<any[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PlayerSeasonStat | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let ok = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // 1. Load teams + CSV stats in parallel (independent calls)
        const [allTeams, csvRows] = await Promise.all([
          getTeams(leagueId),
          getPlayerSeasonStats(),
        ]);
        if (!ok) return;

        const ogbaName = getOgbaTeamName(code);
        const team = allTeams.find((t: any) => normCode(t.code) === code)
          || allTeams.find((t: any) => normCode(t.name) === code)
          || allTeams.find((t: any) => t.name.trim() === ogbaName);

        const foundId = team?.id || 0;

        if (foundId) {
          setDbTeamId(foundId);

          // 3. Load DB roster (source of truth for who is on the team)
          const details = await getTeamDetails(foundId);
          if (!ok) return;
          setCurrentRoster(details.currentRoster || []);

          // 4. Build player list from DB roster, merge in CSV stats
          const dbRoster: any[] = details.currentRoster || [];
          const merged: PlayerSeasonStat[] = dbRoster.map((r: any) => {
            // teamService returns flat objects (not nested under .player)
            const mlbId = r.mlbId || r.mlb_id || r.player?.mlbId;
            const playerName = r.name || r.player?.name || "";
            const posPrimary = r.posPrimary || r.player?.posPrimary || "";
            const mlbTeam = r.mlbTeam || r.player?.mlbTeam || "";
            const posList = r.posList || r.player?.posList || "";
            const price = r.price ?? 0;

            // Find matching CSV row by mlb_id
            const csvMatch = mlbId
              ? (csvRows ?? []).find((s: any) => Number(s.mlb_id || s.mlbId) === Number(mlbId))
              : null;

            const isKeeper = r.isKeeper ?? false;

            if (csvMatch) {
              // Use CSV stats, overlay DB fields for consistency
              return {
                ...csvMatch,
                ogba_team_code: code,
                ogba_team_name: team?.name ?? "",
                mlb_team_abbr: mlbTeam || csvMatch.mlb_team_abbr || csvMatch.mlb_team || "",
                player_name: csvMatch.player_name || playerName,
                price,
                isKeeper,
              };
            }

            // No CSV match — build a minimal row from DB data
            const pitcherPos = ["P", "SP", "RP"];
            return {
              mlb_id: String(mlbId || ""),
              player_name: playerName,
              ogba_team_code: code,
              ogba_team_name: team?.name ?? "",
              positions: posList || posPrimary || "UT",
              posPrimary,
              is_pitcher: pitcherPos.includes(posPrimary),
              R: 0, HR: 0, RBI: 0, SB: 0, H: 0, AB: 0, AVG: 0,
              W: 0, SV: 0, K: 0, IP: 0, ERA: 0, WHIP: 0, BB_H: 0,
              mlb_team_abbr: mlbTeam,
              price,
              isKeeper,
            } as unknown as PlayerSeasonStat;
          });

          setPlayers(merged);
        } else {
          // Fallback: filter CSV data by team code (legacy behavior)
          const filtered = (csvRows ?? []).filter(
            (p: any) => normCode(p?.ogba_team_code ?? p?.team ?? p?.ogbaTeamCode) === code
          );
          setPlayers(filtered);
        }

      } catch (err: unknown) {
        if (!ok) return;
        setError(err instanceof Error ? err.message : "Failed to load team roster");
        setPlayers([]);
      } finally {
        if (ok) setLoading(false);
      }
    }

    load();
    return () => {
      ok = false;
    };
  }, [code, leagueId]);

  const teamName = useMemo(() => getOgbaTeamName(code) || code, [code]);

  const hitters = useMemo(() => {
    const list = players.filter((p) => !isPitcher(p));
    list.sort((a, b) => ((b as any).isKeeper ? 1 : 0) - ((a as any).isKeeper ? 1 : 0));
    return list;
  }, [players]);
  const pitchers = useMemo(() => {
    const list = players.filter((p) => isPitcher(p));
    list.sort((a, b) => ((b as any).isKeeper ? 1 : 0) - ((a as any).isKeeper ? 1 : 0));
    return list;
  }, [players]);

  return (
    <div className="flex-1 min-h-screen bg-[var(--lg-bg)] text-[var(--lg-text-primary)]">
      <main className="max-w-7xl mx-auto px-6 py-12">
        <header className="mb-10 text-center relative">
          <h1 className="text-3xl font-semibold uppercase text-[var(--lg-text-heading)] mb-4">{teamName}</h1>
          <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)] opacity-60">
            Roster: {hitters.length} Hitters • {pitchers.length} Pitchers
            {players.some((p: any) => p.isKeeper) && (
              <span className="ml-3 text-amber-500">
                • {players.filter((p: any) => p.isKeeper).length} Keepers
              </span>
            )}
          </div>
          
          <div className="mt-8 flex justify-center gap-6">
             <Link to="/season">
               <Button variant="ghost" size="sm">
                 <span className="opacity-40 ml-[-4px] mr-2">←</span> Teams
               </Button>
             </Link>
             
             {/* Manage Button - Only show if DB data loaded */}
             {dbTeamId && (
                 <Button 
                    onClick={() => setIsManaging(true)}
                 >
                    <span>Manage Roster</span>
                 </Button>
             )}
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mb-10 flex justify-center">
          <div className="lg-card p-1">
            <Link to="#hitters">
              <Button
                variant={activeTab === "hitters" ? "default" : "ghost"}
                className="px-8"
              >
                Hitters
              </Button>
            </Link>
            <Link to="#pitchers">
              <Button
                variant={activeTab === "pitchers" ? "default" : "ghost"}
                className="px-8"
              >
                Pitchers
              </Button>
            </Link>
          </div>
        </div>

        {activeTab === "hitters" ? (
          <section id="hitters">
            <TableCard>
              <Table>
                <THead>
                  <Tr>
                    <Th align="center">TM</Th>
                    <Th align="center">PLAYER</Th>
                    <Th align="center">ELIG</Th>
                    <Th align="center">R</Th>
                    <Th align="center">HR</Th>
                    <Th align="center">RBI</Th>
                    <Th align="center">SB</Th>
                    <Th align="center">AVG</Th>
                    <Th align="center">GS</Th>
                  </Tr>
                </THead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm text-[var(--lg-text-muted)]">
                        Loading roster…
                      </td>
                    </tr>
                  ) : hitters.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm text-[var(--lg-text-muted)]">
                        No hitters found for this roster.
                      </td>
                    </tr>
                  ) : (
                    hitters.map((p: any) => {
                      const key = rowKey(p);
                      const tm = getMlbTeamAbbr(p);
                      const elig = posEligible(p, outfieldMode);
                      const isExpanded = expandedId === key;

                      // Grand Slams (supports multiple common key names)
                      const gs = numFromAny(p, "GS", "gs", "GSL", "gsl", "grandSlams", "grand_slams");

                      return (
                        <React.Fragment key={key}>
                          <Tr
                            className={`border-t border-[var(--lg-border-faint)] cursor-pointer transition-all ${isExpanded ? 'bg-[var(--lg-accent)]/10' : 'hover:bg-[var(--lg-tint)]'}`}
                            onClick={() => setExpandedId(isExpanded ? null : key)}
                            title="Click to expand player details"
                          >
                            <Td align="center">
                              {tm || "—"}
                            </Td>
                            <Td align="center">
                              <span className="inline-flex items-center gap-1.5">
                                {p?.player_name ?? p?.name ?? p?.playerName ?? ""}
                                {(p as any)?.isKeeper && <span className="text-[10px] font-semibold uppercase text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1 py-px rounded" title="Keeper">K</span>}
                              </span>
                            </Td>
                            <Td align="center">
                              {elig || "—"}
                            </Td>
                            <Td align="center">
                              {asNum(p?.R)}
                            </Td>
                            <Td align="center">
                              {asNum(p?.HR)}
                            </Td>
                            <Td align="center">
                              {asNum(p?.RBI)}
                            </Td>
                            <Td align="center">
                              {asNum(p?.SB)}
                            </Td>
                            <Td align="center">
                              {formatAvg(p?.AVG)}
                            </Td>
                            <Td align="center">
                              {gs}
                            </Td>
                          </Tr>
                          {isExpanded && (
                            <PlayerExpandedRow
                              player={p}
                              isTaken={true}
                              ownerName={teamName}
                              onViewDetail={setSelected}
                              colSpan={9}
                            />
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </Table>
            </TableCard>
          </section>
        ) : (
          <section id="pitchers">
            <TableCard>
              <Table>
                <THead>
                  <Tr>
                    <Th align="center">TM</Th>
                    <Th align="center">PLAYER</Th>
                    <Th align="center">ELIG</Th>
                    <Th align="center">W</Th>
                    <Th align="center">SV</Th>
                    <Th align="center">K</Th>
                    <Th align="center">IP</Th>
                    <Th align="center">ERA</Th>
                    <Th align="center">WHIP</Th>
                    <Th align="center">SO</Th>
                  </Tr>
                </THead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-sm text-[var(--lg-text-muted)]">
                        Loading roster…
                      </td>
                    </tr>
                  ) : pitchers.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-sm text-[var(--lg-text-muted)]">
                        No pitchers found for this roster.
                      </td>
                    </tr>
                  ) : (
                    pitchers.map((p: any) => {
                      const key = rowKey(p);
                      const tm = getMlbTeamAbbr(p);
                      const elig = posEligible(p, outfieldMode) || "P";
                      const isExpanded = expandedId === key;

                      // Shutouts (commonly "SHO"; sometimes "SO" in custom datasets)
                      const so = numFromAny(p, "SHO", "sho", "SO", "so", "shutouts", "shut_outs");

                      return (
                        <React.Fragment key={key}>
                          <Tr
                            className={`border-t border-[var(--lg-border-faint)] cursor-pointer transition-all ${isExpanded ? 'bg-[var(--lg-accent)]/10' : 'hover:bg-[var(--lg-tint)]'}`}
                            onClick={() => setExpandedId(isExpanded ? null : key)}
                            title="Click to expand player details"
                          >
                            <Td align="center">
                              {tm || "—"}
                            </Td>
                            <Td align="center">
                              <span className="inline-flex items-center gap-1.5">
                                {p?.player_name ?? p?.name ?? p?.playerName ?? ""}
                                {(p as any)?.isKeeper && <span className="text-[10px] font-semibold uppercase text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1 py-px rounded" title="Keeper">K</span>}
                              </span>
                            </Td>
                            <Td align="center">
                              {elig}
                            </Td>

                            <Td align="center">
                              {asNum(p?.W)}
                            </Td>
                            <Td align="center">
                              {asNum(p?.SV)}
                            </Td>
                            <Td align="center">
                              {asNum(p?.K)}
                            </Td>
                            <Td align="center">
                              {String(p?.IP ?? "").trim() || "—"}
                            </Td>
                            <Td align="center">
                              {String(p?.ERA ?? "").trim() || "—"}
                            </Td>
                            <Td align="center">
                              {String(p?.WHIP ?? "").trim() || "—"}
                            </Td>
                            <Td align="center">
                              {so}
                            </Td>
                          </Tr>
                          {isExpanded && (
                            <PlayerExpandedRow
                              player={p}
                              isTaken={true}
                              ownerName={teamName}
                              onViewDetail={setSelected}
                              colSpan={10}
                            />
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </Table>
            </TableCard>
          </section>
        )}

        {selected ? <PlayerDetailModal player={selected} onClose={() => setSelected(null)} /> : null}

        {/* Roster Manager Modal */}
        {isManaging && (
             <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4">
                 <div className="w-full max-w-7xl h-[90vh] bg-[#0c0c0c] rounded-3xl border border-[var(--lg-border-subtle)] shadow-2xl overflow-hidden flex flex-col liquid-glass">
                      <div className="p-6 border-b border-[var(--lg-border-subtle)] flex justify-between items-center bg-[var(--lg-tint)]">
                          <h2 className="text-xl font-semibold uppercase text-[var(--lg-text-heading)]">Roster Management</h2>
                          <Button
                             onClick={() => { setIsManaging(false); }}
                             variant="ghost"
                             size="icon"
                          >
                             ✕
                          </Button>
                      </div>
                     <div className="flex-1 overflow-hidden p-8 bg-black/20">
                         <TeamRosterManager 
                            teamId={dbTeamId || 0}
                            roster={currentRoster} 
                            onUpdate={() => {}} 
                         />
                     </div>
                 </div>
             </div>
        )}
      </main>
    </div>
  );
}
