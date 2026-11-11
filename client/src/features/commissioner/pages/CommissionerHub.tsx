// Commissioner home: where the period is, what's waiting on you, and the jobs.
// Every source loads independently; a failed call only drops its own line.
import React, { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { SectionLabel } from "../../../components/aurora/atoms";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import { Skeleton, useLoad } from "../components/cardParts";
import {
  getAcceptedTradeCount,
  getCommissionerOverview,
  getCommissionerRules,
  getGhostIlSummary,
  getInvites,
  getLeagueBalances,
  getLeaguePeriods,
  getRecentChanges,
  getRosterCheck,
  getUnbilledPeriods,
  type HubPeriod,
  type RecentChange,
} from "../api";
import { deriveNeedsYou, type NeedsYouItem } from "../lib/needsYou";
import { derivePeriodState, type PeriodState, type PeriodStep } from "../lib/periodState";
import { describeChange } from "../lib/recentChangeCopy";
import { CommissionerOnly } from "../components/CommissionerOnly";

const DAY_MS = 86_400_000;
const STEPS: Array<{ id: Exclude<PeriodStep, "setup">; label: string }> = [
  { id: "play", label: "Play" },
  { id: "close", label: "Close" },
  { id: "meeting", label: "Meeting" },
  { id: "start", label: "Start" },
];

const CARD: React.CSSProperties = {
  background: "var(--am-surface)",
  border: "1px solid var(--am-border)",
  borderRadius: 8,
};
const SUB: React.CSSProperties = { fontSize: 15, color: "var(--am-text-muted)" };
const BTN: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 48,
  padding: "0 16px",
  borderRadius: 6,
  fontSize: 17,
  fontWeight: 600,
  textDecoration: "none",
  border: "1px solid var(--am-accent)",
  background: "var(--am-accent)",
  color: "var(--am-on-accent)",
};

const dateFmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function daysLeftText(endIso: string, now: Date): string {
  const n = Math.round((utcDay(new Date(endIso)) - utcDay(now)) / DAY_MS);
  if (n <= 0) return "ends today";
  return `${n} ${n === 1 ? "day" : "days"} left`;
}

function trackerCopy(s: PeriodState, base: string, now: Date) {
  const { step, period, next } = s;
  switch (step) {
    case "play":
      return {
        caption: `${period!.name} · ends ${dateFmt(period!.endDate)} · ${daysLeftText(period!.endDate, now)}`,
        sentence: `When ${period!.name} ends, close it to freeze standings.`,
        action: { label: `Close ${period!.name} · ${dateFmt(period!.endDate)}`, to: null as string | null },
      };
    case "close":
      return {
        caption: `${period!.name} · ended ${dateFmt(period!.endDate)}`,
        sentence: "Final stats are in. Close the period to freeze standings.",
        action: { label: `Close ${period!.name}`, to: `${base}/close/${period!.id}` },
      };
    case "meeting":
      return next
        ? {
            caption: period ? `${period.name} closed · next is ${next.name}` : `${next.name} starts ${dateFmt(next.startDate)}`,
            sentence: `Enter meeting moves when ready, then start ${next.name}.`,
            action: { label: `Start ${next.name}`, to: `${base}/start/${next.id}` },
          }
        : {
            caption: `${period?.name ?? "The last period"} closed`,
            sentence: "No period is set up after this one.",
            action: { label: "Add the next period", to: `${base}/season` },
          };
    case "start":
      return {
        caption: `${next!.name} · starts ${dateFmt(next!.startDate)}`,
        sentence: "Review rosters, then start the period.",
        action: { label: `Start ${next!.name}`, to: `${base}/start/${next!.id}` },
      };
    default:
      return {
        caption: "No periods yet",
        sentence: "Add the season's periods to get started.",
        action: { label: "Set up periods", to: `${base}/season` },
      };
  }
}

