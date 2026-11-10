import { useEffect, useState } from "react";
import { getTeamDetails } from "../../../api";
import { TradeAssetType } from "../api";

type Asset = {
  assetType: TradeAssetType;
  playerId?: number;
  amount?: number;
  season?: number;
  round?: number;
  label: string; // Helpers for UI
};

interface Props {
  teamId: number;
  label: string;
  onAssetsChange: (assets: Asset[]) => void;
}

export function TradeAssetSelector({ teamId, label, onAssetsChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [roster, setRoster] = useState<any[]>([]);
  const [budget, setBudget] = useState(0);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<number>>(new Set());
  const [futureBudgetAmount, setFutureBudgetAmount] = useState<string>("");
  const [futureBudgetSeason, setFutureBudgetSeason] = useState<number>(new Date().getFullYear() + 1);
  const [includeWaiverPriority, setIncludeWaiverPriority] = useState(false);
  const [pickRound, setPickRound] = useState<string>("");
  const [pickSeason, setPickSeason] = useState<number>(new Date().getFullYear() + 1);
  const [budgetAmount, setBudgetAmount] = useState<string>("");

  useEffect(() => {
    if (teamId) fetchRoster();
  }, [teamId]);

  // Reset when team changes
  useEffect(() => {
    setRoster([]);
    setSelectedPlayerIds(new Set());
    setFutureBudgetAmount("");
    setIncludeWaiverPriority(false);
    setBudgetAmount("");
    setPickRound("");
  }, [teamId]);

  async function fetchRoster() {
    setLoading(true);
    try {
      const res = await getTeamDetails(teamId);
      setRoster(res.currentRoster);
      setBudget(res.team.budget);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Notify parent whenever selection changes
  useEffect(() => {
    const assets: Asset[] = [];

    // Players
    selectedPlayerIds.forEach(pid => {
      const p = roster.find(r => r.playerId === pid);
      if (p) {
        assets.push({
          assetType: "PLAYER",
          playerId: pid,
          label: `${p.posPrimary} ${p.name}`
        });
      }
    });

    // Future Auction Dollars
    const fbAmt = parseInt(futureBudgetAmount || "0", 10);
    if (fbAmt > 0) {
      assets.push({
        assetType: "FUTURE_BUDGET",
        amount: fbAmt,
        season: futureBudgetSeason,
        label: `$${fbAmt} of ${futureBudgetSeason} Auction Budget`
      });
    }

    // Current Budget
    const budAmt = parseInt(budgetAmount || "0", 10);
    if (budAmt > 0) {
      assets.push({
        assetType: "BUDGET",
        amount: budAmt,
        label: `$${budAmt} Waiver Budget`
      });
    }

    // Draft Pick
    const pickRnd = parseInt(pickRound || "0", 10);
    if (pickRnd > 0) {
      assets.push({
        assetType: "PICK",
        round: pickRnd,
        season: pickSeason,
        label: `Round ${pickRnd} Draft Pick (${pickSeason})`
      });
    }

    // Waiver Priority (single toggle — FAAB system uses priority position, not rounds)
    if (includeWaiverPriority) {
      assets.push({
        assetType: "WAIVER_PRIORITY",
        label: "Waiver Priority Position"
      });
    }

    onAssetsChange(assets);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onAssetsChange is stable from parent (not re-created per render)
  }, [selectedPlayerIds, futureBudgetAmount, futureBudgetSeason, budgetAmount, pickRound, pickSeason, includeWaiverPriority, roster]);

  const togglePlayer = (pid: number) => {
    const next = new Set(selectedPlayerIds);
    if (next.has(pid)) next.delete(pid);
    else next.add(pid);
    setSelectedPlayerIds(next);
  };

  const inputCls = "bg-[var(--lg-tint-hover)] border-[var(--lg-border-subtle)] rounded px-2 py-1 text-[var(--lg-text-primary)] text-sm focus:outline-none focus:border-blue-500";

  if (loading) return <div className="p-4 bg-[var(--lg-tint)] rounded">Loading roster...</div>;

  return (
    <div className="bg-[var(--lg-tint)] p-4 rounded border border-[var(--lg-border-subtle)] h-full flex flex-col">
      <h3 className="text-sm font-bold uppercase text-[var(--lg-text-muted)] mb-2">{label}</h3>

      <div className="flex-1 overflow-y-auto mb-4 border border-[var(--lg-border-faint)] rounded bg-[var(--lg-input-bg)] p-2 max-h-60">
        {roster.length === 0 && <div className="text-[var(--lg-text-muted)] text-sm">No players on roster</div>}
        {roster.map(p => {
          const isSelected = selectedPlayerIds.has(p.playerId);
          return (
            <div
              key={p.id}
              onClick={() => togglePlayer(p.playerId)}
              className={`flex justify-between items-center p-2 rounded cursor-pointer text-sm mb-1 ${
                isSelected ? "bg-[var(--lg-accent)]/10 text-[var(--lg-accent)] border border-[var(--lg-accent)]/20" : "hover:bg-[var(--lg-tint-hover)] text-[var(--lg-text-secondary)]"
              }`}
            >
              <span><span className="text-xs text-[var(--lg-text-muted)] mr-1">{p.posPrimary}</span> <strong>{p.name}</strong></span>
            </div>
          );
        })}
      </div>

      <div className="mt-auto pt-4 border-t border-[var(--lg-border-faint)] space-y-4">
        {/* Current Waiver Budget */}
        <div>
          <label className="block text-xs text-[var(--lg-text-muted)] uppercase mb-1">
            Waiver Budget
          </label>
          <div className="flex items-center space-x-2">
            <span className="text-[var(--lg-text-muted)] text-sm">$</span>
            <input
              type="number"
              min="0"
              max={budget}
              className={`${inputCls} w-20`}
              placeholder="0"
              value={budgetAmount}
              onChange={e => {
                const val = Math.min(Number(e.target.value), budget);
                setBudgetAmount(val > 0 ? String(val) : "");
              }}
            />
            <span className="text-xs text-[var(--lg-text-muted)]">of ${budget}</span>
          </div>
        </div>

        {/* Draft Pick */}
        <div>
          <label className="block text-xs text-[var(--lg-text-muted)] uppercase mb-1">
            Draft Pick
          </label>
          <div className="flex items-center space-x-2">
            <span className="text-[var(--lg-text-muted)] text-xs">Round</span>
            <input
              type="number"
              min="0"
              max="20"
              className={`${inputCls} w-16`}
              placeholder="#"
              value={pickRound}
              onChange={e => {
                const val = Math.min(Number(e.target.value), 20);
                setPickRound(val > 0 ? String(val) : "");
              }}
            />
            <select
              className={inputCls}
              value={pickSeason}
              onChange={e => setPickSeason(Number(e.target.value))}
            >
              {[0, 1, 2, 3].map(offset => {
                const yr = new Date().getFullYear() + offset;
                return <option key={yr} value={yr}>{yr}</option>;
              })}
            </select>
          </div>
        </div>

        {/* Future Auction Dollars */}
        <div>
          <label className="block text-xs text-[var(--lg-text-muted)] uppercase mb-1">
             Future Auction Dollars
          </label>
          <div className="flex items-center space-x-2">
              <span className="text-[var(--lg-text-muted)] text-sm">$</span>
              <input
                type="number"
                min="0"
                max={400}
                className={`${inputCls} w-20`}
                placeholder="0"
                value={futureBudgetAmount}
                onChange={e => {
                    const val = Math.min(Number(e.target.value), 400);
                    setFutureBudgetAmount(val > 0 ? String(val) : "");
                }}
              />
              <span className="text-[var(--lg-text-muted)] text-xs">of</span>
              <select
                className={inputCls}
                value={futureBudgetSeason}
                onChange={e => setFutureBudgetSeason(Number(e.target.value))}
              >
                {[1, 2, 3].map(offset => {
                  const yr = new Date().getFullYear() + offset;
                  return <option key={yr} value={yr}>{yr}</option>;
                })}
              </select>
          </div>
        </div>

        {/* Waiver Priority (single toggle — FAAB system swaps priority positions) */}
        <div>
          <label className="block text-xs text-[var(--lg-text-muted)] uppercase mb-1">Waiver Priority</label>
          <button
            type="button"
            onClick={() => setIncludeWaiverPriority(!includeWaiverPriority)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium ${
              includeWaiverPriority
                ? "bg-[var(--lg-accent)]/10 text-[var(--lg-accent)] border border-[var(--lg-accent)]/20"
                : "bg-[var(--lg-tint-hover)] text-[var(--lg-text-secondary)] border border-[var(--lg-border-faint)]"
            }`}
          >
            <span>{includeWaiverPriority ? "✓" : "○"}</span>
            <span>Include Waiver Priority Swap</span>
          </button>
        </div>
      </div>
    </div>
  );
}
