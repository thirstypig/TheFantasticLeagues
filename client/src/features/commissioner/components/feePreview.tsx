// IL fee dry-run preview shared by the close flow (step 4/5) and the bill page.
// The amounts come only from the server's reconcile dry run — never a second
// fee calculation here; this file only sums the preview rows per team.
import React from "react";
import { getRosterCheck, previewIlFees, type IlFeeReconcileResult } from "../api";
import { MUTED, ROW, useLoad } from "./cardParts";

/** Unsigned dollar amount: "$10" for 10 or -10. */
export function dollars(n: number): string {
  const abs = Math.abs(n);
  return `$${Number.isInteger(abs) ? String(abs) : abs.toFixed(2)}`;
}

/** "$40", or "$10 credit" for a negative net (never a minus sign). */
export function money(n: number): string {
  return n < 0 ? `${dollars(n)} credit` : dollars(n);
}

export const NO_FEES = "No IL fees to bill";

/**
 * Headline for a preview total: "<billPrefix> $40", "No IL fees to bill",
 * or "IL fees net to a $10 credit".
 */
export function feeHeadline(total: number, billPrefix: string): string {
  if (total > 0) return `${billPrefix} ${dollars(total)}`;
  if (total === 0) return NO_FEES;
  return `IL fees net to a ${money(total)}`;
}

export interface FeeTotals {
  teams: Array<{ teamId: number; amount: number; players: string[] }>;
  total: number;
}

/** Per-team net of the dry-run preview: adds are positive, voids negative. */
export function feeTotals(result: IlFeeReconcileResult): FeeTotals {
  const byTeam = new Map<number, { amount: number; players: string[] }>();
  for (const row of result.preview ?? []) {
    const t = byTeam.get(row.teamId) ?? { amount: 0, players: [] };
    t.amount += row.amount;
    if (row.action === "add" && row.playerName) t.players.push(row.playerName);
    byTeam.set(row.teamId, t);
  }
  const teams = [...byTeam.entries()]
    .map(([teamId, t]) => ({ teamId, ...t }))
    .sort((a, b) => b.amount - a.amount || a.teamId - b.teamId);
  const total = teams.reduce((sum, t) => sum + t.amount, 0);
  return { teams, total };
}

export type FeePreview = FeeTotals & { names: Map<number, string> };

export function useFeePreview(leagueId: number, periodId: number) {
  return useLoad<FeePreview>(async () => {
    const [fees, roster] = await Promise.all([
      previewIlFees(leagueId, periodId),
      // Team names only; a failure here falls back to "Team <id>".
      getRosterCheck(leagueId).catch(() => null),
    ]);
    const names = new Map((roster?.teams ?? []).map((t) => [t.teamId, t.teamName]));
    return { ...feeTotals(fees), names };
  }, [leagueId, periodId]);
}

/** Headline row plus one row per team. Render inside a Glass card. */
export function FeePreviewRows({ preview, headline }: { preview: FeePreview; headline: string }) {
  return (
    <>
      <div style={{ ...ROW, fontWeight: 700 }}>{headline}</div>
      {preview.teams.map((t) => (
        <div key={t.teamId} data-testid={`fee-team-${t.teamId}`} style={ROW}>
          <span>
            <span>{preview.names.get(t.teamId) ?? `Team ${t.teamId}`}</span>
            {t.players.length > 0 && <span style={{ ...MUTED, display: "block" }}>{t.players.join(", ")}</span>}
          </span>
          <span>{money(t.amount)}</span>
        </div>
      ))}
    </>
  );
}
