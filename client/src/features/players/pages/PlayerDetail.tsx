/*
 * PlayerDetail — Aurora port (PR — Aurora screen #5 of 8).
 *
 * Full-page Aurora bento layout for an individual player. Replaces the
 * modal-only experience for the Players Index "Full Profile" button —
 * `PlayerDetailModal` continues to exist for inline use elsewhere
 * (Auction, Team, Trading Block, Watchlist, Board, Draft Report).
 *
 * Why a page (not just a reskinned modal):
 *   - Shareable URLs (`/players/:mlbId`) — modals vanish on reload
 *   - Full bento canvas for the multi-card profile + stats data
 *   - Matches the design memo's "Player Detail" screen intent
 *
 * Data flow:
 *   - `:mlbId` URL param drives the 5 parallel MLB fetches (profile,
 *     recent stats, career, fielding, news) — same pipeline the modal
 *     uses, lifted up to a page.
 *   - The base `PlayerSeasonStat` row (for league-context fields like
 *     fantasy team / position eligibility) is found by scanning
 *     `getPlayerSeasonStats(leagueId)`. List response is cheap and
 *     already cached for the Index page.
 *   - If clicked from the Players Index, the row is also passed via
 *     navigation state — saves one round-trip.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import {
  AmbientBg, Glass, IridText, Chip, SectionLabel,
} from "../../../components/aurora/atoms";
import "../../../components/aurora/aurora.css";
import {
  getPlayerCareerStats,
  getPlayerFieldingStats,
  getPlayerNews,
  getPlayerProfile,
  getPlayerRecentStats,
  getPlayerSeasonStats,
  type CareerHittingRow,
  type CareerPitchingRow,
  type FieldingStatRow,
  type HOrP,
  type PlayerProfile,
  type PlayerSeasonStat,
  type PlayerTransaction,
  type RecentHittingRow,
  type RecentPitchingRow,
} from "../../../api";
import {
  CareerTable,
  ProfileField,
  RecentTable,
  deriveMode,
  formatRelativeDate,
  formatTransactionDate,
  transactionBadgeClass,
} from "../../../components/shared/PlayerDetailModal";
import { usePlayerNews } from "../../../hooks/usePlayerNews";
import { useLeague } from "../../../contexts/LeagueContext";
import { mapPosition, resolveRealMlbId } from "../../../lib/sportConfig";
import { OGBA_TEAM_NAMES } from "../../../lib/ogbaTeams";

type TabId = "stats" | "profile";

function norm(v: any): string {
  return String(v ?? "").trim();
}

export default function PlayerDetail() {
  const { mlbId: mlbIdParam } = useParams<{ mlbId: string }>();
  const location = useLocation();
  const { leagueId, outfieldMode } = useLeague();

  // The Players Index passes the row via state on click — first paint is
  // instant. Direct URL hits (or page reloads) fall through to a fetch.
  const stateRow = (location.state as { player?: PlayerSeasonStat } | null)?.player ?? null;
  const [seasonRow, setSeasonRow] = useState<PlayerSeasonStat | null>(stateRow);
  const [seasonLoaded, setSeasonLoaded] = useState<boolean>(!!stateRow);

  const rawMlbId = norm(mlbIdParam ?? seasonRow?.mlb_id);
  const mlbId = useMemo(() => resolveRealMlbId(rawMlbId), [rawMlbId]);

  const [tab, setTab] = useState<TabId>("stats");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [recentRows, setRecentRows] = useState<Array<RecentHittingRow | RecentPitchingRow>>([]);
  const [careerRows, setCareerRows] = useState<Array<CareerHittingRow | CareerPitchingRow>>([]);
  const [fieldingRows, setFieldingRows] = useState<FieldingStatRow[]>([]);
  const [newsRows, setNewsRows] = useState<PlayerTransaction[]>([]);
  const [profileFailed, setProfileFailed] = useState(false);
  const [recentFailed, setRecentFailed] = useState(false);
  const [careerFailed, setCareerFailed] = useState(false);

  // If the row didn't come in via navigation state, fetch the league-wide
  // list and resolve by mlb_id. Cheap on cache hits.
  useEffect(() => {
    if (seasonRow || !leagueId || !mlbIdParam) return;
    let alive = true;
    (async () => {
      try {
        const list = await getPlayerSeasonStats(leagueId);
        if (!alive) return;
        const found = list.find(p => norm(p.mlb_id) === norm(mlbIdParam)) ?? null;
        setSeasonRow(found);
      } catch {
        // Not fatal — profile + stats can still load via mlbId param alone.
      } finally {
        if (alive) setSeasonLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [seasonRow, leagueId, mlbIdParam]);

  const mode: HOrP = useMemo(() => (seasonRow ? deriveMode(seasonRow) : "hitting"), [seasonRow]);

  const playerNameForNews = seasonRow?.player_name ?? (seasonRow as any)?.name ?? null;
  const { articles: feedArticles, loading: feedLoading } = usePlayerNews(playerNameForNews);

  useEffect(() => {
    if (!mlbId) return;
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

        const [pr, re, ca, fi, ne] = results;
        if (pr.status === "fulfilled") setProfile(pr.value); else setProfileFailed(true);
        if (re.status === "fulfilled") setRecentRows(re.value.rows ?? []); else setRecentFailed(true);
        if (ca.status === "fulfilled") setCareerRows(ca.value.rows ?? []); else setCareerFailed(true);
        if (fi.status === "fulfilled") setFieldingRows(fi.value ?? []);
        if (ne.status === "fulfilled") setNewsRows(ne.value ?? []);

        if (results.every(r => r.status === "rejected")) {
          setErr("Unable to load player data from MLB. Please try again later.");
        }
      } catch {
        if (!cancelled) setErr("Unable to load player data. Please try again later.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [mlbId, mode]);

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

  const title = norm(seasonRow?.player_name ?? (seasonRow as any)?.name ?? profile?.fullName ?? "Player");
  const pos = norm(seasonRow?.positions ?? (seasonRow as any)?.pos ?? profile?.primaryPosition ?? "");
  const mlbTeam = norm(
    (seasonRow as any)?.mlbTeam ?? (seasonRow as any)?.mlb_team_abbr ?? seasonRow?.mlb_team ?? profile?.currentTeam ?? "",
  );
  const fantasyCode = norm((seasonRow as any)?.ogba_team_code ?? "");
  const fantasyTeam = fantasyCode ? (OGBA_TEAM_NAMES[fantasyCode] || fantasyCode) : "";
  const roleLabel = mode === "pitching" ? "Pitching" : "Hitting";

  const initialResolveLoading = !seasonLoaded && !mlbId;

  return (
    <div className="aurora-theme" style={{ position: "relative", minHeight: "100svh" }}>
      <AmbientBg />
      <div style={{ position: "relative", zIndex: 1, padding: "24px 16px 48px", maxWidth: 1200, margin: "0 auto" }}>
        {/* Back link */}
        <div style={{ marginBottom: 12 }}>
          <Link
            to="/players"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--am-text-muted)",
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={14} />
            Back to Players
          </Link>
        </div>

        {/* Hero card */}
        <Glass strong style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: "1 1 320px" }}>
              <SectionLabel>✦ Player</SectionLabel>
              <h1
                style={{
                  fontFamily: "var(--am-display)",
                  fontSize: 40,
                  fontWeight: 300,
                  color: "var(--am-text)",
                  margin: 0,
                  lineHeight: 1.05,
                }}
              >
                {title}
              </h1>
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <Chip strong>{roleLabel}</Chip>
                {pos && <Chip>POS · {pos}</Chip>}
                {mlbTeam && <Chip>MLB · {mlbTeam}</Chip>}
                {fantasyTeam && <Chip color="var(--am-cardinal)">Fantasy · {fantasyTeam}</Chip>}
                {mlbId && <Chip style={{ opacity: 0.5 }}>ID {mlbId}</Chip>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => setTab("stats")}
                style={tabBtnStyle(tab === "stats")}
              >
                Stats
              </button>
              <button
                type="button"
                onClick={() => setTab("profile")}
                style={tabBtnStyle(tab === "profile")}
              >
                Profile
              </button>
            </div>
          </div>
        </Glass>

        {/* Status states */}
        {err && (
          <Glass style={{ marginBottom: 16, borderColor: "rgba(255,80,80,0.3)" }}>
            <div style={{ fontSize: 13, color: "var(--am-text-muted)" }}>{err}</div>
          </Glass>
        )}

        {(loading || initialResolveLoading) && !err ? (
          <Glass>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 16px" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  border: "3px solid var(--am-border)",
                  borderTopColor: "var(--am-cardinal)",
                  animation: "spin 0.8s linear infinite",
                  marginBottom: 12,
                }}
              />
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--am-text-faint)" }}>
                Loading…
              </div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          </Glass>
        ) : tab === "stats" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 16 }}>
            {/* Positions Played */}
            {mappedFieldingRows.length > 0 && (
              <div style={{ gridColumn: "span 12" }}>
                <Glass>
                  <SectionLabel>{new Date().getFullYear()} Positions Played</SectionLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {mappedFieldingRows.map(f => (
                      <Chip key={f.position} strong>
                        {f.position} · {f.games}G
                      </Chip>
                    ))}
                  </div>
                </Glass>
              </div>
            )}

            {/* Recent Stats */}
            <div style={{ gridColumn: "span 12" }}>
              <Glass padded={false}>
                <div style={{ padding: "16px 16px 8px" }}>
                  <SectionLabel style={{ marginBottom: 4 }}>Recent · 7 / 14 / 21 Days &amp; YTD</SectionLabel>
                  <div style={{ fontSize: 10, color: "var(--am-text-faint)" }}>
                    Source: MLB · {new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </div>
                </div>
                <div style={{ overflowX: "auto", padding: "0 4px 12px" }}>
                  {recentRows.length ? (
                    <RecentTable rows={recentRows} mode={mode} />
                  ) : (
                    <div style={{ padding: 24, fontSize: 13, fontStyle: "italic", color: "var(--am-text-muted)" }}>
                      {recentFailed ? "Unable to load recent stats." : "No recent stats available."}
                    </div>
                  )}
                </div>
              </Glass>
            </div>

            {/* Career Stats */}
            <div style={{ gridColumn: "span 12" }}>
              <Glass padded={false}>
                <div style={{ padding: "16px 16px 8px" }}>
                  <SectionLabel style={{ marginBottom: 0 }}>Career Stats</SectionLabel>
                </div>
                <div style={{ overflowX: "auto", padding: "0 4px 12px" }}>
                  {careerRows.length ? (
                    <CareerTable rows={careerRows} mode={mode} />
                  ) : (
                    <div style={{ padding: 24, fontSize: 13, fontStyle: "italic", color: "var(--am-text-muted)" }}>
                      {careerFailed ? "Unable to load career stats." : "No career stats available."}
                    </div>
                  )}
                </div>
              </Glass>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 16 }}>
            {/* Player Info */}
            <div style={{ gridColumn: "span 12" }}>
              <Glass>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <SectionLabel style={{ marginBottom: 0 }}>Player Info</SectionLabel>
                  {profile?.active !== undefined && (
                    <Chip strong color={profile.active ? "var(--am-accent)" : "var(--am-text-faint)"}>
                      {profile.active ? "Active" : "Inactive"}
                    </Chip>
                  )}
                </div>
                {profile ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 18 }}>
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
                  </div>
                ) : profileFailed ? (
                  <div>
                    <div style={{ fontSize: 13, color: "var(--am-text-muted)", fontStyle: "italic", marginBottom: 16 }}>
                      Unable to load full profile from MLB.
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 18 }}>
                      <ProfileField label="Name" value={title} />
                      {pos ? <ProfileField label="Position" value={pos} /> : null}
                      {mlbTeam ? <ProfileField label="MLB Team" value={mlbTeam} /> : null}
                      {fantasyTeam ? <ProfileField label="Fantasy Team" value={fantasyTeam} /> : null}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--am-text-muted)", fontStyle: "italic" }}>No profile data available.</div>
                )}
              </Glass>
            </div>

            {/* Recent Transactions */}
            <div style={{ gridColumn: "span 12" }}>
              <Glass>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <SectionLabel style={{ marginBottom: 0 }}>Recent Transactions</SectionLabel>
                  <span style={{ fontSize: 11, color: "var(--am-text-faint)" }}>Last 3</span>
                </div>
                {newsRows.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {newsRows.map((t, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 12,
                          background: "var(--am-surface-faint)",
                          border: "1px solid var(--am-border)",
                        }}
                      >
                        <span className={transactionBadgeClass(t.typeDesc)} style={{ flexShrink: 0 }}>
                          {t.typeDesc}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, color: "var(--am-text)", lineHeight: 1.5 }}>{t.description}</div>
                          {t.date && (
                            <div style={{ fontSize: 11, color: "var(--am-text-faint)", marginTop: 4 }}>
                              {formatTransactionDate(t.date)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--am-text-muted)", fontStyle: "italic" }}>No recent transactions</div>
                )}
              </Glass>
            </div>

            {/* Recent News */}
            <div style={{ gridColumn: "span 12" }}>
              <Glass>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <SectionLabel style={{ marginBottom: 0 }}>Recent News</SectionLabel>
                  {feedLoading && <span style={{ fontSize: 11, color: "var(--am-text-faint)" }}>Loading…</span>}
                </div>
                {feedArticles.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {feedArticles.map((item, i) => (
                      <a
                        key={i}
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "block",
                          padding: "10px 12px",
                          borderRadius: 12,
                          background: "var(--am-surface-faint)",
                          border: "1px solid var(--am-border)",
                          textDecoration: "none",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <Chip strong>{item.source}</Chip>
                          {item.pubDate && (
                            <span style={{ fontSize: 10, color: "var(--am-text-faint)" }}>
                              {formatRelativeDate(item.pubDate)}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--am-text)", lineHeight: 1.5 }}>{item.title}</div>
                      </a>
                    ))}
                  </div>
                ) : feedLoading ? null : (
                  <div style={{ fontSize: 13, color: "var(--am-text-muted)", fontStyle: "italic" }}>No recent news</div>
                )}
              </Glass>
            </div>

            {/* External Links */}
            {mlbId && (
              <div style={{ gridColumn: "span 12", display: "flex", flexWrap: "wrap", gap: 24, padding: "0 4px" }}>
                <a
                  href={`https://www.mlb.com/player/${mlbId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: "var(--am-text-muted)", textDecoration: "underline" }}
                >
                  View on MLB.com
                </a>
                <a
                  href={`https://www.baseball-reference.com/redirect.fcgi?player=1&mlb_ID=${mlbId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: "var(--am-text-muted)", textDecoration: "underline" }}
                >
                  View on Baseball Reference
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function tabBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: "8px 16px",
    borderRadius: 999,
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
