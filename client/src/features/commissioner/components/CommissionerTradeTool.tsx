import { useState, useCallback } from "react";
import { TradeAssetSelector } from "../../trades/components/TradeAssetSelector";
import { executeCommissionerTrade, type ExecuteTradeItem } from "../api";

type Asset = {
  assetType: "PLAYER" | "BUDGET" | "PICK";
  playerId?: number;
  amount?: number;
  label: string;
};

interface Props {
  leagueId: number;
  teams: Array<{ id: number; name: string; code?: string | null }>;
}

export default function CommissionerTradeTool({ leagueId, teams }: Props) {
  const [teamAId, setTeamAId] = useState<number | "">(teams[0]?.id ?? "");
  const [teamBId, setTeamBId] = useState<number | "">(teams[1]?.id ?? "");
  const [assetsA, setAssetsA] = useState<Asset[]>([]);
  const [assetsB, setAssetsB] = useState<Asset[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const teamA = teams.find((t) => t.id === teamAId);
  const teamB = teams.find((t) => t.id === teamBId);

  const onAssetsAChange = useCallback((a: Asset[]) => setAssetsA(a), []);
  const onAssetsBChange = useCallback((a: Asset[]) => setAssetsB(a), []);

  const hasAssets = assetsA.length > 0 || assetsB.length > 0;
  const canExecute = teamAId && teamBId && teamAId !== teamBId && hasAssets;

  async function onExecute() {
    if (!canExecute || !teamAId || !teamBId) return;
    setConfirmOpen(false);
    setBusy(true);
    setResult(null);

    try {
      // Build trade items: A's assets go from A→B, B's assets go from B→A
      const items: ExecuteTradeItem[] = [];

      for (const a of assetsA) {
        items.push({
          senderId: Number(teamAId),
          recipientId: Number(teamBId),
          assetType: a.assetType,
          playerId: a.playerId,
          amount: a.amount,
        });
      }

      for (const a of assetsB) {
        items.push({
          senderId: Number(teamBId),
          recipientId: Number(teamAId),
          assetType: a.assetType,
          playerId: a.playerId,
          amount: a.amount,
        });
      }

      await executeCommissionerTrade(leagueId, { items, note: note.trim() || undefined });
      setResult({ type: "success", message: "Trade executed successfully." });
      setAssetsA([]);
      setAssetsB([]);
      setNote("");
    } catch (err: unknown) {
      setResult({ type: "error", message: err instanceof Error ? err.message : "Trade execution failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--lg-text-muted)]">
        Record an offline trade directly. Select two teams, pick players/budget from each side, and execute.
      </p>

      {/* Team selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase text-[var(--lg-text-muted)] mb-1">Team A</label>
          <select
            className="w-full rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none"
            value={teamAId}
            onChange={(e) => setTeamAId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Select team…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id} disabled={t.id === teamBId}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-[var(--lg-text-muted)] mb-1">Team B</label>
          <select
            className="w-full rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none"
            value={teamBId}
            onChange={(e) => setTeamBId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Select team…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id} disabled={t.id === teamAId}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Asset selectors side-by-side */}
      {teamAId && teamBId && teamAId !== teamBId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TradeAssetSelector
            teamId={Number(teamAId)}
            label={`${teamA?.name ?? "Team A"} sends`}
            onAssetsChange={onAssetsAChange}
          />
          <TradeAssetSelector
            teamId={Number(teamBId)}
            label={`${teamB?.name ?? "Team B"} sends`}
            onAssetsChange={onAssetsBChange}
          />
        </div>
      )}

      {/* Trade summary */}
      {hasAssets && teamA && teamB && (
        <div className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] p-4">
          <div className="text-sm font-semibold text-[var(--lg-text-heading)] mb-2">Trade Summary</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs font-semibold uppercase text-[var(--lg-text-muted)] mb-1">{teamA.name} sends</div>
              {assetsA.length === 0 ? (
                <div className="text-[var(--lg-text-muted)] italic">Nothing</div>
              ) : (
                assetsA.map((a, i) => (
                  <div key={i} className="text-[var(--lg-text-primary)]">{a.label}</div>
                ))
              )}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-[var(--lg-text-muted)] mb-1">{teamB.name} sends</div>
              {assetsB.length === 0 ? (
                <div className="text-[var(--lg-text-muted)] italic">Nothing</div>
              ) : (
                assetsB.map((a, i) => (
                  <div key={i} className="text-[var(--lg-text-primary)]">{a.label}</div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Note */}
      <div>
        <label className="block text-xs font-semibold uppercase text-[var(--lg-text-muted)] mb-1">Note (optional)</label>
        <input
          className="w-full rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none"
          placeholder="e.g. Agreed offline on 3/8"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
        />
      </div>

      {/* Execute button / confirmation */}
      {!confirmOpen ? (
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!canExecute || busy}
          className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white ${
            canExecute && !busy
              ? "bg-[var(--lg-accent)] hover:opacity-90"
              : "bg-[var(--lg-accent)]/40 cursor-not-allowed"
          }`}
        >
          {busy ? "Executing…" : "Execute Trade"}
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <button
            onClick={onExecute}
            disabled={busy}
            className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
          >
            {busy ? "Executing…" : "Confirm Execute"}
          </button>
          <button
            onClick={() => setConfirmOpen(false)}
            className="rounded-xl border border-[var(--lg-border-subtle)] px-4 py-2.5 text-sm text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint)]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Result feedback */}
      {result && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            result.type === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}
