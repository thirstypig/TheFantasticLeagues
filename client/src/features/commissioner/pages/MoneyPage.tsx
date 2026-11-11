// Money (Style Bible screen 3): prize pool, who owes what, and the IL-fee billing
// that is due. The app records each team's NET balance only (positive = owes), so
// this page never shows a "paid" figure. Entry fee edit is the one write here.
import React, { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../../api/base";
import { useToast } from "../../../contexts/ToastContext";
import { CardError, LINK, PRIMARY, SECONDARY, Skeleton, useLoad } from "../components/cardParts";
import { getCommissionerOverview, getLeagueBalances, getLeaguePeriods, getUnbilledPeriods, updateLeague } from "../api";
import { CommissionerOnly } from "../components/CommissionerOnly";
import "../commissioner.css";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

const CARD: React.CSSProperties = { background: "var(--am-surface)", border: "1px solid var(--am-border)", borderRadius: 6, overflow: "hidden" };
const FIELD: React.CSSProperties = {
  display: "block", width: "100%", boxSizing: "border-box", minHeight: 44, padding: "0 12px",
  fontSize: 17, fontFamily: "inherit", color: "var(--am-text)", background: "var(--am-field)",
  border: "1px solid var(--am-field-line)", borderRadius: 6,
};
const LABEL: React.CSSProperties = { display: "block", fontSize: 13, color: "var(--am-text-muted)", marginBottom: 4 };
const ACTION: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 44, padding: "0 12px",
  fontSize: 17, color: "var(--am-accent)", background: "transparent", border: 0, cursor: "pointer",
};
const STAT_LABEL: React.CSSProperties = { fontSize: 13, color: "var(--am-text-muted)" };
const STAT_VALUE: React.CSSProperties = { fontSize: 32, fontWeight: 700, color: "var(--am-text)", lineHeight: 1.1 };
const STAT_SUB: React.CSSProperties = { fontSize: 13, color: "var(--am-text-muted)" };

function Chip({ label, tone }: { label: string; tone: "alert" | "good" | "plain" }) {
  const color = tone === "alert" ? "var(--am-negative)" : tone === "good" ? "var(--am-positive)" : "var(--am-text-muted)";
  return (
    <span style={{ flex: "none", fontSize: 13, fontWeight: 600, padding: "2px 8px", borderRadius: 10, border: `1px solid ${color}`, color }}>
      {label}
    </span>
  );
}

function balanceChip(balance: number) {
  if (balance > 0) return <Chip label={`Owes ${usd(balance)}`} tone="alert" />;
  if (balance < 0) return <Chip label={`Credit ${usd(-balance)}`} tone="plain" />;
  return <Chip label="Paid up" tone="good" />;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.serverMessage || err.detail || err.message;
  return err instanceof Error && err.message ? err.message : fallback;
}

type Fee = { entryFee: number | null; entryFeeNote: string | null };