function Tracker({ state, base, now }: { state: PeriodState; base: string; now: Date }) {
  const copy = trackerCopy(state, base, now);
  const current = STEPS.findIndex((s) => s.id === state.step);
  return (
    <section data-testid="tracker" style={{ ...CARD, border: "1px solid var(--am-accent)", padding: 16, display: "grid", gap: 12 }}>
      <div style={{ fontSize: 17, fontWeight: 600 }}>{copy.caption}</div>
      <ol style={{ display: "flex", listStyle: "none", margin: 0, padding: 0, gap: 8 }}>
        {STEPS.map((s, i) => {
          const isCurrent = i === current;
          const done = current >= 0 && i < current;
          return (
            <li
              key={s.id}
              data-testid={`step-${s.id}`}
              aria-current={isCurrent ? "step" : undefined}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "8px 0",
                borderRadius: 6,
                fontSize: 15,
                fontWeight: isCurrent ? 700 : 400,
                border: `1px solid ${isCurrent ? "var(--am-accent)" : "var(--am-border)"}`,
                color: isCurrent ? "var(--am-accent)" : done ? "var(--am-text-muted)" : "var(--am-text-faint)",
                opacity: done ? 0.7 : 1,
              }}
            >
              {done ? "✓ " : ""}{s.label}
            </li>
          );
        })}
      </ol>
      <p style={{ margin: 0, fontSize: 17 }}>{copy.sentence}</p>
      {copy.action.to === null ? (
        <button type="button" disabled style={{ ...BTN, background: "transparent", color: "var(--am-text-faint)", border: "1px solid var(--am-border)", cursor: "not-allowed" }}>
          {copy.action.label}
        </button>
      ) : (
        <Link to={copy.action.to} data-testid="tracker-action" style={BTN}>{copy.action.label}</Link>
      )}
    </section>
  );
}

const CHIP: Record<NeedsYouItem["kind"], string> = {
  start: "Start", close: "Close", bill: "Bill", roster: "Fix", trade: "Review",
};

function Tile({ to, title, status }: { to: string; title: string; status?: string | null }) {
  return (
    <Link
      to={to}
      style={{ ...CARD, display: "flex", flexDirection: "column", justifyContent: "center", gap: 2, minHeight: 72, padding: "10px 12px", color: "var(--am-text)", textDecoration: "none" }}
    >
      <span style={{ fontSize: 17, fontWeight: 600 }}>{title}</span>
      {status ? <span style={SUB}>{status}</span> : null}
    </Link>
  );
}

function LinkRow({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} style={{ display: "inline-flex", alignItems: "center", minHeight: 44, fontSize: 17, color: "var(--am-accent)", textDecoration: "none" }}>
      {children}
    </Link>
  );
}

