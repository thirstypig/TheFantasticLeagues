import { useEffect, useState, useCallback } from "react";
import {
  getTrades,
  proposeTrade,
  respondToTrade,
  cancelTrade,
  vetoTrade,
  processTrade,
  TradeProposal,
  getLeague,
} from "../../../api";
import { useAuth } from "../../../auth/AuthProvider";
import { useLeague } from "../../../contexts/LeagueContext";
import { TradeAssetSelector } from "../components/TradeAssetSelector";
import TeamRosterView from "../../teams/components/TeamRosterView";
import { Eye, Plus } from "lucide-react";
import PageHeader from "../../../components/ui/PageHeader";
import { Button } from "../../../components/ui/button";
import { useToast } from "../../../contexts/ToastContext";

export function TradesPage() {
  const { me } = useAuth();
  const user = me?.user;
  const { leagueId: currentLeagueId } = useLeague();
  const isCommissioner = user?.isAdmin || user?.memberships?.some(
    (m: any) => Number(m.leagueId) === currentLeagueId && m.role === "COMMISSIONER"
  );
  const [myTrades, setMyTrades] = useState<TradeProposal[]>([]);
  const [leagueTrades, setLeagueTrades] = useState<TradeProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"my" | "league" | "create">("my");
  const [contextTrade, setContextTrade] = useState<TradeProposal | null>(null);

  const loadAllTrades = useCallback(async () => {
    const leagueIdStr = user?.memberships?.[0]?.leagueId;
    if (!leagueIdStr) {
      setLoading(false);
      return;
    }
    const leagueId = Number(leagueIdStr);

    setLoading(true);
    try {
      // Load my trades
      const myRes = await getTrades(leagueId, "my");
      setMyTrades(myRes.trades || []);
      
      // Load league-wide trades
      const leagueRes = await getTrades(leagueId, "all");
      setLeagueTrades(leagueRes.trades || []);
      
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load trades");
      setMyTrades([]);
      setLeagueTrades([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if(user) loadAllTrades();
  }, [user, loadAllTrades]);

  const myActive = myTrades.filter((t) => ["PROPOSED", "ACCEPTED"].includes(t.status));
  const myHistory = myTrades.filter((t) => !["PROPOSED", "ACCEPTED"].includes(t.status));

  if (!user && !loading) return <div className="p-4">Please log in to trade.</div>;
  if (loading && !myTrades.length)
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10 space-y-6 md:space-y-12">
        <PageHeader title="Trade Negotiation Hub" subtitle="View current proposals, history, and league trading activity." />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl bg-[var(--lg-tint)] animate-pulse h-24" />
          ))}
        </div>
      </div>
    );
  if (error) return <div className="p-4 text-red-500">Error: {error}</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10 space-y-6 md:space-y-12">
      <div className="mb-6">
        <PageHeader 
            title="Trade Negotiation Hub" 
            subtitle="View current proposals, history, and league trading activity."
            rightElement={
                <Button
                    onClick={() => setActiveTab("create")}
                    variant="default"
                    className="px-8 shadow-xl shadow-blue-500/20"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Propose Trade
                </Button>
            }
        />
      </div>

      {/* Tabs */}
      <div className="lg-card p-1 inline-flex gap-2">
        <Button
          onClick={() => setActiveTab("my")}
          variant={activeTab === "my" ? "default" : "ghost"}
          size="sm"
          className="px-6"
        >
          My Proposals
        </Button>
        <Button
          onClick={() => setActiveTab("league")}
          variant={activeTab === "league" ? "default" : "ghost"}
          size="sm"
          className="px-6"
        >
          League Activity
        </Button>
        {activeTab === "create" && (
          <Button
            variant="secondary"
            size="sm"
            className="px-6 bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          >
            Create Proposal
          </Button>
        )}
      </div>

      {/* My Trades Tab */}
      {activeTab === "my" && (
        <div className="space-y-16">
          <div>
            <div className="flex items-center gap-4 mb-8">
                <div className="w-1.5 h-6 bg-emerald-500 rounded-full shadow-lg shadow-emerald-500/20"></div>
                <h2 className="text-2xl font-semibold uppercase tracking-tight text-[var(--lg-text-heading)]">Active Trades</h2>
            </div>
            {myActive.length === 0 && (
              <div className="lg-card p-16 text-center text-[var(--lg-text-muted)] opacity-40 italic font-medium">
                No active trade proposals.
              </div>
            )}
            <div className="grid gap-6">
              {myActive.map((t) => (
                <TradeCard key={t.id} trade={t} onRefresh={loadAllTrades} currentUserId={Number(user?.id)} onViewContext={() => setContextTrade(t)} />
              ))}
            </div>
          </div>
          
          <div>
            <div className="flex items-center gap-4 mb-8">
                <div className="w-1.5 h-6 bg-[var(--lg-text-muted)] opacity-20 rounded-full"></div>
                <h2 className="text-2xl font-semibold uppercase tracking-tight text-[var(--lg-text-heading)] opacity-60">Trade History</h2>
            </div>
            {myHistory.length === 0 && (
              <div className="lg-card p-16 text-center text-[var(--lg-text-muted)] opacity-40 italic font-medium">
                No past trades.
              </div>
            )}
            <div className="grid gap-6">
              {myHistory.map((t) => (
                <TradeCard key={t.id} trade={t} onRefresh={loadAllTrades} currentUserId={Number(user?.id)} onViewContext={() => setContextTrade(t)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* League Activity Tab */}
      {activeTab === "league" && (
        <div className="grid gap-6">
            <div className="flex items-center gap-4 mb-4">
                <div className="w-1.5 h-6 bg-blue-500 rounded-full shadow-lg shadow-blue-500/20"></div>
                <h2 className="text-2xl font-semibold uppercase tracking-tight text-[var(--lg-text-heading)]">League Trades</h2>
            </div>
          {leagueTrades.length === 0 && (
            <div className="lg-card p-16 text-center text-[var(--lg-text-muted)] opacity-40 italic font-medium">
              No league trades found.
            </div>
          )}
          {leagueTrades.map((t) => (
            <LeagueTradeCard 
              key={t.id} 
              trade={t} 
              onRefresh={loadAllTrades} 
              currentUserId={Number(user?.id)} 
              isAdmin={isCommissioner}
              onViewContext={() => setContextTrade(t)}
            />
          ))}
        </div>
      )}

      {/* Create Trade Tab */}
      {activeTab === "create" && (
        <CreateTradeForm onCancel={() => setActiveTab("my")} onSuccess={() => { loadAllTrades(); setActiveTab("my"); }} />
      )}

      {/* Context Modal */}
      {contextTrade && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => setContextTrade(null)}>
              <div className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="p-4 border-b border-[var(--lg-border-subtle)] flex justify-between items-center bg-[var(--lg-tint)]">
                      <h3 className="font-semibold text-lg text-[var(--lg-text-heading)]">Trade Context</h3>
                      <button onClick={() => setContextTrade(null)} className="text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]">✕</button>
                  </div>
                  <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
                      <TeamRosterView teamId={contextTrade.proposingTeamId ?? contextTrade.proposerId} teamName={contextTrade.proposingTeam?.name ?? "Proposer"} />
                      <TeamRosterView teamId={contextTrade.acceptingTeamId ?? 0} teamName={contextTrade.acceptingTeam?.name ?? "Counterparty"} />
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

export function TradeCard({
  trade,
  onRefresh,
  currentUserId,
  onViewContext,
}: {
  trade: TradeProposal;
  onRefresh: () => void;
  currentUserId?: number;
  onViewContext?: () => void;
}) {
  const isPending = trade.status === "PROPOSED";
  const isProposer = trade.proposingTeam?.ownerUserId === currentUserId
    || (trade.proposingTeam?.ownerships || []).some((o: any) => o.userId === currentUserId);
  
  return (
    <div className="lg-card p-4">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="text-lg font-semibold text-[var(--lg-text-primary)]">
            {trade.proposingTeam?.name ?? "Proposer"} <span className="text-[var(--lg-text-muted)] text-sm">offers to</span> {trade.acceptingTeam?.name ?? "Counterparty"}
          </div>
          <div className="text-xs text-[var(--lg-text-muted)]">
            {new Date(trade.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div className="flex items-center gap-2">
            {onViewContext && (
                <button onClick={onViewContext} className="p-1 hover:bg-[var(--lg-tint)] rounded text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]" title="View Context">
                    <Eye size={16} />
                </button>
            )}
            <div className="px-2 py-1 bg-[var(--lg-tint)] rounded text-xs font-mono uppercase text-[var(--lg-text-primary)]">
              {trade.status}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-[var(--lg-tint)] p-3 rounded-xl">
          <div className="text-xs text-[var(--lg-text-muted)] uppercase font-semibold mb-2">{trade.proposingTeam?.name ?? "Proposer"} Gives</div>
          <ul className="space-y-1 text-sm">
            {trade.items
              .filter((i) => i.senderTeamId === trade.proposingTeamId)
              .map((i) => (
                 <li key={i.id} className="flex items-center space-x-2">
                   {i.assetType === "PLAYER" && i.player && (
                     <span>{i.player.posPrimary} {i.player.name}</span>
                   )}
                   {i.assetType === "BUDGET" && (
                     <span>${i.amount} Budget</span>
                   )}
                 </li>
              ))}
          </ul>
        </div>
        <div className="bg-[var(--lg-tint)] p-3 rounded-xl">
          <div className="text-xs text-[var(--lg-text-muted)] uppercase font-semibold mb-2">{trade.acceptingTeam?.name ?? "Counterparty"} Gives</div>
          <ul className="space-y-1 text-sm">
            {trade.items
               .filter((i) => i.senderTeamId === trade.acceptingTeamId)
               .map((i) => (
                 <li key={i.id} className="flex items-center space-x-2">
                   {i.assetType === "PLAYER" && i.player && (
                     <span>{i.player.posPrimary} {i.player.name}</span>
                   )}
                   {i.assetType === "BUDGET" && (
                     <span>${i.amount} Budget</span>
                   )}
                 </li>
               ))}
          </ul>
        </div>
      </div>

      {isPending && (
         <div className="flex justify-end space-x-2">
           {isProposer ? (
             <button
               onClick={async () => {
                  if (!confirm("Cancel trade?")) return;
                  await cancelTrade(trade.id);
                  onRefresh();
               }}
               className="px-3 py-1 bg-[var(--lg-tint)] hover:bg-[var(--lg-tint-hover)] text-[var(--lg-text-primary)] rounded text-sm transition-colors"
             >
               Cancel
             </button>
           ) : (
             <>
               <button
                 onClick={async () => {
                    if (!confirm("Reject trade?")) return;
                    await respondToTrade(trade.id, "REJECT");
                    onRefresh();
                 }}
                 className="px-3 py-1 bg-[var(--lg-error)]/10 hover:bg-[var(--lg-error)]/20 text-[var(--lg-error)] rounded text-sm transition-colors"
               >
                 Reject
               </button>
               <button
                 onClick={async () => {
                    if (!confirm("Accept trade?")) return;
                    await respondToTrade(trade.id, "ACCEPT");
                    onRefresh();
                 }}
                 className="px-3 py-1 bg-[var(--lg-success)]/10 hover:bg-[var(--lg-success)]/20 text-[var(--lg-success)] rounded text-sm transition-colors"
               >
                 Accept
               </button>
             </>
           )}
         </div>
      )}
    </div>
  );
}

export function LeagueTradeCard({
  trade,
  onRefresh,
  currentUserId,
  isAdmin,
  onViewContext,
}: {
  trade: any; // TODO: specify type if possible
  onRefresh: () => void;
  currentUserId?: number;
  isAdmin?: boolean;
  onViewContext?: () => void;
}) {
  const isInvolved = trade.proposingTeam?.ownerUserId === currentUserId
    || (trade.proposingTeam?.ownerships || []).some((o: any) => o.userId === currentUserId)
    || trade.acceptingTeam?.ownerUserId === currentUserId
    || (trade.acceptingTeam?.ownerships || []).some((o: any) => o.userId === currentUserId);

  return (
    <div className="lg-card p-4">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="text-lg font-semibold text-[var(--lg-text-primary)]">
            {trade.proposingTeam?.name ?? "Proposer"} <span className="text-[var(--lg-text-muted)] text-sm">↔</span> {trade.acceptingTeam?.name ?? "Counterparty"}
          </div>
          <div className="text-xs text-[var(--lg-text-muted)]">
            {new Date(trade.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div className="flex items-center gap-2">
            {onViewContext && (
                <button onClick={onViewContext} className="p-1 hover:bg-[var(--lg-tint)] rounded text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]" title="View Context">
                    <Eye size={16} />
                </button>
            )}
            <div className="px-2 py-1 bg-[var(--lg-tint)] rounded text-xs font-mono uppercase text-[var(--lg-text-primary)]">
              {trade.status}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-[var(--lg-tint)] p-3 rounded-xl">
          <div className="text-xs text-[var(--lg-text-muted)] uppercase font-semibold mb-2">{trade.proposingTeam?.name ?? "Proposer"} Gives</div>
          <ul className="space-y-1 text-sm">
            {trade.items
              .filter((i: any) => i.senderTeamId === trade.proposingTeamId)
              .map((i: any) => (
                 <li key={i.id}>
                   {i.assetType === "PLAYER" && i.player && `${i.player.posPrimary} ${i.player.name}`}
                   {i.assetType === "BUDGET" && `$${i.amount} Budget`}
                 </li>
              ))}
          </ul>
        </div>
        <div className="bg-[var(--lg-tint)] p-3 rounded-xl">
          <div className="text-xs text-[var(--lg-text-muted)] uppercase font-semibold mb-2">{trade.acceptingTeam?.name ?? "Counterparty"} Gives</div>
          <ul className="space-y-1 text-sm">
            {trade.items
               .filter((i: any) => i.senderTeamId === trade.acceptingTeamId)
               .map((i: any) => (
                 <li key={i.id}>
                   {i.assetType === "PLAYER" && i.player && `${i.player.posPrimary} ${i.player.name}`}
                   {i.assetType === "BUDGET" && `$${i.amount} Budget`}
                 </li>
               ))}
          </ul>
        </div>
      </div>

      {/* Commissioner Controls — accept/reject PROPOSED trades */}
      {isAdmin && trade.status === "PROPOSED" && !isInvolved && (
        <div className="flex justify-end space-x-2 border-t border-[var(--lg-border-subtle)] pt-3 mt-3">
          <button
            onClick={async () => {
              if (!confirm("Reject this trade as commissioner?")) return;
              await respondToTrade(trade.id, "REJECT");
              onRefresh();
            }}
            className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded text-sm font-semibold"
          >
            Commissioner Reject
          </button>
          <button
            onClick={async () => {
              if (!confirm("Accept this trade as commissioner?")) return;
              await respondToTrade(trade.id, "ACCEPT");
              onRefresh();
            }}
            className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-sm font-semibold"
          >
            Commissioner Accept
          </button>
        </div>
      )}

      {/* Commissioner Controls — process/veto ACCEPTED trades */}
      {isAdmin && trade.status === "ACCEPTED" && (
        <div className="flex justify-end space-x-2 border-t border-[var(--lg-border-subtle)] pt-3 mt-3">
          <button
            onClick={async () => {
              if (!confirm("Veto this trade?")) return;
              await vetoTrade(trade.id);
              onRefresh();
            }}
            className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded text-sm font-semibold"
          >
            Commissioner Veto
          </button>
          <button
            onClick={async () => {
              if (!confirm("Process this trade? Players and budget will be moved.")) return;
              await processTrade(trade.id);
              onRefresh();
            }}
            className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded text-sm font-semibold"
          >
            Process Trade
          </button>
        </div>
      )}
    </div>
  );
}

export function CreateTradeForm({ onCancel, onSuccess }: { onCancel: () => void; onSuccess: () => void }) {
  const { me } = useAuth();
  const user = me?.user;
  const { leagueId: currentLeagueId } = useLeague();
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const [myTeam, setMyTeam] = useState<any>(null);
  const [partners, setPartners] = useState<any[]>([]);

  const { toast } = useToast();
  const [myAssets, setMyAssets] = useState<any[]>([]);
  const [partnerAssets, setPartnerAssets] = useState<any[]>([]);

  useEffect(() => {
    if (!currentLeagueId) return;
    (async () => {
      try {
        const detail = await getLeague(currentLeagueId);
        const l = detail.league;
        const uid = user?.id ? Number(user.id) : undefined;
        const my = l.teams.find((t: any) => t.owner === user?.email || (uid && (t.ownerUserId === uid || (t.ownerships || []).some((o: any) => o.userId === uid))));

        if (my) {
          setMyTeam(my);
          setPartners(l.teams.filter((t: any) => t.id !== my.id));
        }
      } catch (e) {
        console.error("Failed to load league details", e);
      }
    })();
  }, [user, currentLeagueId]);

  const handlePropose = async () => {
    if (!myTeam || !selectedPartnerId) return;
    if (myAssets.length === 0 && partnerAssets.length === 0) {
      toast("Please select at least one item to trade.", "warning");
      return;
    }

    const allAssets = [...myAssets, ...partnerAssets];
    const badBudget = allAssets.find(a => a.assetType === "BUDGET" && (!a.amount || a.amount <= 0));
    if (badBudget) {
      toast("Budget amounts must be greater than zero.", "warning");
      return;
    }

    const items = [
      ...myAssets.map(a => ({ senderTeamId: myTeam.id, assetType: a.assetType, playerId: a.playerId, amount: a.amount })),
      ...partnerAssets.map(a => ({ senderTeamId: selectedPartnerId, assetType: a.assetType, playerId: a.playerId, amount: a.amount })),
    ];
    
    try {
       await proposeTrade({
         proposingTeamId: myTeam.id,
         acceptingTeamId: selectedPartnerId,
         items,
       });
       toast("Trade proposed successfully!", "success");
       onSuccess();
    } catch(e: any) {
      toast(e.message, "error");
    }
  };

  if (!myTeam) return <div className="p-4">Loading your team info...</div>;

  return (
    <div className="lg-card p-6">
      <h2 className="text-xl font-semibold mb-4 text-[var(--lg-text-heading)]">Propose Trade</h2>

      <div className="mb-4">
        <label className="block text-sm text-[var(--lg-text-muted)] mb-1">Trading Partner</label>
        <select
          className="w-full bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl p-2 text-[var(--lg-text-primary)]"
          value={selectedPartnerId ?? ""}
          onChange={e => setSelectedPartnerId(Number(e.target.value))}
        >
          <option value="">Select a team...</option>
          {partners.map((t: any) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {selectedPartnerId && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <TradeAssetSelector 
            teamId={myTeam.id} 
            label="You Give" 
            onAssetsChange={setMyAssets} 
          />
          <TradeAssetSelector 
            teamId={selectedPartnerId} 
            label="You Get (From Partner)" 
            onAssetsChange={setPartnerAssets} 
          />
        </div>
      )}

      <div className="flex justify-end space-x-2 pt-4 border-t border-[var(--lg-border-subtle)]">
        <button onClick={onCancel} className="px-4 py-2 text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]">Cancel</button>
        <button
           onClick={handlePropose}
           disabled={!selectedPartnerId || (myAssets.length === 0 && partnerAssets.length === 0)}
           className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Propose Trade
        </button>
      </div>
    </div>
  );
}
