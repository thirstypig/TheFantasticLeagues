// IL fee dry-run preview shared by the close flow (step 4/5) and the bill page.
// The amounts come only from the server's reconcile dry run — never a second
// fee calculation here; this file only sums the preview rows per team.
import React from "react";
import { getRosterCheck, previewIlFees, type IlFeeReconcileResult } from "../api";
import { MUTED, ROW, useLoad } from "./cardParts";

export function money(n: number): string {
  const abs = Math.abs(n);
  const s = Number.isInteger(abs) ? String(abs) : abs.toFixed(2);
  return n < 0 ? `-$${s}` : `$${s}`;
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
      {preview.teams.length === 0 && <p style={{ ...ROW, margin: 0, ...MUTED }}>No IL fees for this period.</p>}
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
