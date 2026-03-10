import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { getPlayerSeasonStats, type PlayerSeasonStat, getTeamDetails, getTeams } from "../../../api";
import PlayerDetailModal from "../../../components/PlayerDetailModal";
import TeamRosterManager from "../components/TeamRosterManager";
import { useLeague } from "../../../contexts/LeagueContext";

import { getOgbaTeamName } from "../../../lib/ogbaTeams";
import { isPitcher, normalizePosition, formatAvg, getMlbTeamAbbr } from "../../../lib/playerDisplay";
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

function normalizePosList(raw: any): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  const parts = s
    .split(/[/,| ]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const n = normalizePosition(part);
    if (!n) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }

  return out.join("/");
}

function posEligible(p: any): string {
  const raw = p?.positions ?? p?.pos ?? p?.position ?? p?.positionEligible ?? p?.position_eligible ?? "";
  return normalizePosList(raw);
}

function gamesAtPos(p: any, pos: "DH" | "C" | "1B" | "2B" | "3B" | "SS" | "OF"): number {
  const directKeys = [
    `G_${pos}`,
    `g_${pos}`,
    `GP_${pos}`,
    `gp_${pos}`,
    `G${pos}`,
    `GP${pos}`,
    `games_${pos}`,
    `Games_${pos}`,
    `${pos}_G`,
    `${pos}_games`,
  ];

  for (const k of directKeys) {
    if (p?.[k] != null && String(p[k]).trim() !== "") return asNum(p[k]);
  }

  const nested =
    p?.posGames ??
    p?.gamesByPos ??
    p?.games_by_pos ??
    p?.positionGames ??
    p?.position_games ??
    null;

  if (nested && typeof nested === "object") {
    if (nested[pos] != null) return asNum(nested[pos]);
    const low = String(pos).toLowerCase();
    if (nested[low] != null) return asNum(nested[low]);
  }

  if (pos === "OF") {
    const lf = asNum(p?.G_LF ?? p?.GP_LF ?? p?.games_LF ?? p?.LF_G ?? 0);
    const cf = asNum(p?.G_CF ?? p?.GP_CF ?? p?.games_CF ?? p?.CF_G ?? 0);
    const rf = asNum(p?.G_RF ?? p?.GP_RF ?? p?.games_RF ?? p?.RF_G ?? 0);
    const sum = lf + cf + rf;
    if (sum > 0) return sum;
  }

  return 0;
}