function CommissionerHubBody() {
  const leagueId = Number(useParams().leagueId);
  const base = `/commissioner/${leagueId}`;
  const desktop = useMediaQuery("(min-width: 1024px)");
  const now = useMemo(() => new Date(), []);

  const periods = useLoad(() => getLeaguePeriods(leagueId), [leagueId]);
  const ghost = useLoad(() => getGhostIlSummary(leagueId), [leagueId]);
  const roster = useLoad(() => getRosterCheck(leagueId), [leagueId]);
  const trades = useLoad(() => getAcceptedTradeCount(leagueId), [leagueId]);
  const unbilled = useLoad(() => getUnbilledPeriods(leagueId), [leagueId]);
  const balances = useLoad(() => getLeagueBalances(leagueId), [leagueId]);
  const rules = useLoad(() => getCommissionerRules(leagueId), [leagueId]);
  const overview = useLoad(() => getCommissionerOverview(leagueId), [leagueId]);
  const invites = useLoad(() => getInvites(leagueId), [leagueId]);
  const recent = useLoad<RecentChange[]>(() => getRecentChanges(leagueId, 3), [leagueId]);

  const list: HubPeriod[] = periods.state === "ready" ? periods.data : [];
  const state = useMemo(() => derivePeriodState(list, now), [periods, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const sources = [ghost, roster, trades, unbilled];
  const sourcesSettled = sources.every((s) => s.state !== "loading");
  const someFailed = sources.some((s) => s.state === "error");
  const items: NeedsYouItem[] | null = useMemo(() => {
    if (periods.state !== "ready" || !sourcesSettled) return null;
    return deriveNeedsYou({
      periods: periods.data,
      ghostIlTotal: ghost.state === "ready" ? ghost.data.totalGhosts : 0,
      teamsOverCap: roster.state === "ready" ? roster.data.teams.filter((x) => x.over).length : 0,
      acceptedTrades: trades.state === "ready" ? trades.data : 0,
      unbilled: unbilled.state === "ready" ? unbilled.data : [],
      now,
    });
  }, [periods, ghost, roster, trades, unbilled, sourcesSettled, now]);

  // Tile status lines; undefined means no line (loading or failed).
  const teamCount = overview.state === "ready" ? (overview.data.teams ?? []).length : null;
  const pendingInvites = invites.state === "ready" ? invites.data.filter((i) => i.status === "PENDING").length : null;
  const tradeWindow = rules.state === "ready" ? rules.data.find((r) => r.key === "trade_window")?.value : undefined;
  const owed = balances.state === "ready" ? balances.data.reduce((sum, b) => sum + Math.max(0, b.balance), 0) : null;
  const status = {
    rosters: teamCount === null ? null : `${teamCount} ${teamCount === 1 ? "team" : "teams"}`,
    trades: trades.state === "ready" ? (trades.data > 0 ? `${trades.data} waiting` : "None waiting") : null,
    money: owed === null ? null : owed > 0 ? `$${owed.toLocaleString("en-US")} owed` : "All paid up",
    rules: tradeWindow === "meeting_day" ? "Trades: meeting day only" : tradeWindow === "anytime" ? "Trades: anytime" : null,
    owners:
      teamCount === null || pendingInvites === null
        ? null
        : `${teamCount} ${teamCount === 1 ? "team" : "teams"} · ${pendingInvites} ${pendingInvites === 1 ? "invite" : "invites"} pending`,
    season: periods.state === "ready" ? (state.period ?? state.next)?.name ?? null : null,
  };

  const waiting = (
    <section data-testid="needs-you">
      <SectionLabel>Waiting on you{items && items.length > 0 ? ` · ${items.length}` : ""}</SectionLabel>
      {periods.state === "error" ? (
        <p style={{ ...SUB, margin: 0, color: "var(--am-negative)" }}>Couldn’t load what needs you.</p>
      ) : items === null ? (
        <div style={CARD}><Skeleton /></div>
      ) : items.length === 0 ? (
        <p style={{ ...SUB, margin: 0 }}>Nothing needs you right now.</p>
      ) : (
        <div style={CARD}>
          {items.map((it, i) => (
            <Link
              key={it.key}
              to={`${base}/${it.to}`}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 56, padding: "8px 16px",
                borderTop: i === 0 ? "none" : "1px solid var(--am-border)", textDecoration: "none",
                color: it.urgent ? "var(--am-warning)" : "var(--am-text)",
              }}
            >
              <span>
                <strong style={{ fontSize: 17 }}>{it.title}</strong>
                <span style={{ ...SUB, display: "block" }}>{it.detail}</span>
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--am-accent)" }}>{CHIP[it.kind]} ›</span>
            </Link>
          ))}
        </div>
      )}
      {someFailed && <p style={{ ...SUB, margin: "8px 0 0" }}>Some checks couldn’t load.</p>}
    </section>
  );

  const tiles = (
    <div data-testid="tiles" style={{ display: "grid", gridTemplateColumns: `repeat(${desktop ? 3 : 2}, 1fr)`, gap: 8 }}>
      <Tile to={`${base}/rosters`} title="Rosters" status={status.rosters} />
      <Tile to={`${base}/trades`} title="Trades" status={status.trades} />
      <Tile to={`${base}/money`} title="Money" status={status.money} />
      <Tile to={`${base}/rules`} title="Rules" status={status.rules} />
      <Tile to={`${base}/owners`} title="Owners" status={status.owners} />
      <Tile to={`${base}/season`} title="Season" status={status.season} />
    </div>
  );

  const links = (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: 16 }}>
      <LinkRow to={`${base}/recent`}>History ›</LinkRow>
      <LinkRow to={`${base}/scoring`}>Scoring categories ›</LinkRow>
      <LinkRow to={`${base}/wire-list`}>Wire List settings ›</LinkRow>
    </div>
  );

  const latest =
    desktop && recent.state === "ready" && recent.data.length > 0 ? (
      <section data-testid="recent">
        <SectionLabel>Latest changes</SectionLabel>
        <div style={CARD}>
          {recent.data.slice(0, 3).map((c, i) => (
            <div key={c.id} style={{ minHeight: 56, padding: "8px 16px", borderTop: i === 0 ? "none" : "1px solid var(--am-border)" }}>
              <div style={{ fontSize: 17 }}>{describeChange(c, list)}</div>
              <div style={SUB}>{c.userName ?? "System"} · {dateFmt(c.createdAt)}</div>
            </div>
          ))}
        </div>
      </section>
    ) : null;

  const tracker =
    periods.state === "ready" ? (
      <Tracker state={state} base={base} now={now} />
    ) : periods.state === "error" ? (
      <p style={{ ...SUB, margin: 0, color: "var(--am-negative)" }}>Couldn’t load periods.</p>
    ) : (
      <div style={CARD}><Skeleton /></div>
    );

  return (
    <div
      style={{
        maxWidth: desktop ? 1200 : 720,
        margin: "0 auto",
        padding: "16px 16px 24px",
        display: "grid",
        gap: 16,
        gridTemplateColumns: desktop ? "1fr 1fr" : "1fr",
        alignItems: "start",
      }}
    >
      <div style={{ display: "grid", gap: 16 }}>
        {tracker}
        {waiting}
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {tiles}
        {links}
        {latest}
      </div>
    </div>
  );
}

export default function CommissionerHub() {
  const leagueId = Number(useParams().leagueId);
  return <CommissionerOnly leagueId={leagueId}><CommissionerHubBody /></CommissionerOnly>;
}
