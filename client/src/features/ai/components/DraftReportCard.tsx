// Draft Report Card — per-team values & busts at three season checkpoints,
// anchored to auction-day prices. Read-only computation surface; no AI
// commentary yet (follow-up task #61).
import React, { useEffect, useMemo, useState } from "react";
import { Loader2, TrendingUp, TrendingDown, Sparkles, Lock, Info } from "lucide-react";
import { useLeague } from "../../../contexts/LeagueContext";
import { Glass, SectionLabel, Chip } from "../../../components/aurora/atoms";
import {
  getDraftReportCard,
  isLocked,
  type Checkpoint,
  type DraftReportCard as DraftReportCardData,
  type CheckpointLocked,
  type PlayerPick,
} from "../api";

const CHECKPOINTS: { id: Checkpoint; label: string; unlocksLabel: string }[] = [
  { id: "one_third", label: "1/3 Season", unlocksLabel: "" },
  { id: "two_thirds", label: "2/3 Season", unlocksLabel: "Aug 1" },
  { id: "end", label: "Final", unlocksLabel: "Sep 30" },
];

function fmtSurplus(s: number): string {
  const sign = s >= 0 ? "+" : "−";
  return `${sign}${Math.abs(s).toFixed(2)}σ`;
}

function fmtAvg(avg: number): string {
  if (avg <= 0 || !Number.isFinite(avg)) return ".000";
  const rounded = Math.round(avg * 1000).toString().padStart(3, "0");
  return `.${rounded}`;
}

function fmtRate(r: number, digits = 2): string {
  if (!Number.isFinite(r)) return "—";
  return r.toFixed(digits);
}

function statLine(p: PlayerPick): string {
  if (p.isPitcher) {
    return `${p.stats.W ?? 0} W, ${p.stats.SV ?? 0} SV, ${p.stats.K ?? 0} K, ${fmtRate(p.stats.ERA)} ERA, ${fmtRate(p.stats.WHIP, 2)} WHIP`;
  }
  return `${p.stats.R ?? 0} R, ${p.stats.HR ?? 0} HR, ${p.stats.RBI ?? 0} RBI, ${p.stats.SB ?? 0} SB, ${fmtAvg(p.stats.AVG ?? 0)}`;
}

function PickRow({ p, kind }: { p: PlayerPick; kind: "value" | "bust" }) {
  const accent = kind === "value" ? "var(--am-positive, #16a34a)" : "var(--am-negative, #b45309)";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 8,
        padding: "8px 0",
        borderBottom: "1px solid var(--am-border)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text)" }}>{p.name}</span>
          <Chip>{p.posPrimary || (p.isPitcher ? "P" : "—")}</Chip>
          {p.team && <span style={{ fontSize: 10, color: "var(--am-text-faint)" }}>{p.team}</span>}
        </div>
        <div style={{ fontSize: 11, color: "var(--am-text-muted)", marginTop: 2 }}>
          ${p.auctionPrice} · {statLine(p)}
        </div>
      </div>
      <div style={{ textAlign: "right", alignSelf: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: accent, fontVariantNumeric: "tabular-nums" }}>
          {fmtSurplus(p.surplus)}
        </div>
      </div>
    </div>
  );
}

function TeamCard({ team, isMyTeam }: { team: DraftReportCardData["teams"][number]; isMyTeam: boolean }) {
  const auctionTotal =
    team.values.reduce((s, p) => s + p.auctionPrice, 0) +
    team.busts.reduce((s, p) => s + p.auctionPrice, 0);
  return (
    <Glass>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--am-text)", margin: 0 }}>
            {team.teamName}
          </h3>
          {isMyTeam && <Chip strong>You</Chip>}
        </div>
        <div style={{ fontSize: 11, color: "var(--am-text-muted)" }}>
          {team.values.length + team.busts.length} picks · ${auctionTotal}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <SectionLabel style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <TrendingUp size={11} /> Values
          </SectionLabel>
          {team.values.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--am-text-faint)", padding: "8px 0" }}>
              No qualifying picks yet
            </div>
          ) : (
            team.values.map((p) => <PickRow key={p.playerId} p={p} kind="value" />)
          )}
        </div>
        <div>
          <SectionLabel style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <TrendingDown size={11} /> Busts
          </SectionLabel>
          {team.busts.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--am-text-faint)", padding: "8px 0" }}>
              No qualifying picks yet
            </div>
          ) : (
            team.busts.map((p) => <PickRow key={p.playerId} p={p} kind="bust" />)
          )}
        </div>
      </div>
    </Glass>
  );
}