export default function Team() {
  const { teamCode } = useParams();
  const code = normCode(teamCode);
  const { leagueId } = useLeague();

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

  useEffect(() => {
    let ok = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // 1. Find the DB team by code or name (scoped to active league)
        const allTeams = await getTeams(leagueId);
        const ogbaName = getOgbaTeamName(code);
        const team = allTeams.find((t: any) => normCode(t.code) === code)
          || allTeams.find((t: any) => normCode(t.name) === code)
          || allTeams.find((t: any) => t.name.trim() === ogbaName);

        if (!ok) return;

        const foundId = team?.id || 0;

        // 2. Load CSV stats (for stat merging)
        const csvRows = await getPlayerSeasonStats();
        if (!ok) return;

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

            if (csvMatch) {
              // Use CSV stats, overlay DB fields for consistency
              return {
                ...csvMatch,
                ogba_team_code: code,
                mlb_team_abbr: mlbTeam || csvMatch.mlb_team_abbr || csvMatch.mlb_team || "",
                player_name: csvMatch.player_name || playerName,
                price,
              };
            }

            // No CSV match — build a minimal row from DB data
            const pitcherPos = ["P", "SP", "RP"];
            return {
              mlb_id: String(mlbId || ""),
              player_name: playerName,
              ogba_team_code: code,
              positions: posList || posPrimary || "UT",
              posPrimary,
              is_pitcher: pitcherPos.includes(posPrimary),
              R: 0, HR: 0, RBI: 0, SB: 0, H: 0, AB: 0, AVG: 0,
              W: 0, SV: 0, K: 0, IP: 0, ERA: 0, WHIP: 0, BB_H: 0,
              mlb_team_abbr: mlbTeam,
              price,
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

      } catch (e: any) {
        if (!ok) return;
        setError(e?.message ?? "Failed to load team roster");
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

  const hitters = useMemo(() => players.filter((p) => !isPitcher(p)), [players]);
  const pitchers = useMemo(() => players.filter((p) => isPitcher(p)), [players]);

  return (
    <div className="flex-1 min-h-screen bg-[var(--lg-bg)] text-[var(--lg-text-primary)]">
      <main className="max-w-7xl mx-auto px-6 py-12">
        <header className="mb-10 text-center relative">
          <h1 className="text-3xl font-semibold uppercase text-[var(--lg-text-heading)] mb-4">{teamName}</h1>
          <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)] opacity-60">
            Roster: {hitters.length} Hitters • {pitchers.length} Pitchers
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

                    <Th align="center">DH</Th>
                    <Th align="center">C</Th>
                    <Th align="center">1B</Th>
                    <Th align="center">2B</Th>
                    <Th align="center">3B</Th>
                    <Th align="center">SS</Th>
                    <Th align="center">OF</Th>

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
                      <td colSpan={16} className="px-4 py-8 text-center text-sm text-slate-400">
                        Loading roster…
                      </td>
                    </tr>
                  ) : hitters.length === 0 ? (
                    <tr>
                      <td colSpan={16} className="px-4 py-8 text-center text-sm text-slate-400">
                        No hitters found for this roster.
                      </td>
                    </tr>
                  ) : (
                    hitters.map((p: any) => {
                      const key = rowKey(p);
                      const tm = getMlbTeamAbbr(p);
                      const elig = posEligible(p);

                      const gDH = gamesAtPos(p, "DH");
                      const gC = gamesAtPos(p, "C");
                      const g1B = gamesAtPos(p, "1B");
                      const g2B = gamesAtPos(p, "2B");
                      const g3B = gamesAtPos(p, "3B");
                      const gSS = gamesAtPos(p, "SS");
                      const gOF = gamesAtPos(p, "OF");

                      // Grand Slams (supports multiple common key names)
                      const gs = numFromAny(p, "GS", "gs", "GSL", "gsl", "grandSlams", "grand_slams");

                      return (
                        <Tr
                          key={key}
                          className="border-t border-[var(--lg-border-faint)] cursor-pointer hover:bg-[var(--lg-tint)] transition-all"
                          onClick={() => setSelected(p)}
                          title="Click for player details"
                        >
                          <Td align="center">
                            {tm || "—"}
                          </Td>
                          <Td align="center">{p?.player_name ?? p?.name ?? p?.playerName ?? ""}</Td>
                          <Td align="center">
                            {elig || "—"}
                          </Td>

                          <Td align="center">
                            {gDH ? gDH : "—"}
                          </Td>
                          <Td align="center">
                            {gC ? gC : "—"}
                          </Td>
                          <Td align="center">
                            {g1B ? g1B : "—"}
                          </Td>
                          <Td align="center">
                            {g2B ? g2B : "—"}
                          </Td>
                          <Td align="center">
                            {g3B ? g3B : "—"}
                          </Td>
                          <Td align="center">
                            {gSS ? gSS : "—"}
                          </Td>
                          <Td align="center">
                            {gOF ? gOF : "—"}
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
                      <td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-400">
                        Loading roster…
                      </td>
                    </tr>
                  ) : pitchers.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-400">
                        No pitchers found for this roster.
                      </td>
                    </tr>
                  ) : (
                    pitchers.map((p: any) => {
                      const key = rowKey(p);
                      const tm = getMlbTeamAbbr(p);
                      const elig = posEligible(p) || "P";

                      // Shutouts (commonly "SHO"; sometimes "SO" in custom datasets)
                      const so = numFromAny(p, "SHO", "sho", "SO", "so", "shutouts", "shut_outs");

                      return (
                        <Tr
                          key={key}
                          className="border-t border-[var(--lg-border-faint)] cursor-pointer hover:bg-[var(--lg-tint)] transition-all"
                          onClick={() => setSelected(p)}
                          title="Click for player details"
                        >
                          <Td align="center">
                            {tm || "—"}
                          </Td>
                          <Td align="center">{p?.player_name ?? p?.name ?? p?.playerName ?? ""}</Td>
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
                             onClick={() => { setIsManaging(false); window.location.reload(); }}
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
