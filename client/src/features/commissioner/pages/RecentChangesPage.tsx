// History: the league's audit trail, filterable by group and grouped by day.
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Glass } from "../../../components/aurora/atoms";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import { getLeaguePeriods, getRecentChanges, type HubPeriod, type RecentChange } from "../api";
import { describeChange } from "../lib/recentChangeCopy";
import { HISTORY_CHIPS, matchesChip, type HistoryChip } from "../lib/historyFilters";
import { CommissionerOnly } from "../components/CommissionerOnly";

const CAPTION: React.CSSProperties = { fontSize: 13, color: "var(--am-text-muted)" };
const DAY_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const TIME_FMT = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

const dayLabel = (iso: string) => DAY_FMT.format(new Date(iso));
const timeLabel = (iso: string) => TIME_FMT.format(new Date(iso)).replace(/\s?([AP])M$/, (_, x: string) => ` ${x.toLowerCase()}m`);

function groupByDay(changes: RecentChange[]): { day: string; rows: RecentChange[] }[] {
  const groups: { day: string; rows: RecentChange[] }[] = [];
  for (const c of changes) {
    const day = dayLabel(c.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(c);
    else groups.push({ day, rows: [c] });
  }
  return groups;
}

function RecentChangesPageBody() {
  const leagueId = Number(useParams().leagueId);
  const [changes, setChanges] = useState<RecentChange[] | null>(null);
  const [periods, setPeriods] = useState<HubPeriod[]>([]);
  const [error, setError] = useState(false);
  const [chip, setChip] = useState<HistoryChip>("All");
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  useEffect(() => {
    let live = true;
    getRecentChanges(leagueId, 200).then((c) => live && setChanges(c), () => live && setError(true));
    // Period names are a nicety; copy falls back to "#id" without them.
    getLeaguePeriods(leagueId).then((p) => live && setPeriods(p), () => {});
    return () => { live = false; };
  }, [leagueId]);

  const groups = useMemo(
    () => groupByDay((changes ?? []).filter((c) => matchesChip(c.action, chip))),
    [changes, chip],
  );

  const body = () => {
    if (error) return <p style={{ padding: 16, margin: 0, fontSize: 17, color: "var(--am-negative)" }}>Couldn’t load history.</p>;
    if (changes === null) return <p style={{ padding: 16, margin: 0, fontSize: 17, color: "var(--am-text-muted)" }}>Loading…</p>;
    if (groups.length === 0) {
      return (
        <p style={{ padding: 16, margin: 0, fontSize: 17, color: "var(--am-text-muted)" }}>
          {chip === "All" ? "Nothing yet." : "Nothing in this group in the latest 200 changes."}
        </p>
      );
    }
    return groups.map((g) => (
      <section key={g.day}>
        <h2 style={{ ...CAPTION, margin: 0, padding: "12px 16px 4px", fontWeight: 600 }}>{g.day}</h2>
        {isDesktop ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={CAPTION}>
                <th style={{ textAlign: "left", fontWeight: 500, padding: "4px 16px", width: 100 }}>When</th>
                <th style={{ textAlign: "left", fontWeight: 500, padding: "4px 16px" }}>What</th>
                <th style={{ textAlign: "left", fontWeight: 500, padding: "4px 16px", width: 160 }}>Who</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((c) => (
                <tr key={c.id} style={{ borderTop: "1px solid var(--am-border)", height: 56 }}>
                  <td style={{ padding: "0 16px", ...CAPTION }}>{timeLabel(c.createdAt)}</td>
                  <td style={{ padding: "0 16px", fontSize: 15, color: "var(--am-text)" }}>{describeChange(c, periods)}</td>
                  <td style={{ padding: "0 16px", ...CAPTION }}>{c.userName ?? "System"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          g.rows.map((c) => (
            <div key={c.id} style={{ padding: "10px 16px", minHeight: 56, borderTop: "1px solid var(--am-border)", boxSizing: "border-box" }}>
              <div style={{ fontSize: 15, color: "var(--am-text)" }}>{describeChange(c, periods)}</div>
              <div style={CAPTION}>{timeLabel(c.createdAt)} · {c.userName ?? "System"}</div>
            </div>
          ))
        )}
      </section>
    ));
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px 32px" }}>
      <Link
        to={`/commissioner/${leagueId}`}
        style={{ display: "inline-flex", alignItems: "center", minHeight: 44, fontSize: 17, color: "var(--am-text-muted)" }}
      >
        ‹ Commissioner
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 12px", color: "var(--am-text)" }}>History</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {HISTORY_CHIPS.map((name) => {
          const on = chip === name;
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              onClick={() => setChip(name)}
              style={{
                minHeight: 44,
                padding: "0 16px",
                fontSize: 15,
                borderRadius: 22,
                cursor: "pointer",
                background: on ? "var(--am-accent)" : "var(--am-field)",
                color: on ? "var(--am-on-accent)" : "var(--am-text)",
                border: `1px solid ${on ? "var(--am-accent)" : "var(--am-field-line)"}`,
              }}
            >
              {name}
            </button>
          );
        })}
      </div>
      <Glass padded={false}>{body()}</Glass>
      <p style={{ ...CAPTION, marginTop: 12 }}>Older actions from before this feature may not appear.</p>
    </div>
  );
}

export default function RecentChangesPage() {
  const leagueId = Number(useParams().leagueId);
  return <CommissionerOnly leagueId={leagueId}><RecentChangesPageBody /></CommissionerOnly>;
}
