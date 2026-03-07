import { useEffect, useState, useCallback } from "react";
import {
  getTrades,
  proposeTrade,
  respondToTrade,
  cancelTrade,
  voteOnTrade,
  processTrade,
  TradeProposal,
  getLeagues,
  getLeague,
} from "../../../api";
import { useAuth } from "../../../auth/AuthProvider";
import { TradeAssetSelector } from "../components/TradeAssetSelector";
import TeamRosterView from "../../teams/components/TeamRosterView";
import { Eye, Plus } from "lucide-react";
import PageHeader from "../../../components/ui/PageHeader";
import { Button } from "../../../components/ui/button";

export function TradesPage() {
  const { me } = useAuth();
  const user = me?.user;
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

  const myActive = myTrades.filter((t) => ["PENDING", "ACCEPTED"].includes(t.status));
  const myHistory = myTrades.filter((t) => !["PENDING", "ACCEPTED"].includes(t.status));

  if (!user && !loading) return <div className="p-4">Please log in to trade.</div>;
  if (loading && !myTrades.length) return <div className="p-4">Loading trades...</div>;
  if (error) return <div className="p-4 text-red-500">Error: {error}</div>;

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-12">
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
                <h2 className="text-2xl font-bold uppercase tracking-tight text-[var(--lg-text-heading)]">Active Trades</h2>
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
                <h2 className="text-2xl font-bold uppercase tracking-tight text-[var(--lg-text-heading)] opacity-60">Trade History</h2>
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
                <h2 className="text-2xl font-bold uppercase tracking-tight text-[var(--lg-text-heading)]">League Trades</h2>
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
              isAdmin={user?.isAdmin}
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
              <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-800">
                      <h3 className="font-bold text-lg">Trade Context</h3>
                      <button onClick={() => setContextTrade(null)} className="text-gray-400 hover:text-white">✕</button>
                  </div>
                  <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-950">
                      <TeamRosterView teamId={contextTrade.proposingTeamId ?? contextTrade.proposerId} teamName={contextTrade.proposingTeam?.name ?? "Proposer"} />
                      <TeamRosterView teamId={contextTrade.acceptingTeamId ?? 0} teamName={contextTrade.acceptingTeam?.name ?? "Counterparty"} />
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

function TradeCard({
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
  const isPending = trade.status === "PENDING";
  const isProposer = trade.proposingTeam?.ownerUserId === currentUserId;
  
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="text-lg font-bold">
            {trade.proposingTeam?.name ?? "Proposer"} <span className="text-gray-400 text-sm">offers to</span> {trade.acceptingTeam?.name ?? "Counterparty"}
          </div>
          <div className="text-xs text-gray-400">
            {new Date(trade.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div className="flex items-center gap-2">
            {onViewContext && (
                <button onClick={onViewContext} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white" title="View Context">
                    <Eye size={16} />
                </button>
            )}
            <div className="px-2 py-1 bg-gray-700 rounded text-xs font-mono uppercase">
              {trade.status}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-900/50 p-3 rounded">
          <div className="text-xs text-gray-500 uppercase font-bold mb-2">{trade.proposingTeam?.name ?? "Proposer"} Gives</div>
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
        <div className="bg-gray-900/50 p-3 rounded">
          <div className="text-xs text-gray-500 uppercase font-bold mb-2">{trade.acceptingTeam?.name ?? "Counterparty"} Gives</div>
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
               className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm transition-colors"
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
                 className="px-3 py-1 bg-red-900/50 hover:bg-red-900 text-red-200 rounded text-sm transition-colors"
               >
                 Reject
               </button>
               <button
                 onClick={async () => {
                    if (!confirm("Accept trade?")) return;
                    await respondToTrade(trade.id, "ACCEPT");
                    onRefresh();
                 }}
                 className="px-3 py-1 bg-green-900/50 hover:bg-green-900 text-green-200 rounded text-sm transition-colors"
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

function LeagueTradeCard({
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
  const isInvolved = trade.proposingTeam.ownerUserId === currentUserId || trade.acceptingTeam.ownerUserId === currentUserId;
  const canVote = !isInvolved && trade.status === "ACCEPTED";
  
  const myVote = trade.votes?.find((v: any) => v.team?.id && v.team.id === currentUserId);
  const vetoCount = trade.votes?.filter((v: any) => v.vote === "VETO").length || 0;
  const approveCount = trade.votes?.filter((v: any) => v.vote === "APPROVE").length || 0;

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="text-lg font-bold">
            {trade.proposingTeam.name} <span className="text-gray-400 text-sm">↔</span> {trade.acceptingTeam.name}
          </div>
          <div className="text-xs text-gray-400">
            {new Date(trade.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div className="flex items-center gap-2">
            {onViewContext && (
                <button onClick={onViewContext} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white" title="View Context">
                    <Eye size={16} />
                </button>
            )}
            <div className="px-2 py-1 bg-gray-700 rounded text-xs font-mono uppercase">
              {trade.status}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-900/50 p-3 rounded">
          <div className="text-xs text-gray-500 uppercase font-bold mb-2">{trade.proposingTeam?.name ?? "Proposer"} Gives</div>
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
        <div className="bg-gray-900/50 p-3 rounded">
          <div className="text-xs text-gray-500 uppercase font-bold mb-2">{trade.acceptingTeam.name} Gives</div>
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

      {/* Vote counts */}
      {trade.status === "ACCEPTED" && (
        <div className="flex items-center space-x-4 mb-3 text-sm">
          <span className="text-green-400">✓ {approveCount} Approve</span>
          <span className="text-red-400">✗ {vetoCount} Veto</span>
        </div>
      )}

      {/* Voting Controls */}
      {canVote && (
        <div className="flex justify-end space-x-2 mb-2">
          {myVote ? (
            <div className="text-sm text-gray-400">You voted: {myVote.vote}</div>
          ) : (
            <>
              <button
                onClick={async () => {
                  await voteOnTrade(trade.id, "APPROVE");
                  onRefresh();
                }}
                className="px-3 py-1 bg-green-900/50 hover:bg-green-900 text-green-200 rounded text-sm"
              >
                Approve
              </button>
              <button
                onClick={async () => {
                  await voteOnTrade(trade.id, "VETO");
                  onRefresh();
                }}
                className="px-3 py-1 bg-red-900/50 hover:bg-red-900 text-red-200 rounded text-sm"
              >
                Veto
              </button>
            </>
          )}
        </div>
      )}

      {/* Commissioner Controls */}
      {isAdmin && trade.status === "ACCEPTED" && (
        <div className="flex justify-end space-x-2 border-t border-gray-700 pt-3 mt-3">
          <button
            onClick={async () => {
              if (!confirm("Veto this trade?")) return;
              await processTrade(trade.id, "VETO");
              onRefresh();
            }}
            className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded text-sm font-semibold"
          >
            Commissioner Veto
          </button>
          <button
            onClick={async () => {
              if (!confirm("Process this trade? Players and budget will be moved.")) return;
              await processTrade(trade.id, "PROCESS");
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

function CreateTradeForm({ onCancel, onSuccess }: { onCancel: () => void; onSuccess: () => void }) {
  const { me } = useAuth();
  const user = me?.user;
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const [myTeam, setMyTeam] = useState<any>(null);
  const [partners, setPartners] = useState<any[]>([]);
  
  const [myAssets, setMyAssets] = useState<any[]>([]);
  const [partnerAssets, setPartnerAssets] = useState<any[]>([]);

  useEffect(() => {
    getLeagues().then(async (res) => {
      if (res.leagues.length > 0) {
        for (const ls of res.leagues) {
          try {
             const detail = await getLeague(ls.id);
             const l = detail.league;
             const my = l.teams.find((t) => t.owner === user?.email || (user?.id && t.ownerUserId === Number(user.id)));
             
             if (my) {
               setMyTeam(my);
               setPartners(l.teams.filter(t => t.id !== my.id));
               break; 
             }
          } catch (e) {
            console.error("Failed to load league details", e);
          }
        }
      }
    });
  }, [user]);

  const handlePropose = async () => {
    if (!myTeam || !selectedPartnerId) return;
    if (myAssets.length === 0 && partnerAssets.length === 0) {
      alert("Please select at least one item to trade.");
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
       alert("Trade proposed successfully!");
       onSuccess();
    } catch(e: any) {
      alert("Error: " + e.message);
    }
  };

  if (!myTeam) return <div className="p-4">Loading your team info...</div>;

  return (
    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
      <h2 className="text-xl font-bold mb-4">Propose Trade</h2>
      
      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-1">Trading Partner</label>
        <select 
          className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
          value={selectedPartnerId ?? ""}
          onChange={e => setSelectedPartnerId(Number(e.target.value))}
        >
          <option value="">Select a team...</option>
          {partners.map((t: any) => (
            <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
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

      <div className="flex justify-end space-x-2 pt-4 border-t border-gray-700">
        <button onClick={onCancel} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
        <button 
           onClick={handlePropose}
           disabled={!selectedPartnerId || (myAssets.length === 0 && partnerAssets.length === 0)}
           className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Propose Trade
        </button>
      </div>
    </div>
  );
}
