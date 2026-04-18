/**
 * "This Week in Baseball" — Weekly Report page (MVP wireframe).
 * Aggregates existing AI artifacts into one shareable view.
 *
 * Section order (stubbed where data wiring is complex):
 *   1. Hero / week label
 *   2. Power rankings (from league_digest)
 *   3. Hot team / Cold team (from league_digest)
 *   4. Standings snapshot + movers — STUB (data path pending)
 *   5. Category movers — STUB
 *   6. Trade of the Week poll (link to Home for voting)
 *   7. Per-team weekly insights — collapsible cards
 *   8. Activity log — trades, waivers, add/drops this week
 *   9. Stat of the week / Bold prediction (from league_digest)
 *  10. Looking ahead — STUB (H2H-aware, Phase 2)
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useLeague } from "../../../contexts/LeagueContext";
import { getWeeklyReport, type WeeklyReport } from "../api";
import { TwibHero } from "../components/TwibHero";
import { reportError } from "../../../lib/errorBus";
import { ThemedTable, ThemedThead, ThemedTr, ThemedTh, ThemedTd } from "../../../components/ui/ThemedTable";

export default function ReportPage() {
  const { leagueId } = useLeague();
  const { weekKey: weekKeyParam } = useParams<{ weekKey?: string }>();
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    setLoading(true);
    getWeeklyReport(leagueId, weekKeyParam)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((err) => reportError(err, { source: "weekly-report" }))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, weekKeyParam]);

  if (!leagueId) {
    return <EmptyShell message="Select a league to view its weekly report." />;
  }
  if (loading || !report) {
    return <EmptyShell message="Loading this week in baseball…" />;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10">
      {/* 1. HERO */}
      <h1 className="sr-only">This Week in Baseball — {report.meta.leagueName} · {report.meta.label}</h1>
      <TwibHero label={`${report.meta.leagueName} · ${report.meta.label}`} />

      {/* 2. POWER RANKINGS */}
      <Section title="Power Rankings">
        <DigestBlock digest={report.digest} field="powerRankings" />
      </Section>

      {/* 3. HOT / COLD */}
      <div className="grid gap-4 md:grid-cols-2 mt-4">
        <Section title="Hot Team" compact>
          <DigestBlock digest={report.digest} field="hotTeam" />
        </Section>
        <Section title="Cold Team" compact>
          <DigestBlock digest={report.digest} field="coldTeam" />
        </Section>
      </div>

      {/* 4. STANDINGS SNAPSHOT */}
      <Section
        title="Standings · This Week"
        note="Roto points summed across all active/completed periods. Week-over-week delta coming next pass."
      >
        <StandingsBlock standings={report.standings} />
      </Section>

      {/* 5. TRADE OF THE WEEK */}
      <Section title="Trade of the Week">
        <DigestBlock digest={report.digest} field="proposedTrade" />
        <p className="mt-2 text-xs text-[var(--lg-text-muted)]">
          Voting lives on the Home page for the current week.
        </p>
      </Section>

      {/* 7. PER-TEAM INSIGHTS */}
      <Section title="The Eight Teams" note="Weekly AI insight per roster — tap to expand.">
        <TeamInsightsList teams={report.teamInsights} />
      </Section>

      {/* 8. ACTIVITY LOG */}
      <Section
        title="Activity This Week"
        note={`${report.activity.length} transaction${report.activity.length === 1 ? "" : "s"}.`}
      >
        <ActivityList rows={report.activity} />
      </Section>

      {/* 9. STAT OF THE WEEK + BOLD PREDICTION */}
      <div className="grid gap-4 md:grid-cols-2 mt-4">
        <Section title="Stat of the Week" compact>
          <DigestBlock digest={report.digest} field="statOfTheWeek" />
        </Section>
        <Section title="Bold Prediction" compact>
          <DigestBlock digest={report.digest} field="boldPrediction" />
        </Section>
      </div>

      <footer className="mt-12 text-center text-[11px] text-[var(--lg-text-muted)]">
        Powered by Google Gemini &amp; Anthropic Claude ·{" "}
        {report.meta.generatedAt
          ? `Generated ${new Date(report.meta.generatedAt).toLocaleString()}`
          : "Digest not yet generated for this week"}
      </footer>
    </div>
  );
}

/* ───────────────────── helpers ───────────────────── */

function Section({
  title,
  note,
  children,
  compact,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={`lg-card p-4 md:p-6 ${compact ? "" : "mt-6"}`}>
      <h2 className="text-sm md:text-base font-bold uppercase tracking-wider text-[var(--lg-text-primary)]">
        {title}
      </h2>
      {note && <p className="mt-1 text-xs text-[var(--lg-text-muted)]">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] px-4 py-6 text-center text-xs italic text-[var(--lg-text-muted)]">
      {children}
    </div>
  );
}

function EmptyShell({ message }: { message: string }) {
  return (
    <div className="max-w-6xl mx-auto px-4 py-20 md:px-6 md:py-24 text-center text-sm text-[var(--lg-text-muted)]">
      {message}
    </div>
  );
}

