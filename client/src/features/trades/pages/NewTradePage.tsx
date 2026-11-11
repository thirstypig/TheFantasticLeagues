// Screen 16: New trade (/trades/new). Pick a team, tick what each side gives,
// optionally add auction dollars, see the roster check, send. Outside the trade
// window the draft stays in the browser and the button is disabled.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useLeague } from "../../../contexts/LeagueContext";
import { useToast } from "../../../contexts/ToastContext";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import { ConfirmSheet } from "../../../components/shared/ConfirmSheet";
import { PlayerFace } from "../../../components/shared/PlayerFace";
import type { LeagueTeam, TeamDetailResponse } from "../../../api/types";
import { getTradeLeagueTeams, getTradeTeamRoster, getTradeWindow, proposeTrade } from "../api";
import type { TradeWindow } from "../api";
import { checkTrade } from "../lib/tradeCheck";
import { clearTradeDraft, loadTradeDraft, saveTradeDraft } from "../lib/tradeDraft";
import type { TradeDraft } from "../lib/tradeDraft";

type RosterRow = TeamDetailResponse["currentRoster"][number];
type Roster = { id: number; name: string; budget: number; rows: RosterRow[] };

const isIL = (r: RosterRow) => r.assignedPosition === "IL";

function toRoster(res: TeamDetailResponse): Roster {
  return { id: res.team.id, name: res.team.name, budget: res.team.budget ?? 0, rows: res.currentRoster ?? [] };
}

const CAP: React.CSSProperties = {
  margin: "16px 0 8px", fontSize: 13, fontWeight: 700, letterSpacing: "0.06em",
  textTransform: "uppercase", color: "var(--am-text-faint)",
};
const BOX: React.CSSProperties = {
  border: "1px solid var(--am-border)", borderRadius: 8, background: "var(--am-surface)", overflow: "hidden",
};
const PRIMARY: React.CSSProperties = {
  minHeight: 48, width: "100%", padding: "0 16px", borderRadius: 6, fontSize: 17, fontWeight: 600,
  border: "1px solid var(--am-accent)", background: "var(--am-accent)", color: "var(--am-on-accent)",
  cursor: "pointer", fontFamily: "inherit",
};
const LINK: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", minHeight: 44, fontSize: 15, color: "var(--am-accent)", textDecoration: "none",
};
const TONE: Record<"good" | "bad" | "note", string> = {
  good: "var(--am-positive)", bad: "var(--am-negative)", note: "var(--am-text-muted)",
};

function PlayerList({ rows, ticked, onToggle }: { rows: RosterRow[]; ticked: number[]; onToggle: (id: number) => void }) {
  return (
    <div style={BOX}>
      {rows.map((r) => {
        const il = isIL(r);
        const on = ticked.includes(r.playerId);
        return (
          <label
            key={r.playerId}
            style={{
              display: "flex", alignItems: "center", gap: 12, minHeight: 56, padding: "8px 16px",
              borderBottom: "1px solid var(--am-border)", color: "var(--am-text)",
              opacity: il ? 0.55 : 1, cursor: il ? "not-allowed" : "pointer",
              background: on ? "color-mix(in srgb, var(--am-accent) 10%, var(--am-surface))" : "transparent",
            }}
          >
            <input
              type="checkbox"
              checked={on}
              disabled={il}
              onChange={() => onToggle(r.playerId)}
              style={{ width: 22, height: 22, accentColor: "var(--am-accent)", flexShrink: 0 }}
            />
            <PlayerFace mlbId={r.mlbId} name={r.name} size={40} />
            <span style={{ display: "grid", minWidth: 0, flex: 1 }}>
              <b style={{ fontSize: 17, fontWeight: 600 }}>{r.name}</b>
              <small style={{ fontSize: 13, color: "var(--am-text-muted)" }}>{`${r.posPrimary} · ${r.mlbTeam ?? "FA"}`}</small>
            </span>
            {il && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text-muted)" }}>On IL</span>}
          </label>
        );
      })}
    </div>
  );
}

