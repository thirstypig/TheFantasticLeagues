// Screen 17: Trades home (/trades). Offers to me first with Accept / Reject
// on the card, then my own offers, then what was settled. Every irreversible
// action goes through the ConfirmSheet; errors show on the card that caused
// them and the list reloads (another owner may have answered first).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLeague } from "../../../contexts/LeagueContext";
import { useToast } from "../../../contexts/ToastContext";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import { ConfirmSheet } from "../../../components/shared/ConfirmSheet";
import { acceptTrade, cancelTrade, getTrades, getTradeWindow, rejectTrade } from "../api";
import type { TradeItem, TradeProposal, TradeWindow } from "../api";
import { loadTradeDraft } from "../lib/tradeDraft";

type Kind = "accept" | "reject" | "cancel";
const DONE_STATUSES = ["PROCESSED", "REVERSED", "VETOED"];
const DONE_LIMIT = 20; // no cheap season signal on the list endpoint: show the latest 20

const CAP: React.CSSProperties = {
  margin: "16px 0 8px", fontSize: 13, fontWeight: 700, letterSpacing: "0.06em",
  textTransform: "uppercase", color: "var(--am-text-faint)",
};
const BOX: React.CSSProperties = {
  border: "1px solid var(--am-border)", borderRadius: 8, background: "var(--am-surface)", padding: 16, display: "grid", gap: 8,
};
const BTN: React.CSSProperties = {
  minHeight: 44, padding: "0 16px", borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  border: "1px solid var(--am-border-strong)", background: "transparent", color: "var(--am-text)",
};
const BTN_PRIMARY: React.CSSProperties = {
  ...BTN, border: "1px solid var(--am-accent)", background: "var(--am-accent)", color: "var(--am-on-accent)",
};
const CHIP: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, padding: "3px 9px", borderRadius: 4, whiteSpace: "nowrap",
  background: "var(--am-chip)", color: "var(--am-text-muted)", border: "1px solid var(--am-border)",
};
const SMALL: React.CSSProperties = { fontSize: 13, color: "var(--am-text-muted)" };

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(" at ", ", ");
}
function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function assetLabel(i: TradeItem): string {
  if (i.assetType === "PLAYER") return i.player?.name ?? "A player";
  if (i.assetType === "BUDGET") return `$${i.amount ?? 0} auction`;
  if (i.assetType === "PICK") return `Round ${i.pickRound ?? "?"} pick${i.season ? ` (${i.season})` : ""}`;
  if (i.assetType === "FUTURE_BUDGET") return `$${i.amount ?? 0} future auction`;
  return "Waiver priority";
}

function teamNamesOf(t: TradeProposal): string[] {
  const seen = new Map<number, string>();
  for (const i of t.items) {
    if (i.sender) seen.set(i.senderId, i.sender.name);
    if (i.recipient) seen.set(i.recipientId, i.recipient.name);
  }
  if (t.proposer) seen.set(t.proposer.id, t.proposer.name);
  return [...seen.values()];
}

