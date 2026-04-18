// client/src/components/PlayerDetailModal.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePlayerNews } from "../../hooks/usePlayerNews";

import {
  getPlayerCareerStats,
  getPlayerFieldingStats,
  getPlayerProfile,
  getPlayerRecentStats,
  getPlayerNews,
  type FieldingStatRow,
  type HOrP,
  type PlayerProfile,
  type PlayerSeasonStat,
  type PlayerTransaction,
  type CareerHittingRow,
  type CareerPitchingRow,
  type RecentHittingRow,
  type RecentPitchingRow,
} from "../../api";
import { toNum } from "../../api/base";
import { useLeague } from "../../contexts/LeagueContext";
import { mapPosition, resolveRealMlbId } from "../../lib/sportConfig";
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../ui/ThemedTable";

type Props = {
  player: PlayerSeasonStat | null;
  onClose: () => void;
  open?: boolean; // allows controlling visibility externally
};

type TabId = "stats" | "profile";

function norm(v: any) {
  return String(v ?? "").trim();
}

function isPitcherRow(p: PlayerSeasonStat): boolean {
  const v = (p as any).is_pitcher;
  if (typeof v === "boolean") return v;
  const g = norm((p as any).group).toUpperCase();
  if (g === "P") return true;
  if (g === "H") return false;
  return Boolean((p as any).isPitcher);
}

function fmt3(x: number): string {
  if (!Number.isFinite(x)) return "—";
  const s = x.toFixed(3);
  return s.startsWith("0") ? s.slice(1) : s;
}

function fmt2(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(2);
}

function deriveMode(p: PlayerSeasonStat): HOrP {
  return isPitcherRow(p) ? "pitching" : "hitting";
}

function transactionBadgeClass(typeDesc: string): string {
  const t = typeDesc.toLowerCase();
  if (t.includes("trade")) return "bg-orange-500/10 text-orange-400 border border-orange-500/20";
  if (t.includes("injured") || t.includes("il") || t.includes("disabled")) return "bg-red-500/10 text-red-400 border border-red-500/20";
  if (t.includes("recalled") || t.includes("selected") || t.includes("call")) return "bg-green-500/10 text-green-400 border border-green-500/20";
  if (t.includes("option") || t.includes("assign") || t.includes("designat") || t.includes("dfa")) return "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20";
  if (t.includes("sign") || t.includes("free agent")) return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
  return "bg-[var(--lg-tint)] text-[var(--lg-text-muted)] border border-[var(--lg-border-faint)]";
}

function formatTransactionDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatRelativeDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffH = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffH < 1) return "Just now";
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return "Yesterday";
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

/**
 * Liquid Glass Styles for Modal
 */
const overlayCls =
  "fixed inset-0 z-50 bg-black/40 backdrop-blur-[4px] flex items-center justify-center p-4 animate-in fade-in duration-200";

const modalCls =
  "w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-[var(--lg-glass-bg)] backdrop-blur-[var(--lg-glass-blur)] rounded-[var(--lg-radius-2xl)] border border-[var(--lg-glass-border)] shadow-[var(--lg-glass-shadow)] animate-in zoom-in-95 duration-200";

const headerCls =
  "flex items-start justify-between gap-4 px-8 py-6 border-b border-[var(--lg-glass-border)] bg-[var(--lg-tint)]";

const bodyCls = "flex-1 overflow-y-auto px-8 py-6 custom-scrollbar";

const tabWrapCls = "flex gap-1 bg-[var(--lg-tint)] p-1 rounded-[var(--lg-radius-lg)] border border-[var(--lg-glass-border)]";
const tabBtnBase =
  "px-4 py-1.5 rounded-[var(--lg-radius-md)] text-xs font-medium uppercase transition-all duration-200";
const tabBtnActive = "bg-[var(--lg-accent)] text-white shadow-lg shadow-blue-500/20";
const tabBtnInactive = "text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint)]";

const sectionCls = "rounded-[var(--lg-radius-xl)] border border-[var(--lg-glass-border)] bg-[var(--lg-tint)] overflow-hidden";
const sectionHeadCls =
  "px-6 py-4 border-b border-[var(--lg-glass-border)] bg-[var(--lg-tint)] flex items-center justify-between";
