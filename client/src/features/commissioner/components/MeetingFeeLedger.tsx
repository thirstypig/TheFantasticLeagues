import React, { useCallback, useEffect, useState } from "react";
import type { LedgerEntryRow } from "@shared/api/commissioner";
import { ConfirmSheet } from "../../../components/shared/ConfirmSheet";
import { ApiError } from "../../../api/base";
import { getMeetingFees, voidLedgerEntry } from "../api";
import { CardError, SECONDARY } from "./cardParts";

/**
 * Money page: the live meeting's overtime fees, with a Void button per fee
 * that still stands (todo #315). Hidden while a league has no meeting fees.
 *
 * A void never deletes anything: the server marks the fee voided and adds a
 * matching credit, so the team's balance drops by the fee and the record keeps
 * both rows. `onVoided` lets the page reload its balances.
 */
export function MeetingFeeLedger({ leagueId, onVoided }: { leagueId: number; onVoided?: () => void }) {
  const [entries, setEntries] = useState<LedgerEntryRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState<LedgerEntryRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  const load = useCallback(() => {
    let live = true;
    getMeetingFees(leagueId).then(
      (rows) => { if (live) { setEntries(rows); setLoadFailed(false); } },
      () => { if (live) setLoadFailed(true); },
    );
    return () => { live = false; };
  }, [leagueId]);

  useEffect(() => load(), [load]);

  async function confirmVoid() {
    if (!pending) return;
    setBusy(true);
    setVoidError(null);
    try {
      await voidLedgerEntry(leagueId, pending.id);
      onVoided?.();
    } catch (err) {
      setVoidError((err instanceof ApiError && err.serverMessage) || "Couldn’t void the fee. Try again.");
    } finally {
      // Reload either way: a 409 means someone else voided it, so the row
      // should now read Voided rather than offer the button again.
      setBusy(false);
      setPending(null);
      load();
    }
  }

  if (loadFailed) return <div style={CARD}><CardError>Couldn’t load meeting fees.</CardError></div>;
  if (entries === null || entries.length === 0) return null;

  return (
    <div style={CARD}>
      <div style={{ padding: "12px 16px 4px" }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--am-text)" }}>Meeting fees</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--am-text-muted)" }}>
          Voiding a fee gives the team a matching credit. The fee stays in the record, marked voided.
        </p>
        {voidError && (
          <p role="alert" style={{ margin: "8px 0 0", fontSize: 13, color: "var(--am-negative)" }}>{voidError}</p>
        )}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={TH}>Team</th>
            <th style={{ ...TH, textAlign: "right" }}>Fee</th>
            <th style={{ ...TH, textAlign: "right" }}><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const voided = e.voidedAt !== null;
            return (
              <tr key={e.id} style={{ borderTop: "1px solid var(--am-border)" }}>
                <td style={{ height: 56, padding: "6px 16px" }}>
                  <div style={{ fontSize: 17, fontWeight: 600, color: "var(--am-text)" }}>{e.teamName}</div>
                  <div style={{ fontSize: 13, color: "var(--am-text-muted)" }}>
                    {[e.periodName, formatDate(e.ts)].filter(Boolean).join(" · ")}
                  </div>
                </td>
                <td
                  style={{
                    padding: "0 8px", textAlign: "right", fontSize: 17, fontVariantNumeric: "tabular-nums",
                    color: voided ? "var(--am-text-muted)" : "var(--am-text)",
                    textDecoration: voided ? "line-through" : undefined,
                  }}
                >
                  ${e.amount}
                </td>
                <td style={{ padding: "0 16px 0 8px", textAlign: "right", width: 1, whiteSpace: "nowrap" }}>
                  {voided ? (
                    <span style={{ fontSize: 13, color: "var(--am-text-muted)" }}>Voided</span>
                  ) : (
                    <button
                      type="button"
                      style={{ ...SECONDARY, width: "auto", minHeight: 44, minWidth: 64 }}
                      onClick={() => { setVoidError(null); setPending(e); }}
                      aria-label={`Void ${possessive(e.teamName)} $${e.amount} fee`}
                    >
                      Void
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ConfirmSheet
        open={pending !== null}
        title={pending ? `Void ${possessive(pending.teamName)} $${pending.amount} fee?` : ""}
        body={pending ? `${pending.teamName} gets a $${pending.amount} credit. The fee stays in the record, marked voided. This can't be undone.` : ""}
        confirmLabel="Void fee"
        busy={busy}
        onConfirm={() => void confirmVoid()}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

const CARD: React.CSSProperties = { background: "var(--am-surface)", border: "1px solid var(--am-border)", borderRadius: 6, overflow: "hidden" };
const TH: React.CSSProperties = { textAlign: "left", fontSize: 13, fontWeight: 600, color: "var(--am-text-muted)", padding: "8px 16px" };

/** "Alpha" → "Alpha's", "Dodger Dawgs" → "Dodger Dawgs'". */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