export default function TradesHomePage() {
  const { leagueId, myTeamId, myTeamResolved } = useLeague();
  const { toast } = useToast();
  const desktop = useMediaQuery("(min-width: 1024px)");

  const [trades, setTrades] = useState<TradeProposal[] | null>(null);
  const [win, setWin] = useState<TradeWindow | null>(null);
  const [failed, setFailed] = useState(false);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [pending, setPending] = useState<{ id: number; kind: Kind } | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const reload = useCallback(async () => {
    try {
      const res = await getTrades(leagueId);
      if (alive.current) { setTrades(res.trades); setFailed(false); }
    } catch {
      if (alive.current) setFailed(true);
    }
  }, [leagueId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    let live = true;
    getTradeWindow(leagueId).then((w) => live && setWin(w), () => { /* the server still decides */ });
    return () => { live = false; };
  }, [leagueId]);

  const draft = loadTradeDraft(leagueId);
  const hasDraft = !!draft && (draft.partnerId != null || draft.give.length > 0 || draft.get.length > 0 || draft.giveDollars > 0 || draft.getDollars > 0);

  const wrap: React.CSSProperties = { maxWidth: 1100, margin: "0 auto", padding: "8px 16px 24px", color: "var(--am-text)" };
  const header = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Trades</h1>
      <Link to="/trades/new" style={{ ...BTN_PRIMARY, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
        {hasDraft ? "Continue trade" : "+ New trade"}
      </Link>
    </div>
  );

  if (failed && !trades) {
    return <div style={wrap}>{header}<p style={{ fontSize: 17 }}>Couldn’t load trades. Try again in a moment.</p></div>;
  }
  if (!trades || !myTeamResolved) {
    return <div style={wrap}>{header}<p style={{ fontSize: 17, color: "var(--am-text-muted)" }}>Loading…</p></div>;
  }

  const me = myTeamId;
  const involves = (t: TradeProposal) =>
    me != null && (t.proposerId === me || t.items.some((i) => i.senderId === me || i.recipientId === me));
  const mine = trades.filter(involves);
  const byNewest = (a: TradeProposal, b: TradeProposal) => b.createdAt.localeCompare(a.createdAt);
  const offers = mine
    .filter((t) => t.status === "PROPOSED" && t.proposerId !== me)
    .sort(byNewest);
  const yours = mine
    .filter((t) => (t.status === "PROPOSED" && t.proposerId === me) || t.status === "ACCEPTED")
    .sort(byNewest);
  const done = mine.filter((t) => DONE_STATUSES.includes(t.status)).sort(byNewest).slice(0, DONE_LIMIT);

  const counterparty = (t: TradeProposal): string => {
    const other = t.items.map((i) => (i.senderId === me ? i.recipient : i.sender)).find((x) => x && x.id !== me);
    return other?.name ?? "another team";
  };

  async function run() {
    if (!pending || busy) return;
    const { id, kind } = pending;
    setBusy(true);
    setErrors((e) => { const { [id]: _drop, ...rest } = e; return rest; });
    try {
      if (kind === "accept") await acceptTrade(id);
      else if (kind === "reject") await rejectTrade(id);
      else await cancelTrade(id);
      toast(kind === "accept" ? "Trade accepted" : kind === "reject" ? "Trade rejected" : "Offer cancelled", "success");
    } catch (e) {
      setErrors((x) => ({ ...x, [id]: e instanceof Error ? e.message : "Something went wrong." }));
    } finally {
      setPending(null);
      setBusy(false);
      await reload();
    }
  }

  const lists = (t: TradeProposal) => {
    const get = t.items.filter((i) => i.recipientId === me).map(assetLabel);
    const give = t.items.filter((i) => i.senderId === me).map(assetLabel);
    return (
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
        {get.length > 0 && <span style={{ color: "var(--am-positive)" }}>{`You get: ${get.join(", ")}`}</span>}
        {get.length > 0 && give.length > 0 && <br />}
        {give.length > 0 && <span style={{ color: "var(--am-negative)" }}>{`You give: ${give.join(", ")}`}</span>}
      </p>
    );
  };
  const errorOn = (id: number) =>
    errors[id] ? <p role="alert" style={{ margin: 0, fontSize: 15, color: "var(--am-negative)" }}>{errors[id]}</p> : null;

  const offersSection = offers.length > 0 && (
    <section>
      <p style={CAP}>Offers to you</p>
      <div style={{ display: "grid", gap: 12 }}>
        {offers.map((t) => (
          <div key={t.id} data-testid={`trade-${t.id}`} style={BOX}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <b style={{ fontSize: 17 }}>{`From ${t.proposer?.name ?? counterparty(t)}`}</b>
              <span style={SMALL}>{fmtTime(t.createdAt)}</span>
            </div>
            {lists(t)}
            {win && !win.open && win.message && <p style={{ margin: 0, ...SMALL }}>{win.message}</p>}
            {errorOn(t.id)}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" style={{ ...BTN, flex: 1 }} onClick={() => setPending({ id: t.id, kind: "reject" })}>Reject</button>
              <button
                type="button" disabled={!!win && !win.open}
                style={{ ...BTN_PRIMARY, flex: 1, opacity: win && !win.open ? 0.5 : 1, cursor: win && !win.open ? "not-allowed" : "pointer" }}
                onClick={() => setPending({ id: t.id, kind: "accept" })}
              >
                Accept
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  const yoursSection = yours.length > 0 && (
    <section>
      <p style={CAP}>Your offers</p>
      <div style={{ display: "grid", gap: 8 }}>
        {yours.map((t) => (
          <div key={t.id} data-testid={`trade-${t.id}`} style={BOX}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <b style={{ fontSize: 17 }}>{t.proposerId === me ? `To ${counterparty(t)}` : `With ${counterparty(t)}`}</b>
              {t.status === "PROPOSED" ? (
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={CHIP}>Waiting</span>
                  <button type="button" style={BTN} onClick={() => setPending({ id: t.id, kind: "cancel" })}>Cancel</button>
                </span>
              ) : (
                <span style={{ ...CHIP, color: "var(--am-positive)" }}>Accepted</span>
              )}
            </div>
            {lists(t)}
            {t.status === "ACCEPTED" && <p style={{ margin: 0, ...SMALL }}>Accepted · with commissioner</p>}
            {errorOn(t.id)}
          </div>
        ))}
      </div>
    </section>
  );

  const doneSection = done.length > 0 && (
    <section>
      <p style={CAP}>Done this season</p>
      <div style={{ border: "1px solid var(--am-border)", borderRadius: 8, background: "var(--am-surface)" }}>
        {done.map((t) => (
          <div key={t.id} data-testid={`trade-${t.id}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, minHeight: 48, alignItems: "center", padding: "8px 16px", borderBottom: "1px solid var(--am-border)" }}>
            <span style={{ fontSize: 15 }}>{teamNamesOf(t).join(" ↔ ")}</span>
            <span style={SMALL}>{`${fmtDay(t.createdAt)} · ${t.status.toLowerCase()}`}</span>
          </div>
        ))}
      </div>
    </section>
  );

  const empty = !offersSection && !yoursSection && !doneSection;
  const pendingTrade = pending ? trades.find((t) => t.id === pending.id) : null;
  const sheet: Record<Kind, { title: string; confirm: string }> = {
    accept: { title: `Accept this trade from ${pendingTrade ? counterparty(pendingTrade) : ""}?`, confirm: "Accept trade" },
    reject: { title: `Reject this trade from ${pendingTrade ? counterparty(pendingTrade) : ""}?`, confirm: "Reject trade" },
    cancel: { title: `Cancel your offer to ${pendingTrade ? counterparty(pendingTrade) : ""}?`, confirm: "Cancel offer" },
  };
  const bodyText = (k: Kind) =>
    k === "accept" ? "It then waits for the commissioner to process it." : k === "reject" ? "The offer is sent back and can’t be undone." : "The offer is withdrawn.";

  return (
    <div style={wrap}>
      {header}
      {empty && <p style={{ fontSize: 17, color: "var(--am-text-muted)" }}>No trades yet.</p>}
      {desktop ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 24, alignItems: "start" }}>
          <div>{offersSection}</div>
          <div>{yoursSection}{doneSection}</div>
        </div>
      ) : (
        <>{offersSection}{yoursSection}{doneSection}</>
      )}
      <ConfirmSheet
        open={!!pending}
        title={pending ? sheet[pending.kind].title : ""}
        body={pending ? bodyText(pending.kind) : ""}
        confirmLabel={pending ? sheet[pending.kind].confirm : ""}
        busy={busy}
        onConfirm={run}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