const sectionTitleCls = "text-xs font-medium uppercase text-[var(--lg-text-muted)]";
const sectionBodyCls = "p-0";


function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-2 rounded-[var(--lg-radius-lg)] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint-hover)] transition-colors"
      aria-label="Close"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

export default function PlayerDetailModal({ player, onClose, open }: Props) {
  const isVisible = open !== undefined ? open : !!player;
  const { outfieldMode } = useLeague();

  const [tab, setTab] = useState<TabId>("stats");

  const rawMlbId = useMemo(() => norm(player?.mlb_id), [player]);
  const mlbId = useMemo(() => resolveRealMlbId(rawMlbId), [rawMlbId]);
  const mode = useMemo(() => (player ? deriveMode(player) : "hitting"), [player]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [recentRows, setRecentRows] = useState<
    Array<RecentHittingRow | RecentPitchingRow>
  >([]);
  const [careerRows, setCareerRows] = useState<
    Array<CareerHittingRow | CareerPitchingRow>
  >([]);
  const [fieldingRows, setFieldingRows] = useState<FieldingStatRow[]>([]);
  const [newsRows, setNewsRows] = useState<PlayerTransaction[]>([]);
  const [profileFailed, setProfileFailed] = useState(false);
  const [recentFailed, setRecentFailed] = useState(false);
  const [careerFailed, setCareerFailed] = useState(false);

  // Fetch RSS feed articles mentioning this player
  const playerNameForNews = isVisible ? (player?.player_name ?? (player as any)?.name ?? null) : null;
  const { articles: feedArticles, loading: feedLoading } = usePlayerNews(playerNameForNews);
  useEffect(() => {
    setTab("stats");
    setErr("");
    setProfile(null);
    setRecentRows([]);
    setCareerRows([]);
    setFieldingRows([]);
    setNewsRows([]);
    setProfileFailed(false);
    setRecentFailed(false);
    setCareerFailed(false);
  }, [rawMlbId]);

  useEffect(() => {
    if (!player || !mlbId || !isVisible) return;

    let cancelled = false;
    setLoading(true);
    setErr("");

    (async () => {
      try {
        const results = await Promise.allSettled([
          getPlayerProfile(mlbId),
          getPlayerRecentStats(mlbId, mode),
          getPlayerCareerStats(mlbId, mode),
          getPlayerFieldingStats(mlbId),
          getPlayerNews(mlbId),
        ]);

        if (cancelled) return;

        const [profileResult, recentResult, careerResult, fieldingResult, newsResult] = results;

        if (profileResult.status === "fulfilled") {
          setProfile(profileResult.value);
        } else {
          setProfileFailed(true);
        }
        if (recentResult.status === "fulfilled") {
          setRecentRows(recentResult.value.rows ?? []);
        } else {
          setRecentFailed(true);
        }
        if (careerResult.status === "fulfilled") {
          setCareerRows(careerResult.value.rows ?? []);
        } else {
          setCareerFailed(true);
        }
        if (fieldingResult.status === "fulfilled") {
          setFieldingRows(fieldingResult.value ?? []);
        }
        if (newsResult.status === "fulfilled") {
          setNewsRows(newsResult.value ?? []);
        }

        // Show a friendly error only if ALL fetches failed
        const allFailed = results.every(r => r.status === "rejected");
        if (allFailed) {
          setErr("Unable to load player data from MLB. Please try again later.");
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setErr("Unable to load player data. Please try again later.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [player, mlbId, mode, isVisible]);

  // Focus trap + Escape handler
  const modalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!player) return;
    // Store the element that had focus so we can restore it on close
    const previousFocus = document.activeElement as HTMLElement | null;

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") { onClose(); return; }
      if (ev.key !== "Tab" || !modalRef.current) return;

      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    };

    // Focus the modal on open
    requestAnimationFrame(() => modalRef.current?.focus());

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [player, onClose]);

  if (!isVisible || !player) return null;

  const title = norm(player.player_name ?? (player as any).name ?? "Player");
  const pos = norm(player.positions ?? (player as any).pos ?? "");
  const fantasyTeam = norm((player as any).ogba_team_name ?? "");
  const mlbTeam = norm((player as any).mlbTeam ?? (player as any).mlb_team_abbr ?? player.mlb_team ?? "");
  const roleLabel = mode === "pitching" ? "Pitching" : "Hitting";

  // Merge fielding positions based on outfieldMode (CF/RF/LF → OF when mode is "OF")
  const mappedFieldingRows = useMemo(() => {
    if (!fieldingRows.length) return fieldingRows;
    const merged = new Map<string, { position: string; games: number; gamesStarted: number; innings: number }>();
    for (const f of fieldingRows) {
      const mapped = mapPosition(f.position, outfieldMode);
      const prev = merged.get(mapped) ?? { position: mapped, games: 0, gamesStarted: 0, innings: 0 };
      prev.games += f.games;
      prev.gamesStarted += f.gamesStarted;
      prev.innings += f.innings;
      merged.set(mapped, prev);
    }
    return Array.from(merged.values()).sort((a, b) => b.games - a.games);
  }, [fieldingRows, outfieldMode]);

  return (
    <div
      className={overlayCls}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div ref={modalRef} tabIndex={-1} className={modalCls} onMouseDown={e => e.stopPropagation()}>
        <div className={headerCls}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <h2 className="text-3xl font-semibold text-[var(--lg-text-heading)] leading-none truncate">
                {title}
              </h2>
              <span className={`px-2 py-0.5 rounded-[var(--lg-radius-sm)] text-xs font-medium uppercase ${mode === 'pitching' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                {roleLabel}
              </span>
            </div>

            <div className="mt-3 text-xs font-medium uppercase text-[var(--lg-text-muted)] flex flex-wrap gap-x-6 gap-y-1">
              {pos ? <div className="flex gap-2"><span>POS:</span> <span className="text-[var(--lg-text-primary)]">{pos}</span></div> : null}
              {fantasyTeam ? <div className="flex gap-2"><span>Team:</span> <span className="text-[var(--lg-text-primary)]">{fantasyTeam}</span></div> : null}
              {mlbTeam ? <div className="flex gap-2"><span>MLB:</span> <span className="text-[var(--lg-text-primary)]">{mlbTeam}</span></div> : null}
              {mlbId ? <div className="flex gap-2 opacity-60"><span>MLB ID:</span> <span>{mlbId}</span></div> : null}
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className={tabWrapCls}>
              <button
                className={`${tabBtnBase} ${tab === "stats" ? tabBtnActive : tabBtnInactive}`}
                onClick={() => setTab("stats")}
              >
                Stats
              </button>
              <button
                className={`${tabBtnBase} ${tab === "profile" ? tabBtnActive : tabBtnInactive}`}
                onClick={() => setTab("profile")}
              >
                Profile
              </button>
            </div>
            <CloseButton onClick={onClose} />
          </div>
        </div>

        <div className={bodyCls}>
          {err ? (
            <div className="mb-6 px-4 py-3 rounded-[var(--lg-radius-lg)] border border-red-500/20 bg-red-500/5 text-sm text-[var(--lg-text-muted)]">
              {err}
            </div>
          ) : null}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-[var(--lg-text-muted)]">
              <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
              <div className="font-medium uppercase text-xs">Loading...</div>
            </div>
          ) : tab === "profile" ? (
            <div className="grid grid-cols-1 gap-8">
              {/* Player Info */}
              <div className={sectionCls}>
                <div className={sectionHeadCls}>
                  <div className={sectionTitleCls}>Player Info</div>
                  {profile?.active !== undefined && (
                    <span className={`px-2 py-0.5 rounded-[var(--lg-radius-sm)] text-xs font-medium uppercase ${profile.active ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                      {profile.active ? "Active" : "Inactive"}
                    </span>
                  )}
                </div>
                <div className="p-8">
                  {profile ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                      <ProfileField label="Full Name" value={profile.fullName} />
                      <ProfileField label="Team" value={profile.currentTeam || mlbTeam || undefined} />
                      <ProfileField label="Position" value={profile.primaryPosition} />
                      <ProfileField label="Jersey #" value={profile.jerseyNumber ? `#${profile.jerseyNumber}` : undefined} />
                      <ProfileField label="Bats / Throws" value={`${profile.bats ?? "—"} / ${profile.throws ?? "—"}`} />
                      <ProfileField label="Height / Weight" value={`${profile.height ?? "—"} / ${profile.weight ? `${profile.weight} lbs` : "—"}`} />
                      <ProfileField label="Age" value={profile.currentAge != null ? String(profile.currentAge) : undefined} />
                      <ProfileField label="Born" value={[profile.birthCity, profile.birthStateProvince, profile.birthCountry].filter(Boolean).join(", ") || undefined} />
                      <ProfileField label="Birth Date" value={profile.birthDate} />
                      <ProfileField label="MLB Debut" value={profile.mlbDebutDate} />
                      {profile.draftYear ? <ProfileField label="Draft Year" value={String(profile.draftYear)} /> : null}
                      {profile.nickName ? <ProfileField label="Nickname" value={`"${profile.nickName}"`} /> : null}
                      {profile.pronunciation ? <ProfileField label="Pronunciation" value={profile.pronunciation} /> : null}
                    </div>
                  ) : profileFailed ? (
                    <div>
                      <div className="text-sm text-[var(--lg-text-muted)] italic mb-6">Unable to load full profile from MLB.</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                        <ProfileField label="Name" value={title} />
                        {pos ? <ProfileField label="Position" value={pos} /> : null}
                        {mlbTeam ? <ProfileField label="MLB Team" value={mlbTeam} /> : null}
                        {fantasyTeam ? <ProfileField label="Fantasy Team" value={fantasyTeam} /> : null}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-[var(--lg-text-muted)] italic">No profile data available.</div>
                  )}
                </div>
              </div>

              {/* Recent Transactions / News */}
              <div className={sectionCls}>
                <div className={sectionHeadCls}>
                  <div className={sectionTitleCls}>Recent Transactions</div>
                  <span className="text-xs text-[var(--lg-text-muted)] opacity-60">Last 3</span>
                </div>
                <div className="p-6">
                  {newsRows.length > 0 ? (
                    <div className="space-y-3">
                      {newsRows.map((t, i) => (
                        <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-[var(--lg-radius-md)] bg-[var(--lg-tint)] border border-[var(--lg-border-faint)]">
                          <div className="shrink-0 mt-0.5">
                            <span className={`inline-block px-2 py-0.5 rounded-[var(--lg-radius-sm)] text-[10px] font-medium uppercase ${transactionBadgeClass(t.typeDesc)}`}>
                              {t.typeDesc}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-[var(--lg-text-primary)] leading-relaxed">{t.description}</div>
                            {t.date && (
                              <div className="text-xs text-[var(--lg-text-muted)] mt-1">{formatTransactionDate(t.date)}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-[var(--lg-text-muted)] italic">No recent transactions</div>
                  )}
                </div>
              </div>

              {/* Recent League News */}
              <div className={sectionCls}>
                <div className={sectionHeadCls}>
                  <div className={sectionTitleCls}>Recent News</div>
                  {feedLoading && <span className="text-xs text-[var(--lg-text-muted)] opacity-60">Loading...</span>}
                </div>
                <div className="p-6">
                  {feedArticles.length > 0 ? (
                    <div className="space-y-3">
                      {feedArticles.map((item, i) => (
                        <a
                          key={i}
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block px-3 py-2.5 rounded-[var(--lg-radius-md)] bg-[var(--lg-tint)] border border-[var(--lg-border-faint)] hover:bg-[var(--lg-bg-hover)] transition-colors"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              {item.source}
                            </span>
                            {item.pubDate && (
                              <span className="text-[10px] text-[var(--lg-text-muted)]">
                                {formatRelativeDate(item.pubDate)}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-[var(--lg-text-primary)] leading-relaxed">{item.title}</div>
                        </a>
                      ))}
                    </div>
                  ) : feedLoading ? null : (
                    <div className="text-sm text-[var(--lg-text-muted)] italic">No recent news</div>
                  )}
                </div>
              </div>

              {/* External Links */}
              {mlbId && (
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 px-2">
                  <a
                    href={`https://www.mlb.com/player/${mlbId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] transition-colors underline underline-offset-2"
                  >
                    View on MLB.com
                  </a>
                  <a
                    href={`https://www.baseball-reference.com/redirect.fcgi?player=1&mlb_ID=${mlbId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] transition-colors underline underline-offset-2"
                  >
                    View on Baseball Reference
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8">
              {/* Fielding — Games by Position (shown first) */}
              {mappedFieldingRows.length > 0 && (
                <div className={sectionCls}>
                  <div className={sectionHeadCls}>
                    <div className={sectionTitleCls}>{new Date().getFullYear()} Positions Played</div>
                  </div>
                  <div className={sectionBodyCls}>
                    <div className="p-6">
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                        {mappedFieldingRows.map(f => (
                          <div key={f.position} className="flex items-center gap-2 px-3 py-2 rounded-[var(--lg-radius-md)] bg-[var(--lg-tint)] border border-[var(--lg-border-faint)]">
                            <span className="text-xs font-semibold text-[var(--lg-text-primary)]">{f.position}</span>
                            <span className="text-xs text-[var(--lg-text-muted)]">{f.games}G</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Stats */}
              <div className={sectionCls}>
                <div className={sectionHeadCls}>
                  <div className={sectionTitleCls}>Recent Stats <span className="text-[var(--lg-accent)] opacity-40 mx-2">|</span> 7 / 14 / 21 Days &amp; YTD <span className="text-[9px] text-[var(--lg-text-muted)] opacity-60 ml-2 font-normal normal-case tracking-normal">Source: MLB · {new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></div>
                </div>
                <div className={sectionBodyCls}>
                  {recentRows.length ? (
                    <RecentTable
                      rows={recentRows}
                      mode={mode}
                    />
                  ) : (
                    <div className="p-8 text-sm text-[var(--lg-text-muted)] italic">
                      {recentFailed ? "Unable to load recent stats." : "No recent stats available."}
                    </div>
                  )}
                </div>
              </div>

              {/* Career */}
              <div className={sectionCls}>
                <div className={sectionHeadCls}>
                  <div className={sectionTitleCls}>Career Stats</div>
                </div>
                <div className={sectionBodyCls}>
                  {careerRows.length ? (
                    <CareerTable
                      rows={careerRows}
                      mode={mode}
                    />
                  ) : (
                    <div className="p-8 text-sm text-[var(--lg-text-muted)] italic">
                      {careerFailed ? "Unable to load career stats." : "No career stats available."}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-8 py-4 border-t border-[var(--lg-glass-border)] bg-black/20 flex items-center justify-between">
           <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)] opacity-40">
            Press <span className="text-[var(--lg-text-primary)]">ESC</span> to close
          </div>
          <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)] opacity-40">
            TFL
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)] mb-1">{label}</div>
      <div className="text-sm font-semibold text-[var(--lg-text-primary)]">{value || "—"}</div>
    </div>
  );
}

function RecentTable({
  rows,
  mode,
}: {
  rows: Array<RecentHittingRow | RecentPitchingRow>;
  mode: HOrP;
}) {
  if (mode === "hitting") {
    const r = rows as RecentHittingRow[];
    return (
      <ThemedTable bare>
        <ThemedThead>
          <ThemedTr>
            <ThemedTh>Period</ThemedTh>
            <ThemedTh align="center">AB</ThemedTh>
            <ThemedTh align="center">H</ThemedTh>
            <ThemedTh align="center">R</ThemedTh>
            <ThemedTh align="center">HR</ThemedTh>
            <ThemedTh align="center">RBI</ThemedTh>
            <ThemedTh align="center">SB</ThemedTh>
            <ThemedTh align="center">AVG</ThemedTh>
          </ThemedTr>
        </ThemedThead>
        <tbody>
          {r.map((x) => (
            <ThemedTr key={x.label}>
              <ThemedTd>{x.label}</ThemedTd>
              <ThemedTd align="center">{toNum(x.AB)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.H)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.R)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.HR)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.RBI)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.SB)}</ThemedTd>
              <ThemedTd align="center">
                {x.AVG ?? fmt3(toNum(x.H) / Math.max(1, toNum(x.AB)))}
              </ThemedTd>
            </ThemedTr>
          ))}
        </tbody>
      </ThemedTable>
    );
  }

  const p = rows as RecentPitchingRow[];
  return (
    <ThemedTable bare>
      <ThemedThead>
        <ThemedTr>
          <ThemedTh>Period</ThemedTh>
          <ThemedTh align="center">IP</ThemedTh>
          <ThemedTh align="center">W</ThemedTh>
          <ThemedTh align="center">SV</ThemedTh>
          <ThemedTh align="center">K</ThemedTh>
          <ThemedTh align="center">ERA</ThemedTh>
          <ThemedTh align="center">WHIP</ThemedTh>
        </ThemedTr>
      </ThemedThead>
      <tbody>
        {p.map((x) => (
          <ThemedTr key={x.label}>
            <ThemedTd>{x.label}</ThemedTd>
            <ThemedTd align="center">{x.IP ?? 0}</ThemedTd>
            <ThemedTd align="center">{toNum(x.W)}</ThemedTd>
            <ThemedTd align="center">{toNum(x.SV)}</ThemedTd>
            <ThemedTd align="center">{toNum(x.K)}</ThemedTd>
            <ThemedTd align="center">{x.ERA ?? fmt2(0)}</ThemedTd>
            <ThemedTd align="center">{x.WHIP ?? fmt2(0)}</ThemedTd>
          </ThemedTr>
        ))}
      </tbody>
    </ThemedTable>
  );
}

function CareerTable({
  rows,
  mode,
}: {
  rows: Array<CareerHittingRow | CareerPitchingRow>;
  mode: HOrP;
}) {
  if (mode === "hitting") {
    const r = rows as CareerHittingRow[];
    return (
      <ThemedTable bare>
        <ThemedThead>
          <ThemedTr>
            <ThemedTh align="center">YR</ThemedTh>
            <ThemedTh>TM</ThemedTh>
            <ThemedTh align="center">R</ThemedTh>
            <ThemedTh align="center">HR</ThemedTh>
            <ThemedTh align="center">RBI</ThemedTh>
            <ThemedTh align="center">SB</ThemedTh>
            <ThemedTh align="center">AVG</ThemedTh>
          </ThemedTr>
        </ThemedThead>
        <tbody>
          {r.map((x) => (
            <ThemedTr key={`${x.year}-${x.tm}`}>
              <ThemedTd align="center">{x.year}</ThemedTd>
              <ThemedTd>{x.tm || "—"}</ThemedTd>
              <ThemedTd align="center">{toNum(x.R)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.HR)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.RBI)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.SB)}</ThemedTd>
              <ThemedTd align="center">
                {x.AVG ?? fmt3(toNum(x.H) / Math.max(1, toNum(x.AB)))}
              </ThemedTd>
            </ThemedTr>
          ))}
        </tbody>
      </ThemedTable>
    );
  }

  const p = rows as CareerPitchingRow[];
  return (
    <ThemedTable bare>
      <ThemedThead>
        <ThemedTr>
          <ThemedTh align="center">YR</ThemedTh>
          <ThemedTh>TM</ThemedTh>
          <ThemedTh align="center">W</ThemedTh>
          <ThemedTh align="center">SV</ThemedTh>
          <ThemedTh align="center">K</ThemedTh>
          <ThemedTh align="center">ERA</ThemedTh>
          <ThemedTh align="center">WHIP</ThemedTh>
        </ThemedTr>
      </ThemedThead>
      <tbody>
        {p.map((x) => {
          const era = norm((x as any).ERA) ? String((x as any).ERA) : fmt2(0);
          const whip = norm((x as any).WHIP) ? String((x as any).WHIP) : fmt2(0);

          return (
            <ThemedTr key={`${x.year}-${x.tm}`}>
              <ThemedTd align="center">{x.year}</ThemedTd>
              <ThemedTd>{x.tm || "—"}</ThemedTd>
              <ThemedTd align="center">{toNum(x.W)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.SV)}</ThemedTd>
              <ThemedTd align="center">{toNum((x as any).SO)}</ThemedTd>
              <ThemedTd align="center">{era}</ThemedTd>
              <ThemedTd align="center">{whip}</ThemedTd>
            </ThemedTr>
          );
        })}
      </tbody>
    </ThemedTable>
  );
}