function NewTradePage() {
  const { leagueId, myTeamId, myTeamResolved } = useLeague();
  const navigate = useNavigate();
  const { toast } = useToast();
  const desktop = useMediaQuery("(min-width: 1024px)");

  const [teams, setTeams] = useState<LeagueTeam[] | null>(null);
  const [win, setWin] = useState<TradeWindow | null>(null);
  const [mine, setMine] = useState<Roster | null>(null);
  const [theirs, setTheirs] = useState<Roster | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [partnerFailed, setPartnerFailed] = useState<number | null>(null);

  // `?team=<teamId>&get=<playerId>` (the Players table's Trade link) beats a restored
  // browser draft for the partner and the "you get" list. Read once, on mount.
  const [searchParams] = useSearchParams();
  const queryTeam = Number(searchParams.get("team"));
  const queryGet = Number(searchParams.get("get"));
  const fromQuery = Number.isInteger(queryTeam) && queryTeam > 0;
  const pendingGet = useRef<number | null>(fromQuery && Number.isInteger(queryGet) && queryGet > 0 ? queryGet : null);

  const [draft, setDraft] = useState<TradeDraft>(() => {
    const base = loadTradeDraft(leagueId) ?? { leagueId, partnerId: null, give: [], get: [], giveDollars: 0, getDollars: 0 };
    if (!fromQuery) return base;
    return base.partnerId === queryTeam
      ? { ...base, get: [] }
      : { ...base, partnerId: queryTeam, get: [], getDollars: 0 };
  });
  const draftRef = useRef(draft);
  const [showDollars, setShowDollars] = useState(draft.giveDollars > 0 || draft.getDollars > 0);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  /** Every change goes through here so state and storage never drift. */
  function update(patch: Partial<TradeDraft>) {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    saveTradeDraft(next);
  }

  useEffect(() => {
    let live = true;
    getTradeLeagueTeams(leagueId).then((t) => live && setTeams(t), () => live && setLoadError(true));
    getTradeWindow(leagueId).then((w) => live && setWin(w), () => live && setLoadError(true));
    return () => { live = false; };
  }, [leagueId]);

  useEffect(() => {
    if (myTeamId == null) return;
    let live = true;
    getTradeTeamRoster(myTeamId).then((r) => live && setMine(toRoster(r)), () => live && setLoadError(true));
    return () => { live = false; };
  }, [myTeamId]);

  const partnerId = draft.partnerId;
  const partners = useMemo(
    () => (teams ?? []).filter((t) => t.id !== myTeamId).sort((a, b) => a.name.localeCompare(b.name)),
    [teams, myTeamId],
  );

  // Only fetch a partner the league actually lists; a restored draft may name a team that is gone.
  const partnerValid = partnerId != null && partners.some((t) => t.id === partnerId);
  useEffect(() => {
    setTheirs(null);
    setPartnerFailed(null);
    if (partnerId == null || !partnerValid) return;
    let live = true;
    getTradeTeamRoster(partnerId).then(
      (r) => live && setTheirs(toRoster(r)),
      () => live && setPartnerFailed(partnerId),
    );
    return () => { live = false; };
  }, [partnerId, partnerValid]);

  // A restored draft: forget a partner that no longer exists, and anything no longer on the rosters.
  useEffect(() => {
    if (!teams) return;
    const d = draftRef.current;
    if (d.partnerId != null && !partners.some((t) => t.id === d.partnerId)) {
      update({ partnerId: null, give: [], get: [], giveDollars: 0, getDollars: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams]);
  useEffect(() => {
    if (!mine || !theirs) return;
    const d = draftRef.current;
    const give = d.give.filter((id) => mine.rows.some((r) => r.playerId === id && !isIL(r)));
    let get = d.get.filter((id) => theirs.rows.some((r) => r.playerId === id && !isIL(r)));
    // Tick the player the Trade link named, once the partner's roster is in (never an IL player).
    const want = pendingGet.current;
    if (want != null && theirs.id === d.partnerId) {
      pendingGet.current = null;
      if (theirs.rows.some((r) => r.playerId === want && !isIL(r)) && !get.includes(want)) get = [...get, want];
    }
    const whole = (n: number, budget: number) => Math.min(budget, Math.max(0, Math.floor(n) || 0));
    const giveDollars = whole(d.giveDollars, mine.budget);
    const getDollars = whole(d.getDollars, theirs.budget);
    if (give.length !== d.give.length || get.length !== d.get.length || giveDollars !== d.giveDollars || getDollars !== d.getDollars) {
      update({ give, get, giveDollars, getDollars });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, theirs]);

  const backLink = <Link to="/trades" style={LINK}>‹ Trades</Link>;
  const wrap: React.CSSProperties = { maxWidth: 1100, margin: "0 auto", padding: "8px 16px 24px", color: "var(--am-text)" };

  if (loadError) {
    return <div style={wrap}>{backLink}<p style={{ fontSize: 17 }}>Couldn’t load the trade screen. Try again in a moment.</p></div>;
  }
  if (myTeamId == null && myTeamResolved && teams) {
    return <div style={wrap}>{backLink}<p style={{ fontSize: 17 }}>You need a team in this league to propose a trade.</p></div>;
  }
  if (!teams || !win || !mine) {
    return <div style={wrap}>{backLink}<p style={{ fontSize: 17, color: "var(--am-text-muted)" }}>Loading…</p></div>;
  }

  const partner = partners.find((t) => t.id === partnerId) ?? null;
  const partnerName = partner?.name ?? "";
  const ready = !!partner && !!theirs && theirs.id === partnerId;

  const giveTicked = draft.give;
  const getTicked = draft.get;
  const activeCount = (r: Roster) => r.rows.filter((x) => !isIL(x)).length;
  const check = ready
    ? checkTrade({
        mineActive: activeCount(mine), theirsActive: activeCount(theirs!),
        give: giveTicked.length, get: getTicked.length, cap: win.rosterCap,
        myName: mine.name, theirName: partnerName,
      })
    : { ok: false, lines: [] };
  const nothingTicked = giveTicked.length === 0 && getTicked.length === 0;

  function toggle(side: "give" | "get", id: number) {
    const roster = side === "give" ? mine : theirs;
    if (roster?.rows.some((r) => r.playerId === id && isIL(r))) return; // IL players are never tradeable here
    const cur = draftRef.current[side];
    update({ [side]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] } as Partial<TradeDraft>);
  }

  function choosePartner(id: number) {
    if (id === draftRef.current.partnerId) return;
    setSendError(null);
    update({ partnerId: id, get: [], getDollars: 0 });
  }

  function setDollars(side: "give" | "get", raw: string, budget: number) {
    const n = Math.min(budget, Math.max(0, Math.floor(Number(raw) || 0)));
    update(side === "give" ? { giveDollars: n } : { getDollars: n });
  }

  let label: string;
  let canSend = false;
  if (!ready || nothingTicked) label = "Review trade";
  else if (!win.open) label = "Trades open at the next meeting";
  else { label = `Send to ${partnerName}`; canSend = check.ok; }

  const names = (rows: RosterRow[], ids: number[]) =>
    ids.map((id) => rows.find((r) => r.playerId === id)?.name).filter(Boolean).join(", ");
  function summaryText(): string {
    const give = [names(mine!.rows, giveTicked), draft.giveDollars > 0 ? `$${draft.giveDollars}` : ""].filter(Boolean).join(" + ");
    const get = [names(theirs!.rows, getTicked), draft.getDollars > 0 ? `$${draft.getDollars}` : ""].filter(Boolean).join(" + ");
    return `You give ${give || "nothing"} and get ${get || "nothing"}.`;
  }

  async function send() {
    if (!partner || busy) return;
    const items: Parameters<typeof proposeTrade>[0]["items"] = [
      ...giveTicked.map((playerId) => ({ senderId: myTeamId!, recipientId: partner.id, assetType: "PLAYER" as const, playerId })),
      ...getTicked.map((playerId) => ({ senderId: partner.id, recipientId: myTeamId!, assetType: "PLAYER" as const, playerId })),
    ];
    if (draft.giveDollars > 0) items.push({ senderId: myTeamId!, recipientId: partner.id, assetType: "BUDGET", amount: draft.giveDollars });
    if (draft.getDollars > 0) items.push({ senderId: partner.id, recipientId: myTeamId!, assetType: "BUDGET", amount: draft.getDollars });
    setBusy(true);
    setSendError(null);
    try {
      await proposeTrade({ leagueId, proposerTeamId: myTeamId!, items });
      toast(`Trade sent to ${partnerName}`, "success");
      clearTradeDraft(leagueId);
      navigate("/trades");
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Couldn’t send the trade.");
      setConfirming(false);
      setBusy(false);
    }
  }

  const banner = !win.open && (
    <div style={{ ...BOX, padding: "10px 16px", margin: "8px 0", fontSize: 15, background: "color-mix(in srgb, var(--am-warning) 14%, var(--am-surface))" }}>
      {win.message ? `${win.message} ` : ""}You can build one now and send it then.
    </div>
  );

  const pills = (
    <div style={{ display: "flex", gap: 8, flexWrap: desktop ? "wrap" : "nowrap", overflowX: desktop ? "visible" : "auto", paddingBottom: 4 }}>
      {partners.map((t) => {
        const on = t.id === partnerId;
        return (
          <button
            key={t.id}
            type="button"
            data-testid="partner-pill"
            aria-pressed={on}
            onClick={() => choosePartner(t.id)}
            style={{
              minHeight: 44, padding: "0 16px", borderRadius: 22, fontSize: 15, fontWeight: 600, whiteSpace: "nowrap",
              cursor: "pointer", fontFamily: "inherit",
              border: `1px solid ${on ? "var(--am-accent)" : "var(--am-border-strong)"}`,
              background: on ? "var(--am-accent)" : "transparent",
              color: on ? "var(--am-on-accent)" : "var(--am-text)",
            }}
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );

  const field: React.CSSProperties = {
    minHeight: 44, width: 96, padding: "0 10px", borderRadius: 6, fontSize: 17, fontFamily: "inherit",
    background: "var(--am-field)", color: "var(--am-text)", border: "1px solid var(--am-field-line)",
  };
  const dollars = ready && (showDollars ? (
    <div style={{ display: "grid", gap: 8, margin: "12px 0" }}>
      {([
        ["give", "You give $", draft.giveDollars, mine.budget],
        ["get", "You get $", draft.getDollars, theirs!.budget],
      ] as const).map(([side, text, value, budget]) => (
        <label key={side} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15 }}>
          <span style={{ flex: 1 }}>{text}</span>
          <input
            type="number" inputMode="numeric" min={0} max={budget} aria-label={text} value={value}
            onChange={(e) => setDollars(side, e.target.value, budget)} style={field}
          />
          <span style={{ fontSize: 13, color: "var(--am-text-muted)", minWidth: 56 }}>{`of $${budget}`}</span>
        </label>
      ))}
    </div>
  ) : (
    <button
      type="button" onClick={() => setShowDollars(true)}
      style={{ minHeight: 44, margin: "12px 0", padding: "0 4px", background: "transparent", border: 0, fontSize: 15, fontWeight: 600, color: "var(--am-accent)", cursor: "pointer", fontFamily: "inherit" }}
    >
      + Add auction dollars
    </button>
  ));

  const checkLines = check.lines.length > 0 && (
    <div style={{ display: "grid", gap: 4, margin: "8px 0" }}>
      {check.lines.map((l) => (
        <p key={l.text} style={{ margin: 0, fontSize: 15, color: TONE[l.tone] }}>{l.tone === "good" ? `✓ ${l.text}` : l.text}</p>
      ))}
    </div>
  );

  const errorBox = sendError && (
    <p role="alert" style={{ margin: "8px 0", fontSize: 15, color: "var(--am-negative)" }}>{sendError}</p>
  );

  const button = (
    <button
      type="button"
      disabled={!canSend}
      onClick={() => setConfirming(true)}
      style={{ ...PRIMARY, opacity: canSend ? 1 : 0.5, cursor: canSend ? "pointer" : "not-allowed" }}
    >
      {label}
    </button>
  );

  const giveList = ready && (
    <div>
      <p style={CAP}>{`You give · ${mine.name}`}</p>
      <PlayerList rows={mine.rows} ticked={giveTicked} onToggle={(id) => toggle("give", id)} />
    </div>
  );
  const getList = ready && (
    <div>
      <p style={CAP}>{`You get · ${partnerName}`}</p>
      <PlayerList rows={theirs!.rows} ticked={getTicked} onToggle={(id) => toggle("get", id)} />
    </div>
  );

  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {backLink}
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>New trade</h1>
      </div>
      {banner}
      <p style={CAP}>Trade with</p>
      {pills}

      {ready && desktop && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) 320px", gap: 16, alignItems: "start" }}>
          {giveList}
          {getList}
          <aside style={{ ...BOX, padding: 16, marginTop: 16, position: "sticky", top: 16 }}>
            <b style={{ fontSize: 17 }}>Summary</b>
            {!nothingTicked && <p style={{ margin: "8px 0 0", fontSize: 15 }}>{summaryText()}</p>}
            {dollars}
            {checkLines}
            {errorBox}
            {button}
          </aside>
        </div>
      )}

      {ready && !desktop && (
        <>
          {giveList}
          {getList}
          {dollars}
          {checkLines}
          {errorBox}
          <div style={{ position: "sticky", bottom: 0, padding: "12px 0 calc(12px + env(safe-area-inset-bottom, 0px))", background: "var(--am-bg, var(--am-surface))" }}>
            {button}
          </div>
        </>
      )}

      {!ready && (
        <div style={{ marginTop: 16 }}>
          {partnerFailed != null && partnerFailed === partnerId ? (
            <p role="alert" style={{ fontSize: 15, color: "var(--am-negative)" }}>{`Couldn’t load ${partnerName}’s roster. Pick another team or try again.`}</p>
          ) : (
            partnerValid && <p style={{ fontSize: 15, color: "var(--am-text-muted)" }}>Loading…</p>
          )}
          {button}
        </div>
      )}

      <ConfirmSheet
        open={confirming}
        title={`Send this trade to ${partnerName}?`}
        body={ready ? summaryText() : ""}
        confirmLabel="Send trade"
        busy={busy}
        onConfirm={send}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

export default NewTradePage;
