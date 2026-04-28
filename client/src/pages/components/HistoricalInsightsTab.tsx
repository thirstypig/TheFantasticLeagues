/*
 * HistoricalInsightsTab — Aurora restoration of the pre-Aurora Home page's
 * Weekly AI Insights tab strip.
 *
 * Pre-Aurora, HomeLegacy.tsx rendered a horizontal pill-tab strip of past
 * weekly digests (W18, W17, W16, …) so users could browse historical
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
import type { DigestResponse } from "../home/types";

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

/**
 * Convert "2026-W18" → "W18" for the pill label. Falls back to the
 * server-supplied label if parsing fails.
 */
function shortLabel(week: DigestWeek): string {
  const m = /W(\d+)/i.exec(week.weekKey);
  if (m) return `W${m[1]}`;
  return week.label || week.weekKey;
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

        if (weeksRes.status === "fulfilled") {
          const list = weeksRes.value.weeks ?? [];
          setWeeks(list);
          setCurrentWeekKey(weeksRes.value.currentWeekKey ?? null);
          setSelectedWeekKey(weeksRes.value.currentWeekKey ?? null);
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
              {digest.weekKey && (
                <IridText size={14}>{digest.weekKey}</IridText>
              )}
            </div>

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
