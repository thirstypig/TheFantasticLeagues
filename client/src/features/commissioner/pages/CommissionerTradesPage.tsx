// Trades queue (screen 18). Accepted trades wait here for the commissioner to
// process or veto; processed trades can be reversed. Rosters change only here.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";
import { ConfirmSheet } from "../../../components/shared/ConfirmSheet";
import { useToast } from "../../../contexts/ToastContext";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import { CardError, LINK, PRIMARY, SECONDARY, Skeleton } from "../components/cardParts";
import {
  getCommissionerOverview,
  getCommissionerRosters,
  getCommissionerRules,
  getLeaguePeriods,
  getRosterCheck,
  listLeagueTrades,
  processLeagueTrade,
  reverseLeagueTrade,
  vetoLeagueTrade,
} from "../api";
import type { LeagueTrade, LeagueTradeItem, RosterCheck, RosterItem } from "../api";
import { CommissionerOnly } from "../components/CommissionerOnly";
import { derivePeriodState } from "../lib/periodState";
import { checkAcceptedTrade } from "../lib/tradeRosterCheck";
import "../commissioner.css";

/** "Mon Dec 7" */
function fmtLong(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).replace(",", "");
}
/** "Nov 2" */
function fmtShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts[parts.length - 1] || full;
}

const SUB: React.CSSProperties = { fontSize: 15, color: "var(--am-text-muted)" };
const CARD: React.CSSProperties = { padding: 16, borderBottom: "1px solid var(--am-border)", display: "grid", gap: 6 };
const TONE: Record<"good" | "bad" | "note", string> = {
  good: "var(--am-positive)",
  bad: "var(--am-negative)",
  note: "var(--am-text-muted)",
};

type SheetKind = "process" | "veto" | "reverse";

interface Data {
  trades: LeagueTrade[];
  teamNames: Record<number, string>;
  rosters: RosterItem[];
  check: RosterCheck | null;
  periods: Awaited<ReturnType<typeof getLeaguePeriods>>;
  rule: string | undefined;
}

function assetLine(it: LeagueTradeItem, nameOf: (id: number) => string): string {
  const to = it.recipient?.name ?? nameOf(it.recipientId);
  if (it.assetType === "PLAYER") return `${it.player ? lastName(it.player.name) : "A player"} → ${to}`;
  if (it.assetType === "BUDGET") return `$${it.amount ?? 0} → ${to}`;
  return `${it.assetType.toLowerCase().replace(/_/g, " ")} → ${to}`;
}

function pairName(t: LeagueTrade, nameOf: (id: number) => string): string {
  const ids = [...new Set(t.items.flatMap((i) => [i.senderId, i.recipientId]))];
  return ids.map(nameOf).join(" ↔ ");
}

