/*
 * HistoricalInsightsTab — Aurora restoration of the pre-Aurora Home page's
 * Weekly AI Insights tab strip.
 *
 * Pre-Aurora, HomeLegacy.tsx rendered a horizontal tab strip of past
 * weekly digests so users could browse historical
 * league digests. The feature was removed when Home was Aurora-ported in
 * PR #135 / #137. This component restores it as a NEW Aurora-styled
 * widget that wraps the existing `/api/mlb/league-digest` and
 * `/api/mlb/league-digest/weeks` endpoints.
 *
 * Resilience: if the `/weeks` endpoint fails, we fall back to fetching
 * just the current week's digest (no tab strip). The component never
 * hides itself outright — the parent should render it inside a layout
 * slot and let it self-render its loading/empty/error states.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Glass, SectionLabel, IridText } from "../../components/aurora/atoms";
import { fetchJsonApi, API_BASE } from "../../api/base";
import type { CategoryMover, DigestResponse, PowerRanking } from "../home/types";

interface DigestWeek {
  weekKey: string;
  generatedAt: string | null;
  label: string;
}

interface WeeksResponse {
  weeks: DigestWeek[];
  currentWeekKey: string;
}

interface Props {
  leagueId: number;
}

function shortLabel(week: DigestWeek): string {
  const start = weekStartDate(week.weekKey);
  if (start) return start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return week.label || week.weekKey;
}

function weekStartDate(weekKey: string): Date | null {
  const m = /^(\d{4})-W(\d{1,2})$/i.exec(weekKey);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week)) return null;
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  jan4.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7);
  return new Date(jan4.getUTCFullYear(), jan4.getUTCMonth(), jan4.getUTCDate());
}

function isOlderThanHours(iso: string | null | undefined, hours: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && Date.now() - t > hours * 60 * 60 * 1000;
}

export default function HistoricalInsightsTab({ leagueId }: Props) {
  const [weeks, setWeeks] = useState<DigestWeek[]>([]);
  const [currentWeekKey, setCurrentWeekKey] = useState<string | null>(null);
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Initial load: weeks index + current digest. Uses Promise.allSettled
  // so a failure in one path doesn't kill the other.
  useEffect(() => {
    if (!leagueId) return;
    let canceled = false;
    setLoading(true);

    Promise.allSettled([
      fetchJsonApi<WeeksResponse>(
        `${API_BASE}/mlb/league-digest/weeks?leagueId=${leagueId}`,
      ),
      fetchJsonApi<DigestResponse>(
        `${API_BASE}/mlb/league-digest?leagueId=${leagueId}`,
      ),
    ])
      .then(([weeksRes, digestRes]) => {
        if (canceled) return;

        const digestWeekKey = digestRes.status === "fulfilled" ? digestRes.value.weekKey : null;

        if (weeksRes.status === "fulfilled") {
          const list = weeksRes.value.weeks ?? [];
          setWeeks(list);
          setCurrentWeekKey(weeksRes.value.currentWeekKey ?? null);
          setSelectedWeekKey(digestWeekKey ?? weeksRes.value.currentWeekKey ?? null);
        } else {
          // Fallback: no weeks list — derive a single-entry list from
          // the current digest if we got one. Tab strip degrades to a
          // single pill (or hides entirely if even that fails).
          setWeeks([]);
          setCurrentWeekKey(null);
          setSelectedWeekKey(null);
        }

        if (digestRes.status === "fulfilled") {
          setDigest(digestRes.value);
          // If we don't have a weeks list but we DO have a digest with a
          // weekKey, synthesize a single-tab list so the user sees at
          // least the current week pill.
          if (weeksRes.status !== "fulfilled" && digestRes.value.weekKey) {
            const synth: DigestWeek = {
              weekKey: digestRes.value.weekKey,
              generatedAt: digestRes.value.generatedAt ?? null,
              label: digestRes.value.weekKey,
            };
            setWeeks([synth]);
            setCurrentWeekKey(digestRes.value.weekKey);
            setSelectedWeekKey(digestRes.value.weekKey);
          }
        }
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [leagueId]);

  // Tab click: refetch the digest for the chosen week. Failures clear
  // the digest body but keep the tab strip rendered so the user can try
  // another week.
  const handleSelect = (weekKey: string) => {
    if (!leagueId || weekKey === selectedWeekKey) return;
    setSelectedWeekKey(weekKey);
    setDigest(null);
    setLoading(true);
    fetchJsonApi<DigestResponse>(
      `${API_BASE}/mlb/league-digest?leagueId=${leagueId}&weekKey=${weekKey}`,
    )
      .then(data => setDigest(data))
      .catch(() => setDigest(null))
      .finally(() => setLoading(false));
  };

  const sortedWeeks = useMemo(() => {
    // Server returns newest-first per HomeLegacy precedent, but be
    // defensive — sort descending by weekKey string (ISO weeks sort
    // lexicographically when they share a year prefix).
    return [...weeks].sort((a, b) =>
      a.weekKey < b.weekKey ? 1 : a.weekKey > b.weekKey ? -1 : 0,
    );
  }, [weeks]);

  return (
    <Glass style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <SectionLabel>✦ Weekly Insights</SectionLabel>
        {selectedWeekKey && currentWeekKey && selectedWeekKey !== currentWeekKey && (
          <span style={{ fontSize: 11, color: "var(--am-text-faint)" }}>
            Viewing past digest · read-only
          </span>
        )}
      </div>

      {/* Tab strip — only rendered when we have at least one week. */}
      {sortedWeeks.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 4,
          }}
        >
          {sortedWeeks.map(w => {
            const isActive = w.weekKey === selectedWeekKey;
            return (
              <button
                key={w.weekKey}
                onClick={() => handleSelect(w.weekKey)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: 0.2,
                  background: isActive
                    ? "var(--am-chip-strong)"
                    : "var(--am-chip)",
                  color: isActive ? "var(--am-text)" : "var(--am-text-muted)",
                  border:
                    "1px solid " +
                    (isActive ? "var(--am-border-strong)" : "var(--am-border)"),
                  cursor: "pointer",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
                aria-pressed={isActive}
              >
                {shortLabel(w)}
              </button>
            );
          })}
        </div>
      )}

      {/* Digest body — headline + bold prediction + CTA. Visual treatment
          mirrors the AIStrip atom used on Home but kept inline so the
          card composes within our Glass wrapper without nesting. */}
      <div
        style={{
          padding: 14,
          borderRadius: 14,
          background: "var(--am-ai-strip)",
          border: "1px solid var(--am-border)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {loading && (
          <div style={{ fontSize: 12, color: "var(--am-text-faint)" }}>
            Loading digest…
          </div>
        )}

        {!loading && !digest && (
          <div style={{ fontSize: 12, color: "var(--am-text-faint)" }}>
            No digest available for this week.
          </div>
        )}

        {!loading && digest && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--am-display)",
                  fontSize: 16,
                  lineHeight: 1.35,
                  color: "var(--am-text)",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {digest.weekInOneSentence ||
                  digest.overview ||
                  "Digest not yet generated."}
              </div>
              {selectedWeekKey && (
                <IridText size={14}>
                  {shortLabel({
                    weekKey: selectedWeekKey,
                    generatedAt: digest.generatedAt ?? null,
                    label: selectedWeekKey,
                  })}
                </IridText>
              )}
            </div>

            {digest.generatedAt && (
              <div style={{ fontSize: 11, color: "var(--am-text-faint)" }}>
                Generated {new Date(digest.generatedAt).toLocaleString()}
                {isOlderThanHours(digest.generatedAt, 6)
                  ? " · AI copy may lag standings changes since generation"
                  : ""}
              </div>
            )}

            {digest.boldPrediction && (
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--am-text-muted)",
                  lineHeight: 1.5,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--am-text-faint)",
                    fontWeight: 700,
                    letterSpacing: 1,
                    marginRight: 6,
                  }}
                >
                  BOLD PREDICTION ·
                </span>
                {digest.boldPrediction}
              </div>
            )}

            {(digest.powerRankings?.length ?? 0) > 0 && (
              <DigestPowerRankings rows={digest.powerRankings ?? []} />
            )}

            {(digest.hotTeam || digest.coldTeam) && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                {digest.hotTeam && (
                  <DigestCallout tone="positive" label="Hot team" title={digest.hotTeam.name} body={digest.hotTeam.reason} />
                )}
                {digest.coldTeam && (
                  <DigestCallout tone="negative" label="Cold team" title={digest.coldTeam.name} body={digest.coldTeam.reason} />
                )}
              </div>
            )}

            {digest.statOfTheWeek && (
              <DigestCallout tone="neutral" label="Stat of the week" body={digest.statOfTheWeek} />
            )}

            {(digest.categoryMovers?.length ?? 0) > 0 && (
              <DigestCategoryMovers rows={digest.categoryMovers ?? []} />
            )}

            {digest.proposedTrade && (
              <DigestCallout
                tone="neutral"
                label={`Trade idea · ${digest.proposedTrade.style}`}
                title={digest.proposedTrade.title}
                body={`${digest.proposedTrade.teamA} gives ${digest.proposedTrade.teamAGives}; ${digest.proposedTrade.teamB} gives ${digest.proposedTrade.teamBGives}. ${digest.proposedTrade.reasoning}`}
              />
            )}

            <div style={{ marginTop: 4 }}>
              <Link
                to="/ai"
                style={{
                  display: "inline-block",
                  padding: "8px 14px",
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: 0.2,
                  background: "var(--am-chip-strong)",
                  color: "var(--am-text)",
                  border: "1px solid var(--am-border-strong)",
                  textDecoration: "none",
                  fontFamily: "inherit",
                }}
              >
                Open AI Hub →
              </Link>
            </div>
          </>
        )}
      </div>
    </Glass>
  );
}