function StandingsBlock({ standings }: { standings: WeeklyReport["standings"] }) {
  if (standings.rows.length === 0) {
    return <Placeholder>No active or completed periods for this league yet.</Placeholder>;
  }
  const max = standings.rows[0]?.totalPoints ?? 0;
  return (
    <ThemedTable density="compact" aria-label="Standings snapshot">
      <ThemedThead>
        <ThemedTr>
          <ThemedTh className="w-12">#</ThemedTh>
          <ThemedTh>Team</ThemedTh>
          <ThemedTh align="right" className="w-24">Points</ThemedTh>
          <ThemedTh className="w-[45%]">Share</ThemedTh>
        </ThemedTr>
      </ThemedThead>
      <tbody>
        {standings.rows.map((r) => {
          const pct = max > 0 ? Math.round((r.totalPoints / max) * 100) : 0;
          return (
            <ThemedTr key={r.teamId}>
              <ThemedTd className="tabular-nums text-[var(--lg-text-muted)]">{r.rank}</ThemedTd>
              <ThemedTd className="font-semibold text-[var(--lg-text-primary)] truncate">{r.teamName}</ThemedTd>
              <ThemedTd align="right" className="tabular-nums font-semibold">{r.totalPoints.toFixed(1)}</ThemedTd>
              <ThemedTd>
                <div className="h-2 rounded bg-[var(--lg-tint)] overflow-hidden">
                  <div className="h-full rounded bg-[var(--lg-accent)]" style={{ width: `${pct}%` }} />
                </div>
              </ThemedTd>
            </ThemedTr>
          );
        })}
      </tbody>
    </ThemedTable>
  );
}

/**
 * Renders a block from the league_digest JSON blob by field name.
 * The digest shape varies between weeks (AI output); we render any string
 * or array-of-strings/objects we find. Unknown shapes fall back to JSON.
 */
function DigestBlock({
  digest,
  field,
}: {
  digest: WeeklyReport["digest"];
  field: string;
}) {
  if (!digest.available || !digest.data) {
    return <Placeholder>No digest yet for this week.</Placeholder>;
  }
  const value = (digest.data as Record<string, unknown>)[field];
  if (value == null) {
    return <Placeholder>No {field} in this week's digest.</Placeholder>;
  }
  if (typeof value === "string") {
    return <p className="text-sm leading-relaxed text-[var(--lg-text-primary)]">{value}</p>;
  }
  if (Array.isArray(value)) {
    return (
      <ul className="space-y-2">
        {value.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed text-[var(--lg-text-primary)]">
            {renderScalarOrRecord(item)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return <div className="text-sm leading-relaxed">{renderScalarOrRecord(value)}</div>;
  }
  return <p className="text-sm">{String(value)}</p>;
}

function renderScalarOrRecord(item: unknown): React.ReactNode {
  if (item == null) return null;
  if (typeof item === "string") return item;
  if (typeof item === "object") {
    const obj = item as Record<string, unknown>;
    // Common digest shapes: { rank, team, note } or { team, change, reason }
    const rank = obj.rank ?? obj.position;
    const team = obj.team ?? obj.teamName;
    const note = obj.note ?? obj.reason ?? obj.summary ?? obj.description;
    if (team != null || note != null) {
      return (
        <span>
          {rank != null && <strong className="mr-2">#{String(rank)}</strong>}
          {team != null && <strong className="mr-2">{String(team)}</strong>}
          {note != null && <span className="text-[var(--lg-text-muted)]">{String(note)}</span>}
        </span>
      );
    }
    return <pre className="text-[10px] whitespace-pre-wrap">{JSON.stringify(obj, null, 2)}</pre>;
  }
  return String(item);
}

function TeamInsightsList({ teams }: { teams: WeeklyReport["teamInsights"] }) {
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());
  const toggle = (id: number) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const ready = teams.filter((t) => t.available).length;
  return (
    <div>
      <p className="mb-2 text-[11px] text-[var(--lg-text-muted)]">
        {ready} / {teams.length} teams have this week's AI insight.
      </p>
      <ul className="divide-y divide-[var(--lg-divide)] border-t border-b border-[var(--lg-border-subtle)]">
        {teams.map((t) => {
          const open = openIds.has(t.teamId);
          return (
            <li key={t.teamId} className="py-2">
              <button
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() => toggle(t.teamId)}
              >
                <span className="font-semibold text-[var(--lg-text-primary)]">{t.teamName}</span>
                <span className="text-[11px] uppercase tracking-wide text-[var(--lg-text-muted)]">
                  {t.available ? (open ? "Hide" : "Show") : "Not generated"}
                </span>
              </button>
              {open && t.available && t.data && (
                <div className="mt-2 rounded-md bg-[var(--lg-tint)] p-3 text-xs leading-relaxed">
                  <pre className="whitespace-pre-wrap">{JSON.stringify(t.data, null, 2)}</pre>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ActivityList({ rows }: { rows: WeeklyReport["activity"] }) {
  const grouped = useMemo(() => {
    const g: Record<string, WeeklyReport["activity"]> = {};
    for (const r of rows) {
      const key = r.type || "OTHER";
      (g[key] ??= []).push(r);
    }
    return g;
  }, [rows]);

  if (!rows.length) {
    return <Placeholder>No activity yet this week.</Placeholder>;
  }

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([type, items]) => (
        <div key={type}>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--lg-text-muted)]">
            {type} · {items.length}
          </h3>
          <ul className="mt-1 space-y-1">
            {items.slice(0, 10).map((r) => (
              <li key={r.id} className="text-xs text-[var(--lg-text-primary)]">
                <span className="text-[var(--lg-text-muted)]">
                  {new Date(r.at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                {r.teamName && <span className="ml-2 font-semibold">{r.teamName}</span>}
                {r.playerName && <span className="ml-2">— {r.playerName}</span>}
              </li>
            ))}
            {items.length > 10 && (
              <li className="text-[11px] text-[var(--lg-text-muted)] italic">
                + {items.length - 10} more
              </li>
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}
