/*
 * AuctionResults — Aurora port (PR-2a of Auction module rollout).
 *
 * Aurora bento page for the post-draft results surface. The page itself
 * is a thin data-loader; the visible chrome lives in AuctionComplete
 * (which has been re-skinned in this PR). DraftReport, BidHistoryChart,
 * and AuctionReplay still render with their legacy chrome inside this
 * Aurora wrapper — PR-2b will deepen them. The composite renders
 * acceptably because Aurora's `.aurora-theme` scope leaves the
 * `--lg-*` token namespace intact for legacy children.
 *
 * Legacy 93-LOC page preserved at /auction-results-classic via
 * AuctionResultsLegacy.tsx → AuctionCompleteLegacy.tsx.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMe, getLeague } from '../../../api';
import { useLeague, findMyTeam } from '../../../contexts/LeagueContext';
import { fetchJsonApi, API_BASE } from '../../../api/base';
import type { ClientAuctionState } from '../hooks/useAuctionState';
import AuctionComplete from '../components/AuctionComplete';
import { AmbientBg, Glass, SectionLabel } from '../../../components/aurora/atoms';
import '../../../components/aurora/aurora.css';

export default function AuctionResults() {
  const { leagueId } = useLeague();
  const [auctionState, setAuctionState] = useState<ClientAuctionState | null>(null);
  const [myTeamId, setMyTeamId] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetchState = React.useCallback(async () => {
    if (!leagueId) return;
    try {
      const state = await fetchJsonApi<ClientAuctionState>(`${API_BASE}/auction/state?leagueId=${leagueId}`);
      setAuctionState(state);
    } catch { /* non-critical — optimistic UI already shows the change */ }
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId) return;
    let mounted = true;

    const init = async () => {
      try {
        setLoading(true);
        setError(null);

        const [state, meRes] = await Promise.all([
          fetchJsonApi<ClientAuctionState>(`${API_BASE}/auction/state?leagueId=${leagueId}`),
          getMe(),
        ]);

        if (!mounted) return;
        setAuctionState(state);

        const myUserId = meRes.user?.id;
        if (myUserId) {
          const detail = await getLeague(leagueId);
          if (!mounted) return;
          const myTeam = findMyTeam(detail.league.teams, myUserId);
          if (myTeam) setMyTeamId(myTeam.id);
        }
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load auction results');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();
    return () => { mounted = false; };
  }, [leagueId]);

  return (
    <div className="aurora-theme" style={{ position: "relative", minHeight: "100svh" }}>
      <AmbientBg />
      <div style={{ position: "relative", zIndex: 1, padding: "24px 16px 48px", maxWidth: 1100, margin: "0 auto" }}>
        {loading && <AuctionResultsSkeleton />}

        {!loading && error && (
          <Glass>
            <SectionLabel>✦ Auction Results</SectionLabel>
            <div style={{ fontFamily: "var(--am-display)", fontSize: 24, fontWeight: 300, color: "var(--am-text)", marginTop: 4 }}>
              Couldn't load results.
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>{error}</div>
          </Glass>
        )}

        {!loading && !error && (!auctionState || auctionState.status === 'not_started') && (
          <Glass>
            <SectionLabel>✦ Auction Results</SectionLabel>
            <div style={{ fontFamily: "var(--am-display)", fontSize: 24, fontWeight: 300, color: "var(--am-text)", marginTop: 4 }}>
              No auction yet.
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>
              The auction hasn't been run for this league. Once it wraps, results will appear here.
            </div>
          </Glass>
        )}

        {!loading && !error && auctionState && auctionState.status !== 'not_started' && (
          <AuctionComplete auctionState={auctionState} myTeamId={myTeamId} onRefresh={refetchState} />
        )}

        <div style={{ marginTop: 16, textAlign: "center", fontSize: 11, color: "var(--am-text-faint)" }}>
          Need the original layout? <Link to="/auction-results-classic" style={{ color: "var(--am-text-muted)", textDecoration: "underline" }}>View classic Auction Results →</Link>
        </div>
      </div>
    </div>
  );
}

function AuctionResultsSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Glass>
        <div style={{ height: 28, width: 220, borderRadius: 8, background: "var(--am-surface-faint)" }} />
        <div style={{ height: 14, width: 320, borderRadius: 8, background: "var(--am-surface-faint)", marginTop: 10 }} />
      </Glass>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[0, 1, 2].map(i => (
          <Glass key={i}>
            <div style={{ height: 12, width: 80, borderRadius: 6, background: "var(--am-surface-faint)" }} />
            <div style={{ height: 24, width: 60, borderRadius: 6, background: "var(--am-surface-faint)", marginTop: 8 }} />
          </Glass>
        ))}
      </div>
      <Glass>
        <div style={{ height: 200, borderRadius: 12, background: "var(--am-surface-faint)" }} />
      </Glass>
    </div>
  );
}