function EntryFeeRow({ leagueId, fee, onSaved }: { leagueId: number; fee: Fee; onSaved: (f: Fee) => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const isSet = !!fee.entryFee && fee.entryFee > 0;

  function open() {
    setAmount(fee.entryFee != null ? String(fee.entryFee) : "");
    setNote(fee.entryFeeNote ?? "");
    setError(null);
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    const trimmed = amount.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 10000)) {
      setError("Enter an amount from $0 to $10,000.");
      return;
    }
    const entryFeeNote = note.trim() === "" ? null : note.trim();
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      await updateLeague(leagueId, { entryFee: value, entryFeeNote });
      onSaved({ entryFee: value, entryFeeNote });
      setEditing(false);
      toast("Entry fee saved", "success");
    } catch (err) {
      setError(errorMessage(err, "Couldn’t save the entry fee."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <div style={{ ...CARD, padding: "8px 16px", minHeight: 56 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 17, color: "var(--am-text)" }}>
            {isSet ? `Entry fee ${usd(fee.entryFee as number)} per team` : "Entry fee not set"}
          </span>
          {isSet && fee.entryFeeNote && <span style={{ display: "block", fontSize: 13, color: "var(--am-text-muted)" }}>{fee.entryFeeNote}</span>}
        </span>
        {!editing && <button type="button" style={ACTION} aria-label="Edit entry fee" onClick={open}>Edit</button>}
      </div>
      {editing && (
        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
          <label>
            <span style={LABEL}>Entry fee ($)</span>
            <input style={FIELD} type="number" inputMode="decimal" min={0} max={10000} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            <span style={LABEL}>Note</span>
            <input style={FIELD} type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {error && <div role="alert" style={{ fontSize: 13, color: "var(--am-negative)" }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={PRIMARY} disabled={saving}>Save</button>
            <button type="button" style={SECONDARY} disabled={saving} onClick={() => { setEditing(false); setError(null); }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

function MoneyPageBody() {
  const leagueId = Number(useParams().leagueId);
  const base = `/commissioner/${leagueId}`;
  const overview = useLoad(() => getCommissionerOverview(leagueId), [leagueId]);
  const balances = useLoad(() => getLeagueBalances(leagueId), [leagueId]);
  const unbilled = useLoad(() => getUnbilledPeriods(leagueId), [leagueId]);
  const periods = useLoad(() => getLeaguePeriods(leagueId), [leagueId]);
  const [savedFee, setSavedFee] = useState<Fee | null>(null);

  const back = <Link to={base} style={LINK}>‹ Commissioner</Link>;
  const title = <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 700, color: "var(--am-text)" }}>Money</h1>;

  const fee: Fee | null = savedFee ?? (overview.state === "ready"
    ? { entryFee: overview.data.league.entryFee ?? null, entryFeeNote: overview.data.league.entryFeeNote ?? null }
    : null);
  const teamCount = overview.state === "ready" ? (overview.data.teams?.length ?? 0) : 0;
  const feeIsSet = !!fee && !!fee.entryFee && fee.entryFee > 0;

  const rows = balances.state === "ready" ? [...balances.data].sort((a, b) => b.balance - a.balance) : [];
  const owing = rows.filter((r) => r.balance > 0);
  const owedTotal = owing.reduce((sum, r) => sum + r.balance, 0);

  const periodName = (id: number) => (periods.state === "ready" ? periods.data.find((p) => p.id === id)?.name : undefined) ?? `period ${id}`;

  return (
    <div style={{ padding: "0 16px 32px", maxWidth: 1100, margin: "0 auto" }}>
      {back}
      {title}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ ...CARD, padding: 16, display: "flex", gap: 32, flexWrap: "wrap" }}>
          {overview.state === "loading" || balances.state === "loading" ? (
            <Skeleton />
          ) : (
            <>
              {feeIsSet && fee && (
                <div>
                  <div style={STAT_LABEL}>Prize pool</div>
                  <div data-testid="prize-pool" style={STAT_VALUE}>{usd((fee.entryFee as number) * teamCount)}</div>
                  <div style={STAT_SUB}>{`${teamCount} × ${usd(fee.entryFee as number)}`}</div>
                </div>
              )}
              {balances.state === "ready" && (
                <div>
                  <div style={STAT_LABEL}>Owed</div>
                  <div data-testid="owed-total" style={STAT_VALUE}>{usd(owedTotal)}</div>
                  <div style={STAT_SUB}>{`by ${owing.length} ${owing.length === 1 ? "team" : "teams"}`}</div>
                </div>
              )}
              {overview.state === "error" && <CardError>Couldn’t load the league.</CardError>}
              {balances.state === "error" && <CardError>Couldn’t load balances.</CardError>}
            </>
          )}
        </div>

        {unbilled.state === "ready" && unbilled.data.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {unbilled.data.map((u) => (
              <Link key={u.periodId} to={`${base}/bill/${u.periodId}`} style={{ ...PRIMARY, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", textDecoration: "none" }}>
                {`Bill IL fees for ${periodName(u.periodId)}`}
              </Link>
            ))}
          </div>
        )}

        <div style={CARD}>
          {balances.state === "loading" && <Skeleton />}
          {balances.state === "error" && <CardError>Couldn’t load balances.</CardError>}
          {balances.state === "ready" && rows.length === 0 && (
            <p style={{ margin: 0, padding: 16, fontSize: 17, color: "var(--am-text-muted)" }}>No teams in this league yet.</p>
          )}
          {balances.state === "ready" && rows.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", fontSize: 13, fontWeight: 600, color: "var(--am-text-muted)", padding: "8px 16px" }}>Team</th>
                  <th style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: "var(--am-text-muted)", padding: "8px 16px" }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.teamId} style={{ borderTop: "1px solid var(--am-border)", minHeight: 56 }}>
                    <td data-testid="team-name" style={{ height: 56, padding: "0 16px", fontSize: 17, fontWeight: 600, color: "var(--am-text)" }}>{r.teamName}</td>
                    <td style={{ height: 56, padding: "0 16px", textAlign: "right" }}>{balanceChip(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {fee && <EntryFeeRow leagueId={leagueId} fee={fee} onSaved={setSavedFee} />}

        <Link to="/payouts" style={LINK}>Payouts ›</Link>
      </div>
    </div>
  );
}

export default function MoneyPage() {
  const leagueId = Number(useParams().leagueId);
  return <CommissionerOnly leagueId={leagueId}><MoneyPageBody /></CommissionerOnly>;
}
