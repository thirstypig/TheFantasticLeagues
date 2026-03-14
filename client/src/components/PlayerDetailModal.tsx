// client/src/components/PlayerDetailModal.tsx
import React, { useEffect, useMemo, useState } from "react";

import {
  getPlayerCareerStats,
  getPlayerFieldingStats,
  getPlayerProfile,
  getPlayerRecentStats,
  type FieldingStatRow,
  type HOrP,
  type PlayerProfile,
  type PlayerSeasonStat,
  type CareerHittingRow,
  type CareerPitchingRow,
  type RecentHittingRow,
  type RecentPitchingRow,
} from "../api";
import { toNum } from "../api/base";
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "./ui/ThemedTable";

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

  const [tab, setTab] = useState<TabId>("stats");

  const mlbId = useMemo(() => norm(player?.mlb_id), [player]);
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
  useEffect(() => {
    setTab("stats");
    setErr("");
    setProfile(null);
    setRecentRows([]);
    setCareerRows([]);
    setFieldingRows([]);
  }, [mlbId]);

  useEffect(() => {
    if (!player || !mlbId || !isVisible) return;

    let cancelled = false;
    setLoading(true);
    setErr("");

    (async () => {
      try {
        const [p, recent, career, fielding] = await Promise.all([
          getPlayerProfile(mlbId),
          getPlayerRecentStats(mlbId, mode),
          getPlayerCareerStats(mlbId, mode),
          getPlayerFieldingStats(mlbId),
        ]);

        if (cancelled) return;

        setProfile(p);
        setRecentRows(recent.rows ?? []);
        setCareerRows(career.rows ?? []);
        setFieldingRows(fielding ?? []);
      } catch (err: unknown) {
        if (cancelled) return;
        setErr(err instanceof Error ? err.message : "Failed to load player details");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [player, mlbId, mode, isVisible]);

  useEffect(() => {
    if (!player) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [player, onClose]);

  if (!isVisible || !player) return null;

  const title = norm(player.player_name ?? (player as any).name ?? "Player");
  const pos = norm(player.positions ?? (player as any).pos ?? "");
  const ogba = norm(player.ogba_team_code ?? (player as any).team ?? "");
  const mlbTeam = norm((player as any).mlbTeam ?? (player as any).mlb_team_abbr ?? player.mlb_team ?? "");
  const roleLabel = mode === "pitching" ? "Pitching" : "Hitting";

  return (
    <div
      className={overlayCls}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className={modalCls} onMouseDown={e => e.stopPropagation()}>
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
              {ogba ? <div className="flex gap-2"><span>OGBA:</span> <span className="text-[var(--lg-text-primary)]">{ogba}</span></div> : null}
              {mlbTeam ? <div className="flex gap-2"><span>MLB:</span> <span className="text-[var(--lg-text-primary)]">{mlbTeam}</span></div> : null}
              {mlbId ? <div className="flex gap-2 opacity-60"><span>ID:</span> <span>{mlbId}</span></div> : null}
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
            <div className="lg-alert lg-alert-error mb-6">
              <div className="font-bold">Error:</div>
              <div>{err}</div>
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
                      <ProfileField label="Team" value={profile.currentTeam} />
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
                  ) : (
                    <div className="text-sm text-[var(--lg-text-muted)] italic">No profile data available.</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8">
              {/* Recent */}
              <div className={sectionCls}>
                <div className={sectionHeadCls}>
                  <div className={sectionTitleCls}>Recent Stats <span className="text-[var(--lg-accent)] opacity-40 mx-2">|</span> 7 / 14 / 21 Days + YTD</div>
                </div>
                <div className={sectionBodyCls}>
                  {recentRows.length ? (
                    <RecentTable
                      rows={recentRows}
                      mode={mode}
                    />
                  ) : (
                    <div className="p-8 text-sm text-[var(--lg-text-muted)] italic">No recent stats available.</div>
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
                    <div className="p-8 text-sm text-[var(--lg-text-muted)] italic">No career stats available.</div>
                  )}
                </div>
              </div>

              {/* Fielding — Games by Position */}
              {fieldingRows.length > 0 && (
                <div className={sectionCls}>
                  <div className={sectionHeadCls}>
                    <div className={sectionTitleCls}>Fielding — Games by Position</div>
                  </div>
                  <div className={sectionBodyCls}>
                    <div className="p-6">
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                        {fieldingRows.map(f => (
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
