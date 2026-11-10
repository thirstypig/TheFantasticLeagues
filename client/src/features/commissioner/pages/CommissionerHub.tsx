// Commissioner landing page: Needs you, the seven jobs, recent changes.
// Each card loads independently; a failed fetch errors only its own card.
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";
import { CardError, MUTED, ROW, Skeleton, useLoad } from "../components/cardParts";
import {
  getAcceptedTradeCount,
  getGhostIlSummary,
  getLeaguePeriods,
  getRecentChanges,
  getRosterCheck,
  getUnbilledPeriods,
  type HubPeriod,
  type RecentChange,
} from "../api";
import { deriveNeedsYou, type NeedsYouItem } from "../lib/needsYou";
import { describeChange } from "../lib/recentChangeCopy";

function JobRow({ to, label, hint }: { to: string | null; label: string; hint?: string }) {
  const body = (
    <>
      <span>
        {label}
        {hint && <span style={{ ...MUTED, display: "block" }}>{hint}</span>}
      </span>
      <span aria-hidden="true" style={{ color: "var(--am-text-faint)" }}>›</span>
    </>
  );
  if (to === null) {
    return <div aria-disabled="true" style={{ ...ROW, color: "var(--am-text-faint)" }}>{body}</div>;
  }
  return <Link to={to} style={ROW}>{body}</Link>;
}

export default function CommissionerHub() {
  const leagueId = Number(useParams().leagueId);
  const base = `/commissioner/${leagueId}`;

  const periods = useLoad(() => getLeaguePeriods(leagueId), [leagueId]);
  const recent = useLoad<RecentChange[]>(() => getRecentChanges(leagueId, 3), [leagueId]);

  // Needs you: periods are shared with Jobs; the other four sources degrade to
  // "unknown" (flagged in the card) rather than hiding the items we do have.
  const [others, setOthers] = useState<
    { ghost: number; over: number; trades: number; unbilled: Awaited<ReturnType<typeof getUnbilledPeriods>>; failed: boolean } | null
  >(null);
  useEffect(() => {
    let live = true;
    Promise.allSettled([
      getGhostIlSummary(leagueId),
      getRosterCheck(leagueId),
      getAcceptedTradeCount(leagueId),
      getUnbilledPeriods(leagueId),
    ]).then(([g, r, t, u]) => {
      if (!live) return;
      setOthers({
        ghost: g.status === "fulfilled" ? g.value.totalGhosts : 0,
        over: r.status === "fulfilled" ? r.value.teams.filter((x) => x.over).length : 0,
        trades: t.status === "fulfilled" ? t.value : 0,
        unbilled: u.status === "fulfilled" ? u.value : [],
        failed: [g, r, t, u].some((x) => x.status === "rejected"),
      });
    });
    return () => { live = false; };
  }, [leagueId]);

  const items: NeedsYouItem[] | null = useMemo(() => {
    if (periods.state !== "ready" || !others) return null;
    return deriveNeedsYou({
      periods: periods.data,
      ghostIlTotal: others.ghost,
      teamsOverCap: others.over,
      acceptedTrades: others.trades,
      unbilled: others.unbilled,
      now: new Date(),
    });
  }, [periods, others]);

  const list = periods.state === "ready" ? periods.data : [];
  const closeTarget =
    list.find((p) => p.status === "active") ??
    [...list].filter((p) => p.status === "completed").sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  const startTarget = list.find((p) => p.status === "pending");

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 16px 32px", display: "grid", gap: 16 }}>
      <section data-testid="needs-you">
        <SectionLabel>
          Needs you{items && items.length > 0 ? ` · ${items.length}` : ""}
        </SectionLabel>
        <Glass padded={false}>
          {periods.state === "error" ? (
            <CardError>Couldn’t load what needs you.</CardError>
          ) : items === null ? (
            <Skeleton />
          ) : (
            <>
              {items.length === 0 && <p style={{ ...ROW, margin: 0, ...MUTED }}>Nothing needs you right now.</p>}
              {items.map((it) => (
                <Link
                  key={it.key}
                  to={`${base}/${it.to}`}
                  style={{ ...ROW, color: it.urgent ? "var(--am-warning)" : "var(--am-text)" }}
                >
                  <span>
                    <strong>{it.title}</strong>
                    <span style={{ ...MUTED, display: "block" }}>{it.detail}</span>
                  </span>
                  <span aria-hidden="true">›</span>
                </Link>
              ))}
              {others?.failed && <p style={{ margin: 0, padding: "10px 16px", ...MUTED }}>Some checks couldn’t load.</p>}
            </>
          )}
        </Glass>
      </section>

      <section>
        <SectionLabel>Jobs</SectionLabel>
        <div data-testid="jobs"><Glass padded={false}>
          {periods.state === "loading" ? (
            <Skeleton />
          ) : (
            <>
              <JobRow
                label="Close a period"
                to={closeTarget ? `${base}/close/${closeTarget.id}` : null}
                hint={closeTarget ? closeTarget.name : "No active period"}
              />
              {/* No pending period: send the commissioner to set one up rather than a dead row. */}
              <JobRow
                label="Start next period"
                to={startTarget ? `${base}/start/${startTarget.id}` : `${base}/settings`}
                hint={startTarget ? startTarget.name : "No next period set up"}
              />
              <JobRow label="Fix a roster" to={`${base}/rosters`} />
              <JobRow label="Trades" to={`${base}/trades`} />
              <JobRow label="Money" to={`${base}/money`} />
              <JobRow label="League settings & rules" to={`${base}/settings`} />
              <JobRow label="Owners & invites" to={`${base}/owners`} />
              {periods.state === "error" && <CardError>Couldn’t load periods.</CardError>}
            </>
          )}
        </Glass></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {[
            ["Overview", "overview"],
            ["Archive", "archive"],
            ["Scoring categories", "scoring"],
            ["Wire List settings", "wire-list"],
          ].map(([label, slug]) => (
            <Link
              key={slug}
              to={`${base}/${slug}`}
              style={{ display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 12px", fontSize: 17, color: "var(--am-accent)" }}
            >
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section data-testid="recent">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <SectionLabel>Recent changes</SectionLabel>
          <Link to={`${base}/recent`} style={{ display: "inline-flex", alignItems: "center", minHeight: 44, fontSize: 17, color: "var(--am-accent)" }}>
            All ›
          </Link>
        </div>
        <Glass padded={false}>
          {recent.state === "loading" ? (
            <Skeleton />
          ) : recent.state === "error" ? (
            <CardError>Couldn’t load recent changes.</CardError>
          ) : recent.data.length === 0 ? (
            <p style={{ ...ROW, margin: 0, ...MUTED }}>No recent changes yet.</p>
          ) : (
            recent.data.map((c) => (
              <div key={c.id} style={{ ...ROW, display: "block" }}>
                <div>{describeChange(c, list)}</div>
                <div style={MUTED}>{c.userName ?? "System"} · {new Date(c.createdAt).toLocaleDateString()}</div>
              </div>
            ))
          )}
        </Glass>
      </section>
    </div>
  );
}
