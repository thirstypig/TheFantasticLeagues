// Rosters home (screen 12): every team with anything needing a fix flagged on
// its row. Between periods a meeting card sits on top.
import React, { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";
import { CardError, LINK, PRIMARY, ROW, Skeleton, useLoad } from "../components/cardParts";
import {
  getCommissionerOverview,
  getCommissionerRosters,
  getGhostIlSummary,
  getLeaguePeriods,
  getRosterCheck,
} from "../api";
import type { HubPeriod } from "../api";
import { CommissionerOnly } from "../components/CommissionerOnly";
import { derivePeriodState } from "../lib/periodState";
import { completeMoves, loadDraft } from "../lib/meetingDraft";
import "../commissioner.css";

/** "Mon Jun 15" */
function fmtLong(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).replace(",", "");
}

function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts[parts.length - 1] || full;
}

const SUB: React.CSSProperties = { fontSize: 15, color: "var(--am-text-muted)" };
const TH: React.CSSProperties = { textAlign: "left", padding: "10px 16px", fontSize: 13, fontWeight: 600, color: "var(--am-text-muted)" };
const TD: React.CSSProperties = { padding: "10px 16px", fontSize: 15, minHeight: 56, color: "var(--am-text)" };

interface TeamLine {
  id: number;
  name: string;
  active: number | null;
  over: boolean;
  il: number | null;
  ghosts: string[];
}

function periodNumber(p: HubPeriod): string | null {
  const m = /^Period (\d+)$/.exec(p.name);
  return m ? m[1] : null;
}

function MeetingCard({ base, periods, leagueId }: { base: string; periods: HubPeriod[]; leagueId: number }) {
  const state = derivePeriodState(periods, new Date());
  const next = state.next;
  const draftCount = useMemo(
    () => (next ? completeMoves(loadDraft(leagueId, next.id)).length : 0),
    [leagueId, next?.id], // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (state.step !== "meeting" && state.step !== "start") return null;

  if (!next) {
    return (
      <Glass padded>
        <p style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 600, color: "var(--am-text)" }}>Set up the next period first</p>
        <Link to={`${base}/season`} style={LINK}>Season and periods ›</Link>
      </Glass>
    );
  }

  const prev =
    periods
      .filter((p) => p.status === "completed")
      .sort((a, b) => b.endDate.localeCompare(a.endDate))[0] ?? null;
  const prevNo = prev ? periodNumber(prev) : null;
  const nextNo = periodNumber(next);
  const cap = prev
    ? `Between ${prevNo && nextNo ? `Period ${prevNo} and ${nextNo}` : `${prev.name} and ${next.name}`}`
    : `Before ${next.name}`;

  return (
    <Glass padded>
      <div style={{ display: "grid", gap: 8 }}>
        <SectionLabel>{cap}</SectionLabel>
        <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--am-text)" }}>{next.name} meeting moves</p>
        <p style={{ margin: 0, ...SUB }}>
          Enter every owner&rsquo;s adds and drops, review, then save them all at once. Dated {fmtLong(next.startDate)}.
        </p>
        <Link
          to={`${base}/meeting/${next.id}`}
          style={{ ...PRIMARY, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
        >
          {draftCount > 0 ? `Continue meeting moves (${draftCount})` : "Enter meeting moves"}
        </Link>
      </div>
    </Glass>
  );
}