export default function DraftReportCard() {
  const { leagueId, myTeamId } = useLeague();
  const [checkpoint, setCheckpoint] = useState<Checkpoint>("one_third");
  const [data, setData] = useState<DraftReportCardData | CheckpointLocked | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDraftReportCard(leagueId, checkpoint)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, checkpoint]);

  const locked = data && isLocked(data) ? data : null;
  const card = data && !isLocked(data) ? data : null;
  const [showMethodology, setShowMethodology] = useState(false);

  const unlockLabel = useMemo(() => {
    if (!locked?.unlocksAt) return null;
    try {
      return new Date(locked.unlocksAt).toLocaleDateString(undefined, {
        month: "short", day: "numeric",
      });
    } catch {
      return null;
    }
  }, [locked]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <Glass strong>
        <SectionLabel>✦ Draft Report Card</SectionLabel>
        <h1 style={{ fontFamily: "var(--am-display)", fontSize: 30, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>
          Draft Report Card
        </h1>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>
          Auction-day prices anchored to today's stats. Per team: three values (best surplus) and three busts (worst surplus), ranked by z-score performance minus z-score price.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, fontSize: 11, color: "var(--am-text-faint)", flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Sparkles size={12} />
            Auction wins only — keepers excluded
          </span>
          <button
            onClick={() => setShowMethodology((s) => !s)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "4px 8px", borderRadius: 4,
              background: "transparent", color: "var(--am-text-muted)",
              border: "1px solid var(--am-border)", fontSize: 11, cursor: "pointer",
            }}
          >
            <Info size={11} />
            {showMethodology ? "Hide" : "Show"} methodology
          </button>
        </div>
        {showMethodology && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 6, background: "var(--am-surface-faint, rgba(0,0,0,0.03))", border: "1px solid var(--am-border)", fontSize: 12, color: "var(--am-text-muted)", lineHeight: 1.55 }}>
            <div style={{ fontWeight: 700, color: "var(--am-text)", marginBottom: 6 }}>
              How surplus is computed
            </div>
            <div style={{ marginBottom: 6 }}>
              <strong style={{ color: "var(--am-text)" }}>Performance z-score (composite_z).</strong>{" "}
              For each of the 5 roto categories (hitters: R, HR, RBI, SB, AVG; pitchers: W, SV, K, ERA, WHIP),
              compute <code>z = (value − league_mean) / league_stddev</code> within the player's pool
              (hitters z'd against hitters, pitchers against pitchers). ERA and WHIP signs are flipped
              (lower = better). The composite is the sum of the 5 category z's.
            </div>
            <div style={{ marginBottom: 6 }}>
              <strong style={{ color: "var(--am-text)" }}>Price z-score (price_z).</strong>{" "}
              Take <code>log(auction_price + 1)</code> for every player league-wide, then standardize
              the same way: <code>z = (val − mean) / stddev</code>. The log keeps a $1 player and a
              $50 player from being separated by an unreadable distance — fantasy price elasticity is
              roughly logarithmic.
            </div>
            <div style={{ marginBottom: 6 }}>
              <strong style={{ color: "var(--am-text)" }}>Surplus = composite_z − price_z.</strong>{" "}
              High composite_z plus low price_z = big positive surplus = bargain. Low composite_z plus
              high price_z = big negative surplus = bust.
            </div>
            <div style={{ marginBottom: 6 }}>
              <strong style={{ color: "var(--am-text)" }}>Pool filters.</strong>{" "}
              Only players still on the team are scored (dropped/traded picks are gone — they're not
              this owner's value or bust anymore). Keepers (source = prior_season) are excluded so
              the report grades the auction itself, not carry-over salaries. Hitters need ≥ 30 AB and
              pitchers ≥ 10 IP to qualify; below-threshold players are dropped to keep small-sample
              noise out of the bust list.
            </div>
            <div>
              <strong style={{ color: "var(--am-text)" }}>Units.</strong>{" "}
              Surplus is in standard-deviation units (σ). A +2σ value is ~98th percentile vs. expected
              for that price; −2σ is ~2nd percentile.
            </div>
          </div>
        )}
      </Glass>

      {/* Checkpoint selector */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {CHECKPOINTS.map((cp) => {
          const active = checkpoint === cp.id;
          return (
            <button
              key={cp.id}
              onClick={() => setCheckpoint(cp.id)}
              style={{
                padding: "8px 14px",
                borderRadius: 6,
                border: "1px solid var(--am-border)",
                background: active ? "var(--am-chip-strong)" : "var(--am-surface)",
                color: active ? "var(--am-text)" : "var(--am-text-muted)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {cp.label}
              {cp.unlocksLabel && (
                <span style={{ fontSize: 10, color: "var(--am-text-faint)" }}>
                  · unlocks {cp.unlocksLabel}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading && (
        <Glass>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--am-text-muted)", fontSize: 13 }}>
            <Loader2 size={14} className="animate-spin" />
            Loading {CHECKPOINTS.find((c) => c.id === checkpoint)?.label} report…
          </div>
        </Glass>
      )}

      {error && !loading && (
        <Glass>
          <div style={{ color: "var(--am-negative, #b45309)", fontSize: 13 }}>{error}</div>
        </Glass>
      )}

      {!loading && locked && (
        <Glass>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--am-text-muted)", fontSize: 13 }}>
            <Lock size={14} />
            <span>
              This checkpoint unlocks {unlockLabel ?? "later this season"}.
            </span>
          </div>
        </Glass>
      )}

      {!loading && card && card.isPreview && (
        <Glass>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--am-text)", fontWeight: 600 }}>
            <Chip strong color="var(--am-accent, #2563eb)">PREVIEW</Chip>
            <span>
              {card.checkpointLabel} period still in flight — finalizes{" "}
              {new Date(card.periodRange.lastEnd).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.
            </span>
          </div>
        </Glass>
      )}

      {!loading && card && card.teams.length === 0 && (
        <Glass>
          <div style={{ fontSize: 13, color: "var(--am-text-muted)" }}>
            No qualifying picks yet — try a later checkpoint once more stats are in.
          </div>
        </Glass>
      )}

      {!loading && card && card.teams.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 16 }}>
          {card.teams.map((t) => (
            <TeamCard key={t.teamId} team={t} isMyTeam={t.teamId === myTeamId} />
          ))}
        </div>
      )}
    </div>
  );
}
