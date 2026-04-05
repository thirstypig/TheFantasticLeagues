import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Megaphone, ShoppingBag, Users, Globe } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import { getPublicLeagues, type PublicLeagueListItem } from "../features/leagues/api";

/* -- Channel config --------------------------------------------------------- */

type ChannelId = "leagues" | "announcements" | "marketplace" | "general";

const CHANNELS: {
  id: ChannelId;
  label: string;
  icon: React.ElementType;
  accent: string;
  accentBg: string;
  description: string;
}[] = [
  {
    id: "leagues",
    label: "Open Leagues",
    icon: Globe,
    accent: "text-blue-500",
    accentBg: "bg-blue-500/10",
    description: "Browse public and open leagues looking for new members",
  },
  {
    id: "announcements",
    label: "Announcements",
    icon: Megaphone,
    accent: "text-amber-500",
    accentBg: "bg-amber-500/10",
    description: "Platform updates and news (admin only)",
  },
  {
    id: "marketplace",
    label: "Marketplace",
    icon: ShoppingBag,
    accent: "text-emerald-500",
    accentBg: "bg-emerald-500/10",
    description: "League listings and free agent postings",
  },
  {
    id: "general",
    label: "General",
    icon: MessageCircle,
    accent: "text-purple-500",
    accentBg: "bg-purple-500/10",
    description: "Open discussion for the TFL community",
  },
];

/* -- Sample cards for non-leagues channels ---------------------------------- */

const SAMPLE_CARDS = [
  {
    channel: "announcements" as ChannelId,
    title: "Welcome to TFL Community",
    body: "The community board is launching soon. Stay tuned for league listings, free agent postings, and open discussion.",
    type: "announcement",
  },
  {
    channel: "marketplace" as ChannelId,
    title: "OGBA 2026 - NL-Only Roto (12 teams)",
    body: "Established NL-only rotisserie league entering its 30th season. $400 auction budget, keeper format. Looking for experienced fantasy baseball managers.",
    type: "league_listing",
    metadata: { sport: "Baseball", format: "Roto / Auction / Keepers", buyIn: "$100", spotsOpen: 0 },
  },
];

/* -- Component -------------------------------------------------------------- */

