import React, { useState, useMemo } from "react";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import { useLeague } from "../../../contexts/LeagueContext";
import { useToast } from "../../../contexts/ToastContext";
import type { PlayerSeasonStat } from "../../../api";
import { positionToSlots } from "../../../lib/sportConfig";

type ConditionType = "ONLY_IF_UNAVAILABLE" | "ONLY_IF_AVAILABLE" | "PAIR_WITH";

const CONDITION_LABELS: Record<ConditionType, string> = {
  ONLY_IF_UNAVAILABLE: "Only if player is unavailable",
  ONLY_IF_AVAILABLE: "Only if player is still available",
  PAIR_WITH: "Pair with another claim",
};

interface WaiverClaimFormProps {
  players: PlayerSeasonStat[];
  myTeamId: number;
  myTeamBudget: number;
  myRoster: PlayerSeasonStat[];
  onComplete: () => void;
}

function slotsFor(posList: string): Set<string> {
  const slots = new Set<string>();
  for (const p of (posList || "").split(/[,/| ]+/).map(s => s.trim()).filter(Boolean)) {
    for (const s of positionToSlots(p)) slots.add(s);
  }
  return slots;
}

export default function WaiverClaimForm({ players, myTeamId, myTeamBudget, myRoster, onComplete }: WaiverClaimFormProps) {
  const { leagueId, seasonStatus } = useLeague();
  const { toast } = useToast();
  // Phase 2b backend rule: every in-season waiver claim must pair with a drop.
  // The form enforces the same rule client-side so owners don't waste a click.
  const dropRequired = seasonStatus === "IN_SEASON";

  const [search, setSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSeasonStat | null>(null);
  const [bidAmount, setBidAmount] = useState(1);
  const [dropPlayerId, setDropPlayerId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Condition state
  const [showCondition, setShowCondition] = useState(false);
  const [conditionType, setConditionType] = useState<ConditionType>("ONLY_IF_UNAVAILABLE");
  const [conditionPlayerSearch, setConditionPlayerSearch] = useState("");
  const [conditionPlayer, setConditionPlayer] = useState<PlayerSeasonStat | null>(null);
  const [conditionNote, setConditionNote] = useState("");

  // Filter available players (not on any team)
  const available = useMemo(() => {
    const q = search.toLowerCase().trim();
    return (players || [])
      .filter((p: any) => {
        const teamCode = p.ogba_team_code || p.team || "";
        if (teamCode && teamCode !== "") return false; // already rostered
        const name = (p.player_name || p.name || "").toLowerCase();
        return !q || name.includes(q);
      })
      .slice(0, 20);
  }, [players, search]);

  // Filter all players for condition search (can reference any player, rostered or not)
  const conditionSearchResults = useMemo(() => {
    const q = conditionPlayerSearch.toLowerCase().trim();
    if (!q) return [];
    return (players || [])
      .filter((p: any) => {
        const name = (p.player_name || p.name || "").toLowerCase();
        return name.includes(q);
      })
      .slice(0, 15);
  }, [players, conditionPlayerSearch]);

  const resetCondition = () => {
    setShowCondition(false);
    setConditionType("ONLY_IF_UNAVAILABLE");
    setConditionPlayer(null);
    setConditionPlayerSearch("");
    setConditionNote("");
  };

  const handleSubmit = async () => {
    if (!selectedPlayer || !myTeamId || !leagueId) return;
    const playerId = Number((selectedPlayer as any).mlb_id || (selectedPlayer as any)._dbPlayerId);
    if (!playerId) { toast("Cannot identify player", "error"); return; }

    const conditionPlayerId = conditionPlayer
      ? Number((conditionPlayer as any).mlb_id || (conditionPlayer as any)._dbPlayerId)
      : undefined;

    if (showCondition && !conditionPlayerId) {
      toast("Select a condition player or disable the condition", "error");
      return;
    }

    setSubmitting(true);
    try {
      const result = await fetchJsonApi<{ claim: any }>(`${API_BASE}/waivers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: myTeamId,
          playerId,
          bidAmount,
          dropPlayerId: dropPlayerId || undefined,
          priority: 1,
          ...(showCondition && conditionPlayerId ? {
            conditionType,
            conditionPlayerId,
            conditionNote: conditionNote || undefined,
          } : {}),
        }),
      });

      if ((result as any).error) {
        toast((result as any).error, "error");
      } else {
        const condLabel = showCondition && conditionPlayer
          ? ` (conditional on ${(conditionPlayer as any).player_name || "player"})`
          : "";
        toast(`Waiver claim submitted for ${(selectedPlayer as any).player_name || "player"} ($${bidAmount})${condLabel}`, "success");
        setSelectedPlayer(null);
        setBidAmount(1);
        setDropPlayerId(null);
        setSearch("");
        resetCondition();
        onComplete();
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Claim failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="text-xs font-semibold uppercase text-[var(--lg-text-muted)] mb-2">
        Submit Waiver Claim · Waiver Budget: <span className="text-[var(--lg-accent)]">${myTeamBudget}</span>
      </div>

      {/* Step 1: Search for a player to claim */}
      <div>
        <label className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] block mb-1">Search Available Players</label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Type player name..."
          className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-secondary)] text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-colors"
        />
        {search && !selectedPlayer && (
          <div className="mt-1 rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] max-h-48 overflow-y-auto">
            {available.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--lg-text-muted)]">No available players found</div>
            ) : (
              available.map((p: any, i: number) => (
                <button
                  key={i}
                  onClick={() => { setSelectedPlayer(p); setSearch(""); }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--lg-tint-hover)] transition-colors flex items-center justify-between"
                >
                  <span className="font-medium text-[var(--lg-text-primary)]">{p.player_name || p.name}</span>
                  <span className="text-[var(--lg-text-muted)]">{p.positions || p.posPrimary} · {p.mlb_team || p.mlbTeam}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Selected player display */}
      {selectedPlayer && (
        <div className="rounded-lg border border-[var(--lg-accent)]/30 bg-[var(--lg-accent)]/5 px-3 py-2 flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-[var(--lg-text-primary)]">
              {(selectedPlayer as any).player_name || (selectedPlayer as any).name}
            </span>
            <span className="ml-2 text-xs text-[var(--lg-text-muted)]">
              {(selectedPlayer as any).positions || (selectedPlayer as any).posPrimary} · {(selectedPlayer as any).mlb_team || (selectedPlayer as any).mlbTeam}
            </span>
          </div>
          <button onClick={() => setSelectedPlayer(null)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
        </div>
      )}

      {/* Step 2: FAAB Bid Amount */}
      {selectedPlayer && (
        <div>
          <label className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] block mb-1">
            Waiver Budget Bid (max ${myTeamBudget})
          </label>
          <input
            type="number"
            min={0}
            max={myTeamBudget}
            value={bidAmount}
            onChange={(e) => setBidAmount(Math.min(myTeamBudget, Math.max(0, Number(e.target.value))))}
            className="w-32 px-3 py-2 text-sm rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-secondary)] text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-colors"
          />
        </div>
      )}

      {/* Step 3: Drop player — required in-season (Phase 2b: every add pairs with a drop).
          Outside of IN_SEASON the dropdown is optional but still surfaced. */}
      {selectedPlayer && (() => {
        const addSlots = slotsFor(((selectedPlayer as any).positions ?? (selectedPlayer as any).posPrimary ?? "") as string);
        const selectedDrop = myRoster.find((p: any) => ((p as any)._dbPlayerId || (p as any).mlb_id) === dropPlayerId) ?? null;
        const dropSlot = selectedDrop
          ? ((selectedDrop as any).assignedPosition || (selectedDrop as any).posPrimary || "UT")
          : null;
        const dropEligible = !selectedDrop || !dropSlot ? true : addSlots.has(dropSlot);
        return (
          <div>
            <label className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] block mb-1">
              Drop Player{dropRequired ? " (required in-season)" : " (optional)"}
            </label>
            <select
              value={dropPlayerId ?? ""}
              onChange={(e) => setDropPlayerId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-secondary)] text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-colors"
            >
              <option value="">Select player to drop...</option>
              {myRoster.map((p: any, i: number) => {
                const targetSlot = (p as any).assignedPosition || (p as any).posPrimary || "UT";
                const fits = addSlots.has(targetSlot);
                return (
                  <option key={i} value={(p as any)._dbPlayerId || (p as any).mlb_id}>
                    {p.player_name || p.name} — {targetSlot}{fits ? "" : " (ineligible)"}
                  </option>
                );
              })}
            </select>
            {selectedDrop && !dropEligible && (
              <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                {(selectedPlayer as any).player_name || "Add player"} is not eligible for the {dropSlot} slot.
                The waiver processor will reject this claim — pick a different drop player.
              </div>
            )}
          </div>
        );
      })()}

      {/* Step 4: Optional condition */}
      {selectedPlayer && (
        <div className="border border-[var(--lg-border-subtle)] rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => {
              if (showCondition) resetCondition();
              else setShowCondition(true);
            }}
            className="w-full text-left px-3 py-2 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] hover:bg-[var(--lg-tint)] transition-colors flex items-center justify-between"
          >
            <span>Add a condition (optional)</span>
            <span className="text-xs">{showCondition ? "-" : "+"}</span>
          </button>

          {showCondition && (
            <div className="px-3 pb-3 space-y-3 border-t border-[var(--lg-border-subtle)]">
              {/* Condition type */}
              <div className="pt-3">
                <label className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] block mb-1">Condition Type</label>
                <select
                  value={conditionType}
                  onChange={(e) => setConditionType(e.target.value as ConditionType)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-secondary)] text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-colors"
                >
                  {(Object.entries(CONDITION_LABELS) as [ConditionType, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Condition player search */}
              <div>
                <label className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] block mb-1">Condition Player</label>
                {conditionPlayer ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-semibold text-[var(--lg-text-primary)]">
                        {(conditionPlayer as any).player_name || (conditionPlayer as any).name}
                      </span>
                      <span className="ml-2 text-xs text-[var(--lg-text-muted)]">
                        {(conditionPlayer as any).positions || (conditionPlayer as any).posPrimary} · {(conditionPlayer as any).mlb_team || (conditionPlayer as any).mlbTeam}
                      </span>
                    </div>
                    <button onClick={() => { setConditionPlayer(null); setConditionPlayerSearch(""); }} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={conditionPlayerSearch}
                      onChange={(e) => setConditionPlayerSearch(e.target.value)}
                      placeholder="Search any player..."
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-secondary)] text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-colors"
                    />
                    {conditionPlayerSearch && (
                      <div className="mt-1 rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] max-h-36 overflow-y-auto">
                        {conditionSearchResults.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-[var(--lg-text-muted)]">No players found</div>
                        ) : (
                          conditionSearchResults.map((p: any, i: number) => (
                            <button
                              key={i}
                              onClick={() => { setConditionPlayer(p); setConditionPlayerSearch(""); }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--lg-tint-hover)] transition-colors flex items-center justify-between"
                            >
                              <span className="font-medium text-[var(--lg-text-primary)]">{p.player_name || p.name}</span>
                              <span className="text-[var(--lg-text-muted)]">{p.positions || p.posPrimary} · {p.mlb_team || p.mlbTeam}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Condition note */}
              <div>
                <label className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] block mb-1">Note (optional, 200 chars)</label>
                <input
                  type="text"
                  value={conditionNote}
                  onChange={(e) => setConditionNote(e.target.value.slice(0, 200))}
                  placeholder="e.g., Only want this player if my other target is gone"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-secondary)] text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-colors"
                />
              </div>

              {/* Condition summary */}
              {conditionPlayer && (
                <div className="text-xs text-[var(--lg-text-secondary)] bg-[var(--lg-tint)] rounded-lg px-3 py-2 border border-[var(--lg-border-faint)]">
                  {conditionType === "ONLY_IF_UNAVAILABLE" && (
                    <>Claim <strong>{(selectedPlayer as any).player_name}</strong> only if <strong>{(conditionPlayer as any).player_name}</strong> is already taken by someone else.</>
                  )}
                  {conditionType === "ONLY_IF_AVAILABLE" && (
                    <>Claim <strong>{(selectedPlayer as any).player_name}</strong> only if <strong>{(conditionPlayer as any).player_name}</strong> is still available (not claimed).</>
                  )}
                  {conditionType === "PAIR_WITH" && (
                    <>Claim <strong>{(selectedPlayer as any).player_name}</strong> only if I also win <strong>{(conditionPlayer as any).player_name}</strong>.</>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Submit */}
      {selectedPlayer && (
        <button
          onClick={handleSubmit}
          disabled={submitting || bidAmount < 0 || bidAmount > myTeamBudget || ((dropRequired || myRoster.length >= 23) && !dropPlayerId) || (showCondition && !conditionPlayer)}
          className="px-6 py-2 text-sm font-semibold rounded-lg bg-[var(--lg-accent)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {submitting ? "Submitting..." : `Submit Claim ($${bidAmount})`}
        </button>
      )}
    </div>
  );
}