function RostersPageBody() {
  const leagueId = Number(useParams().leagueId);
  const base = `/commissioner/${leagueId}`;

  const overview = useLoad(() => getCommissionerOverview(leagueId), [leagueId]);
  const periods = useLoad(() => getLeaguePeriods(leagueId), [leagueId]);
  const check = useLoad(() => getRosterCheck(leagueId), [leagueId]);
  const rosters = useLoad(() => getCommissionerRosters(leagueId), [leagueId]);
  const ghosts = useLoad(() => getGhostIlSummary(leagueId), [leagueId]);

  let teamsBlock: React.ReactNode;
  if (overview.state === "loading" || check.state === "loading") {
    teamsBlock = <Glass padded={false}><Skeleton /></Glass>;
  } else if (overview.state === "error") {
    teamsBlock = <Glass padded={false}><CardError>Couldn’t load teams.</CardError></Glass>;
  } else {
    const checkData = check.state === "ready" ? check.data : null;
    const cap = checkData?.cap ?? null;
    const lines: TeamLine[] = (overview.data.teams ?? [])
      .map((t) => {
        const c = checkData?.teams.find((x) => x.teamId === t.id);
        const g = ghosts.state === "ready" ? ghosts.data.teams.find((x) => x.teamId === t.id) : undefined;
        return {
          id: t.id,
          name: t.name,
          active: c ? c.activeCount : null,
          over: c ? c.over : false,
          il: rosters.state === "ready" ? rosters.data.filter((r) => r.teamId === t.id && r.assignedPosition === "IL").length : null,
          ghosts: (g?.ghosts ?? []).map((x) => lastName(x.playerName)),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const overBy = (l: TeamLine) => (l.active ?? 0) - (cap ?? 0);
    const count = (l: TeamLine) => (l.active === null || cap === null ? "–" : `${l.active} / ${cap}`);

    teamsBlock = (
      <>
        <div className="rosters-phone" data-testid="rosters-phone">
          <Glass padded={false}>
            {lines.map((l) => (
              <Link key={l.id} to={`${base}/rosters/${l.id}`} data-testid="team-row" style={{ ...ROW, minHeight: 56 }}>
                <span style={{ display: "grid", gap: 2 }}>
                  <b style={{ fontSize: 17 }}>{l.name}</b>
                  {l.ghosts.map((n) => (
                    <small key={n} style={{ fontSize: 15, color: "var(--am-warning)" }}>{n} back from MLB IL</small>
                  ))}
                  {l.ghosts.length === 0 && <small style={SUB}>{count(l)}</small>}
                </span>
                {l.over || l.ghosts.length > 0 ? (
                  <span style={{ display: "flex", gap: 8, fontSize: 15, fontWeight: 600 }}>
                    {l.over && <span style={{ color: "var(--am-negative)" }}>{overBy(l)} over</span>}
                    {l.ghosts.length > 0 && <span style={{ color: "var(--am-warning)" }}>Fix</span>}
                  </span>
                ) : (
                  <span aria-hidden="true">›</span>
                )}
              </Link>
            ))}
          </Glass>
        </div>
        <div className="rosters-desk" data-testid="rosters-desk">
          <Glass padded={false}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TH}>Team</th>
                  <th style={TH}>Roster</th>
                  <th style={TH}>IL</th>
                  <th style={TH}>Needs attention</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const flags: React.ReactNode[] = [];
                  if (l.over) flags.push(<span key="over" style={{ color: "var(--am-negative)" }}>{overBy(l)} over the limit</span>);
                  l.ghosts.forEach((n) => flags.push(<span key={n} style={{ color: "var(--am-warning)" }}>{n} back from MLB IL</span>));
                  return (
                    <tr key={l.id} data-testid="team-tr" style={{ borderTop: "1px solid var(--am-border)" }}>
                      <td style={TD}><Link to={`${base}/rosters/${l.id}`} style={{ ...LINK, fontSize: 15 }}>{l.name}</Link></td>
                      <td style={TD}>{count(l)}</td>
                      <td style={TD}>{l.il ?? "–"}</td>
                      <td style={TD}>
                        {flags.length === 0 ? <span style={{ color: "var(--am-text-muted)" }}>–</span> : (
                          <span style={{ display: "grid", gap: 2 }}>{flags}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Glass>
        </div>
      </>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px 16px 32px", display: "grid", gap: 16 }}>
      <header>
        <Link to={base} style={LINK}>‹ Commissioner</Link>
        <h1 style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700, color: "var(--am-text)" }}>Rosters</h1>
      </header>
      {periods.state === "ready" && <MeetingCard base={base} periods={periods.data} leagueId={leagueId} />}
      <SectionLabel>Teams · A to Z</SectionLabel>
      {teamsBlock}
      {check.state === "error" && <p style={{ margin: 0, ...SUB }}>Couldn’t check roster sizes.</p>}
      {ghosts.state === "error" && <p style={{ margin: 0, ...SUB }}>Couldn’t check IL status.</p>}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Link to={`${base}/roster-setup`} style={LINK}>Preseason tools ›</Link>
        <Link to={`${base}/roster-advanced`} style={LINK}>Backdated fixes ›</Link>
      </div>
    </div>
  );
}

export default function RostersPage() {
  const leagueId = Number(useParams().leagueId);
  return <CommissionerOnly leagueId={leagueId}><RostersPageBody /></CommissionerOnly>;
}
