/*
 * Draft report (auction retrospective, GET /auction/retrospective): league
 * summary, bargains and overpays, spending by position, most contested
 * players, team efficiency and spending pace. Rendered inside the report
 * page's card, as rows (report.css), so nothing needs a table wider than a
 * phone. Loaded on demand: the retrospective is computed on request.
 */
import React, { useState } from "react";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import "./report.css";

/* ── Types (matches server response) ─────────────────────────────── */

interface SurplusEntry {
  playerName: string; position: string; price: number; projectedValue: number; surplus: number;
}

interface PositionSpend {
  position: string; totalSpent: number; avgPrice: number; playerCount: number;
}

interface ContestedLot {
  playerName: string; position: string; price: number; bidCount: number; teamsInvolved: number;
}

interface TeamEfficiency {
  teamId: number; teamName: string; totalSpent: number; playersAcquired: number;
  avgPrice: number; budgetRemaining: number; bargainCount: number; overpayCount: number; totalSurplus: number;
}

interface QuarterPace {
  quarter: number; avgPrice: number; totalSpent: number; lotsCount: number;
}

export interface RetrospectiveData {
  league: {
    totalLots: number; totalSpent: number; avgPrice: number; medianPrice: number;
    mostExpensivePlayer: { playerName: string; position: string; price: number } | null;
    cheapestWin: { playerName: string; position: string; price: number } | null;
    totalBidsPlaced: number; avgBidsPerLot: number;
  };
  bargains: SurplusEntry[];
  overpays: SurplusEntry[];
  positionSpending: PositionSpend[];
  mostContested: ContestedLot[];
  teamEfficiency: TeamEfficiency[];
  spendingPace: QuarterPace[];
}

interface DraftReportProps {
  leagueId: number;
  myTeamId?: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "+$6", "-$4", "—" for zero. */
export const signedMoney = (n: number) => (n === 0 ? "—" : `${n > 0 ? "+" : "-"}$${Math.abs(n)}`);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ar-sec">
      <h3 className="tb-cap">{title}</h3>
      <div className="ar-sublist">{children}</div>
    </div>
  );
}

function Row({ title, detail, value, sub, me, valueClass }: {
  title: React.ReactNode; detail?: React.ReactNode; value?: React.ReactNode; sub?: React.ReactNode; me?: boolean; valueClass?: string;
}) {
  return (
    <div className={`ar-row${me ? " me" : ""}`}>
      <span className="ar-row-t">
        <b>{title}</b>
        {detail && <small className="ar-num">{detail}</small>}
      </span>
      {(value || sub) && (
        <span className="ar-row-r">
          {value && <b className={valueClass}>{value}</b>}
          {sub && <small>{sub}</small>}
        </span>
      )}
    </div>
  );
}

export function DraftReportBody({ data, myTeamId }: { data: RetrospectiveData; myTeamId?: number }) {
  const lg = data.league;
  return (
    <div className="ar-report">
      <Section title="League summary">
        <Row title={plural(lg.totalLots, "lot")} detail={`avg $${lg.avgPrice} · median $${lg.medianPrice}`} value={`$${lg.totalSpent}`} sub="spent" />
        <Row title={plural(lg.totalBidsPlaced, "bid")} detail={`${lg.avgBidsPerLot} per lot`} />
        {lg.mostExpensivePlayer && (
          <Row title="Most expensive" detail={`${lg.mostExpensivePlayer.playerName} · ${lg.mostExpensivePlayer.position}`} value={`$${lg.mostExpensivePlayer.price}`} />
        )}
        {lg.cheapestWin && (
          <Row title="Cheapest win" detail={`${lg.cheapestWin.playerName} · ${lg.cheapestWin.position}`} value={`$${lg.cheapestWin.price}`} />
        )}
      </Section>

      {data.bargains.length > 0 && (
        <Section title="Top bargains">
          {data.bargains.map(b => (
            <Row key={b.playerName} title={b.playerName} detail={`${b.position} · paid $${b.price}, value $${b.projectedValue}`}
              value={signedMoney(b.surplus)} valueClass="pos" />
          ))}
        </Section>
      )}

      {data.overpays.length > 0 && (
        <Section title="Top overpays">
          {data.overpays.map(o => (
            <Row key={o.playerName} title={o.playerName} detail={`${o.position} · paid $${o.price}, value $${o.projectedValue}`}
              value={signedMoney(o.surplus)} valueClass="neg" />
          ))}
        </Section>
      )}

      {data.positionSpending.length > 0 && (
        <Section title="Spending by position">
          {data.positionSpending.map(ps => (
            <Row key={ps.position} title={ps.position} detail={`${plural(ps.playerCount, "player")} · avg $${ps.avgPrice}`} value={`$${ps.totalSpent}`} />
          ))}
        </Section>
      )}

      {data.mostContested.length > 0 && (
        <Section title="Most contested">
          {data.mostContested.map(mc => (
            <Row key={mc.playerName} title={mc.playerName}
              detail={`${mc.position} · ${plural(mc.bidCount, "bid")} · ${plural(mc.teamsInvolved, "team")}`} value={`$${mc.price}`} />
          ))}
        </Section>
      )}

      {data.teamEfficiency.length > 0 && (
        <Section title="Team efficiency">
          {data.teamEfficiency.map(te => (
            <Row key={te.teamId} me={te.teamId === myTeamId}
              title={<>{te.teamName}{te.teamId === myTeamId && <span className="ar-you">You</span>}</>}
              detail={`${plural(te.playersAcquired, "player")} · $${te.totalSpent} spent · $${te.budgetRemaining} left`}
              value={signedMoney(te.totalSurplus)} sub="vs value"
              valueClass={te.totalSurplus > 0 ? "pos" : te.totalSurplus < 0 ? "neg" : undefined} />
          ))}
        </Section>
      )}

      {data.spendingPace.length > 0 && (
        <Section title="Spending pace">
          {data.spendingPace.map((q, i) => {
            const prev = i > 0 ? data.spendingPace[i - 1] : null;
            const trend = prev && q.avgPrice > 0 && prev.avgPrice > 0
              ? q.avgPrice > prev.avgPrice ? `up from Q${prev.quarter}` : q.avgPrice < prev.avgPrice ? `down from Q${prev.quarter}` : null
              : null;
            return (
              <Row key={q.quarter} title={`Q${q.quarter} · ${plural(q.lotsCount, "lot")}`} detail={`$${q.totalSpent} total`}
                value={`$${q.avgPrice}`} sub={trend ? `avg, ${trend}` : "avg"} />
            );
          })}
        </Section>
      )}
    </div>
  );
}

export default function DraftReport({ leagueId, myTeamId }: DraftReportProps) {
  const [data, setData] = useState<RetrospectiveData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReport() {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchJsonApi<RetrospectiveData>(`${API_BASE}/auction/retrospective?leagueId=${leagueId}`));
    } catch {
      setError("Couldn't load the draft report.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="ar-card-h" style={data ? undefined : { marginBottom: 0 }}>
        <h2 className="tb-cap">Draft report</h2>
        {!data && (
          <button type="button" className="ar-btn" onClick={loadReport} disabled={loading}>
            {loading ? "Analyzing…" : "View draft report"}
          </button>
        )}
      </div>
      {!data && !error && (
        <p className="tb-sub" style={{ marginTop: 8 }}>Bargains, overpays, spending by position and team, and how prices moved.</p>
      )}
      {error && <p className="ar-error" role="alert" style={{ marginTop: 8 }}>{error}</p>}
      {data && <DraftReportBody data={data} myTeamId={myTeamId} />}
    </div>
  );
}