function DigestPowerRankings({ rows }: { rows: PowerRanking[] }) {
  return (
    <div>
      <DigestSectionLabel>Power rankings</DigestSectionLabel>
      <div style={{ display: "grid", gap: 4 }}>
        {rows.map((pr, index) => (
          <div
            key={`${pr.rank}-${pr.teamName}`}
            style={{
              display: "grid",
              gridTemplateColumns: "34px 42px minmax(0, 1fr)",
              gap: 10,
              alignItems: "start",
              padding: "8px 10px",
              borderRadius: 10,
              background: "var(--am-surface-faint)",
              border: "1px solid var(--am-border)",
            }}
          >
            <div style={{ textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
              {index === 0 ? <IridText size={17}>{pr.rank}</IridText> : <span style={{ color: "var(--am-text-muted)", fontWeight: 750 }}>{pr.rank}</span>}
            </div>
            <Movement value={pr.movement} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 750, color: "var(--am-text)" }}>{pr.teamName}</div>
              <div style={{ marginTop: 2, fontSize: 11.5, lineHeight: 1.45, color: "var(--am-text-muted)" }}>{pr.commentary}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Movement({ value }: { value: string }) {
  const v = String(value || "").toLowerCase();
  const up = v === "up" || v.includes("▲") || v.includes("↑");
  const down = v === "down" || v.includes("▼") || v.includes("↓");
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 750,
        color: up ? "var(--am-positive)" : down ? "var(--am-negative)" : "var(--am-text-faint)",
      }}
    >
      {up ? "Up" : down ? "Down" : "Even"}
    </span>
  );
}

function DigestCategoryMovers({ rows }: { rows: CategoryMover[] }) {
  return (
    <div>
      <DigestSectionLabel>Category movers</DigestSectionLabel>
      <div style={{ display: "grid", gap: 4 }}>
        {rows.map((row, index) => (
          <div key={`${row.team}-${row.category}-${index}`} style={{ fontSize: 11.5, color: "var(--am-text-muted)", lineHeight: 1.45 }}>
            <strong style={{ color: row.direction === "up" ? "var(--am-positive)" : "var(--am-negative)" }}>
              {row.direction === "up" ? "Up" : "Down"} {row.category}
            </strong>
            {" · "}
            <span style={{ color: "var(--am-text)" }}>{row.team}</span>
            {" · "}
            {row.detail}
          </div>
        ))}
      </div>
    </div>
  );
}

function DigestCallout({
  tone,
  label,
  title,
  body,
}: {
  tone: "positive" | "negative" | "neutral";
  label: string;
  title?: string;
  body: string;
}) {
  const color = tone === "positive" ? "var(--am-positive)" : tone === "negative" ? "var(--am-negative)" : "var(--am-accent)";
  return (
    <div
      style={{
        padding: "9px 10px",
        borderRadius: 10,
        border: "1px solid var(--am-border)",
        background: "var(--am-surface-faint)",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 750, letterSpacing: 0.9, textTransform: "uppercase", color }}>
        {label}
      </div>
      {title && <div style={{ marginTop: 3, fontSize: 12.5, fontWeight: 750, color: "var(--am-text)" }}>{title}</div>}
      <div style={{ marginTop: title ? 3 : 0, fontSize: 11.5, lineHeight: 1.45, color: "var(--am-text-muted)" }}>{body}</div>
    </div>
  );
}

function DigestSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginBottom: 6,
        fontSize: 10,
        fontWeight: 750,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: "var(--am-text-faint)",
      }}
    >
      {children}
    </div>
  );
}