function TradesBody({ leagueId }: { leagueId: number }) {
  const base = `/commissioner/${leagueId}`;
  const { toast } = useToast();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState<{ kind: SheetKind; trade: LeagueTrade } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const alive = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []); // re-arm on StrictMode remount

  const load = useCallback(async (initial: boolean) => {
    try {
      const [trades, overview, rosters, check, periods, rules] = await Promise.all([
        listLeagueTrades(leagueId),
        getCommissionerOverview(leagueId),
        getCommissionerRosters(leagueId),
        getRosterCheck(leagueId).catch(() => null),
        getLeaguePeriods(leagueId),
        getCommissionerRules(leagueId).catch(() => []),
      ]);
      if (!alive.current) return;
      setData({
        trades,
        teamNames: Object.fromEntries((overview.teams ?? []).map((t) => [t.id, t.name])),
        rosters,
        check,
        periods,
        rule: rules.find((r) => r.key === "trade_window")?.value,
      });
      setFailed(false);
    } catch {
      if (alive.current && initial) setFailed(true);
    }
  }, [leagueId]);

  useEffect(() => { void load(true); }, [load]);

  const nameOf = (id: number) => data?.teamNames[id] ?? `Team ${id}`;

  // Between periods Process is dated to the pending period's start, like meeting moves.
  const effectiveDate = useMemo(() => {
    if (!data) return undefined;
    const state = derivePeriodState(data.periods, new Date());
    if (state.step === "play" || state.step === "close") return undefined;
    return state.next ? state.next.startDate : undefined;
  }, [data]);

  const active = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const r of data?.rosters ?? []) {
      if (r.assignedPosition === "IL") continue;
      if (!map.has(r.teamId)) map.set(r.teamId, new Set());
      map.get(r.teamId)!.add(r.player.id);
    }
    return map;
  }, [data]);

  async function confirm() {
    if (!sheet || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const { kind, trade } = sheet;
    try {
      if (kind === "process") await processLeagueTrade(trade.id, effectiveDate ? effectiveDate.slice(0, 10) : undefined);
      else if (kind === "veto") await vetoLeagueTrade(trade.id);
      else await reverseLeagueTrade(trade.id);
      if (alive.current) setErrors((e) => { const { [trade.id]: _drop, ...rest } = e; return rest; });
      toast(kind === "process" ? "Trade processed" : kind === "veto" ? "Trade vetoed" : "Trade reversed", "success");
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : "Couldn’t update this trade.";
      if (alive.current) setErrors((e) => ({ ...e, [trade.id]: msg }));
      toast(msg, "error");
    } finally {
      inFlight.current = false;
      if (alive.current) { setBusy(false); setSheet(null); }
      await load(false); // success or a stale-list 400: always show what the server has now
    }
  }

  const back = <Link to={base} style={LINK}>‹ Commissioner</Link>;
  const shell = (children: React.ReactNode) => (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 16px 32px", display: "grid", gap: 16 }}>{back}{children}</div>
  );

  if (failed) return shell(<Glass padded={false}><CardError>Couldn’t load trades.</CardError></Glass>);
  if (!data) return shell(<Glass padded={false}><Skeleton /></Glass>);

  const toProcess = data.trades.filter((t) => t.status === "ACCEPTED");
  const discussing = data.trades.filter((t) => t.status === "PROPOSED");
  const done = data.trades.filter((t) => t.status === "PROCESSED");
  const ruleLine = data.rule === "anytime"
    ? "Rule: anytime · every trade waits for you"
    : data.rule === "meeting_day"
      ? "Rule: meeting day only · every trade waits for you"
      : "Every trade waits for you";

  const counts = new Map((data.check?.teams ?? []).map((t) => [t.teamId, t.activeCount]));
  const cap = data.check?.cap ?? 0;

  const err = (id: number) => errors[id] && <p role="alert" style={{ margin: 0, fontSize: 15, color: "var(--am-negative)" }}>{errors[id]}</p>;
  const btnRow: React.CSSProperties = { display: "grid", gridTemplateColumns: desktop ? "auto auto" : "1fr 1fr", gap: 8, justifyContent: "start" };

  const sheetProps = (() => {
    if (!sheet) return null;
    const { kind } = sheet;
    if (kind === "process") {
      return {
        title: effectiveDate ? `Process, dated ${fmtLong(effectiveDate)}?` : "Process, effective tomorrow?",
        body: "Both rosters change and the dollars move. Owners see it in Activity.",
        confirmLabel: "Process trade",
        cancelLabel: "Not yet",
      };
    }
    if (kind === "veto") {
      return { title: "Veto this trade?", body: "Nothing moves and both owners are told it was vetoed.", confirmLabel: "Veto trade", cancelLabel: "Keep it" };
    }
    return {
      title: "Reverse this trade?",
      body: "Players and dollars go back, effective tomorrow.",
      confirmLabel: "Reverse trade",
      cancelLabel: "Keep it",
    };
  })();

  return shell(
    <>
      <header>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--am-text)" }}>Trades</h1>
        <p style={{ margin: "4px 0 0", ...SUB }}>{ruleLine}</p>
      </header>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: desktop ? "minmax(0, 3fr) minmax(0, 2fr)" : "1fr", alignItems: "start" }}>
        <div style={{ display: "grid", gap: 8 }}>
          <SectionLabel>{`To process · ${toProcess.length}`}</SectionLabel>
          <Glass padded={false}>
            {toProcess.length === 0 && <p style={{ margin: 0, padding: 16, fontSize: 17, color: "var(--am-text-muted)" }}>Nothing waiting for you.</p>}
            {toProcess.map((t) => {
              const check = checkAcceptedTrade({ items: t.items, active, counts, names: nameOf, cap });
              return (
                <div key={t.id} style={CARD} data-testid="trade-card">
                  <b style={{ fontSize: 17, color: "var(--am-text)" }}>{pairName(t, nameOf)}</b>
                  {t.items.map((it, i) => {
                    const meta = it.assetType === "PLAYER" ? [it.player?.posPrimary, it.player?.mlbTeam].filter(Boolean).join(" · ") : "";
                    return (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 17, color: "var(--am-text)" }}>{assetLine(it, nameOf)}</span>
                        {meta && <span style={SUB}>{meta}</span>}
                      </div>
                    );
                  })}
                  {data.check && check.lines.map((l, i) => (
                    <span key={i} style={{ fontSize: 15, color: TONE[l.tone] }}>
                      {l.tone === "good" && <span aria-hidden="true" style={{ marginRight: 6 }}>✓</span>}
                      <span>{l.text}</span>
                    </span>
                  ))}
                  <span style={SUB}>{`offered ${fmtShort(t.createdAt)}`}</span>
                  {err(t.id)}
                  <div style={btnRow}>
                    <button type="button" style={SECONDARY} disabled={busy} onClick={() => setSheet({ kind: "veto", trade: t })}>Veto</button>
                    <button type="button" style={PRIMARY} disabled={busy} onClick={() => setSheet({ kind: "process", trade: t })}>Process</button>
                  </div>
                </div>
              );
            })}
          </Glass>
        </div>

        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <div style={{ display: "grid", gap: 8 }}>
            <SectionLabel>Still being discussed</SectionLabel>
            <Glass padded={false}>
              {discussing.length === 0 && <p style={{ margin: 0, padding: 16, fontSize: 17, color: "var(--am-text-muted)" }}>No open offers.</p>}
              {discussing.map((t) => {
                const other = t.items.find((i) => i.senderId === t.proposerId)?.recipientId ?? t.items[0]?.recipientId;
                return (
                  <div key={t.id} style={CARD} data-testid="trade-card">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <b style={{ fontSize: 17, color: "var(--am-text)" }}>{`${nameOf(t.proposerId)} → ${other != null ? nameOf(other) : "?"}`}</b>
                      <span style={{ ...SUB, fontWeight: 600 }}>Waiting</span>
                    </div>
                    <span style={SUB}>{`Offered ${fmtShort(t.createdAt)}, not answered`}</span>
                  </div>
                );
              })}
            </Glass>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <SectionLabel>Processed this season</SectionLabel>
            <Glass padded={false}>
              {done.length === 0 && <p style={{ margin: 0, padding: 16, fontSize: 17, color: "var(--am-text-muted)" }}>None yet.</p>}
              {done.map((t) => {
                const n = t.items.filter((i) => i.assetType === "PLAYER").length;
                return (
                  <div key={t.id} style={CARD} data-testid="trade-card">
                    <b style={{ fontSize: 17, color: "var(--am-text)" }}>{pairName(t, nameOf)}</b>
                    <span style={SUB}>{`${t.processedAt ? fmtShort(t.processedAt) : fmtShort(t.createdAt)} · ${n} ${n === 1 ? "player" : "players"}`}</span>
                    {err(t.id)}
                    <div style={btnRow}>
                      <button type="button" style={SECONDARY} disabled={busy} onClick={() => setSheet({ kind: "reverse", trade: t })}>Reverse</button>
                    </div>
                  </div>
                );
              })}
            </Glass>
          </div>
        </div>
      </div>

      <Link to={`${base}/trade-record`} style={LINK}>Record a past trade ›</Link>

      {sheetProps && (
        <ConfirmSheet open {...sheetProps} busy={busy} onConfirm={confirm} onCancel={() => setSheet(null)} />
      )}
    </>,
  );
}

export default function CommissionerTradesPage() {
  const leagueId = Number(useParams().leagueId);
  return (
    <CommissionerOnly leagueId={leagueId}>
      <TradesBody key={leagueId} leagueId={leagueId} />
    </CommissionerOnly>
  );
}