export default function ProductBoard() {
  const [activeChannel, setActiveChannel] = useState<ChannelId>("leagues");
  const [publicLeagues, setPublicLeagues] = useState<PublicLeagueListItem[]>([]);
  const [leaguesLoading, setLeaguesLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (activeChannel !== "leagues") return;
    setLeaguesLoading(true);
    getPublicLeagues()
      .then((resp) => setPublicLeagues(resp.leagues ?? []))
      .catch(() => setPublicLeagues([]))
      .finally(() => setLeaguesLoading(false));
  }, [activeChannel]);

  const channelCards = SAMPLE_CARDS.filter((c) => c.channel === activeChannel);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <div className="flex items-center gap-3 mb-6">
        <PageHeader
          title="Community"
          subtitle="Connect with fantasy sports managers across TFL"
        />
      </div>

      {/* Channel tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 scrollbar-hide">
        {CHANNELS.map((ch) => {
          const Icon = ch.icon;
          const isActive = activeChannel === ch.id;
          return (
            <button
              key={ch.id}
              onClick={() => setActiveChannel(ch.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium whitespace-nowrap
                transition-colors border
                ${isActive
                  ? `${ch.accentBg} border-current ${ch.accent}`
                  : "bg-[var(--lg-tint)] border-transparent text-[var(--lg-text-muted)] hover:bg-[var(--lg-tint-hover)]"
                }`}
            >
              <Icon className="w-4 h-4" />
              {ch.label}
            </button>
          );
        })}
      </div>

      {/* Channel description */}
      {(() => {
        const ch = CHANNELS.find((c) => c.id === activeChannel);
        return ch ? (
          <p className="text-xs text-[var(--lg-text-muted)] mb-4">{ch.description}</p>
        ) : null;
      })()}

      {/* Leagues Channel */}
      {activeChannel === "leagues" && (
        <div className="space-y-4">
          {leaguesLoading ? (
            <div className="text-center py-16 text-sm text-[var(--lg-text-muted)]">Loading leagues...</div>
          ) : publicLeagues.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3 opacity-30">
                <Globe className="w-12 h-12 mx-auto opacity-30" />
              </div>
              <p className="text-sm text-[var(--lg-text-muted)]">
                No public leagues available yet.
              </p>
              <p className="text-xs text-[var(--lg-text-muted)] mt-1 opacity-60">
                Create a league and set visibility to "Public" or "Open" to list it here.
              </p>
            </div>
          ) : (
            publicLeagues.map((lg) => {
              const spotsLeft = lg.maxTeams - lg.teamsFilled;
              return (
                <div
                  key={lg.id}
                  className="rounded-2xl p-4 border border-[var(--lg-border-faint)] bg-[var(--lg-glass-bg)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          lg.visibility === "OPEN"
                            ? "bg-green-500/15 text-green-600 dark:text-green-400"
                            : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                        }`}>
                          {lg.visibility === "OPEN" ? "Open — Join Now" : "Public — Request to Join"}
                        </span>
                        {lg.entryFee != null && lg.entryFee > 0 && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                            ${lg.entryFee} entry
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-semibold text-[var(--lg-text-primary)] mb-1">
                        {lg.name} ({lg.season})
                      </h3>

                      {lg.description && (
                        <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed mb-2">
                          {lg.description}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-3 text-[10px] text-[var(--lg-text-muted)]">
                        <span className="capitalize">{lg.sport}</span>
                        <span>{lg.scoringFormat?.replace("_", " ")}</span>
                        <span>{lg.draftMode}</span>
                        <span>{lg.teamsFilled}/{lg.maxTeams} teams</span>
                        {lg.commissioner && <span>Commish: {lg.commissioner}</span>}
                      </div>
                    </div>

                    <div className="shrink-0">
                      {spotsLeft > 0 ? (
                        <button
                          onClick={() => navigate(`/join/${lg.id}`)}
                          className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--lg-accent)] text-white hover:bg-[var(--lg-accent-hover)] transition-colors"
                        >
                          {lg.visibility === "OPEN" ? "Join Now" : "Request"}
                        </button>
                      ) : (
                        <span className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--lg-tint)] text-[var(--lg-text-muted)]">
                          Full
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Other channel cards */}
      {activeChannel !== "leagues" && (
        <div className="space-y-4">
          {channelCards.map((card, i) => (
            <div
              key={i}
              className="rounded-2xl p-4 border border-[var(--lg-border-faint)] bg-[var(--lg-glass-bg)]"
            >
              <div className="flex items-center gap-2 mb-2">
                {card.type === "league_listing" && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    League Listing
                  </span>
                )}
                {card.type === "announcement" && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    Announcement
                  </span>
                )}
              </div>

              <h3 className="text-sm font-semibold text-[var(--lg-text-primary)] mb-1">
                {card.title}
              </h3>
              <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed mb-3">
                {card.body}
              </p>

              {card.metadata && (
                <div className="flex flex-wrap gap-3 text-[10px] text-[var(--lg-text-muted)]">
                  {card.metadata.sport && (
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {card.metadata.sport}
                    </span>
                  )}
                  {card.metadata.format && (
                    <span>{card.metadata.format}</span>
                  )}
                  {card.metadata.buyIn && (
                    <span className="font-medium">Buy-in: {card.metadata.buyIn}</span>
                  )}
                  {card.metadata.spotsOpen !== undefined && (
                    <span className={card.metadata.spotsOpen > 0 ? "text-emerald-500 font-semibold" : "text-[var(--lg-text-muted)]"}>
                      {card.metadata.spotsOpen > 0 ? `${card.metadata.spotsOpen} spots open` : "Full"}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}

          {channelCards.length === 0 && (
            <div className="text-center py-16">
              <p className="text-sm text-[var(--lg-text-muted)]">
                No posts in this channel yet.
              </p>
              <p className="text-xs text-[var(--lg-text-muted)] mt-1 opacity-60">
                This feature is coming soon.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
