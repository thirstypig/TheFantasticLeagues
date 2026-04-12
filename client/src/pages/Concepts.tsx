import { Link } from "react-router-dom";
import {
  ChevronRight,
  Users,
  MapPin,
  Sparkles,
} from "lucide-react";
import { useLeague } from "../contexts/LeagueContext";
import LeagueBoard from "../features/board/components/LeagueBoard";
import AdminCrossNav from "../features/admin/components/AdminCrossNav";

/* ── Coming Soon marketplace cards ──────────────────────────────── */

const MARKETPLACE_CARDS = [
  {
    name: "OGBA 2027 \u2014 NL-Only Roto",
    details: "1 spot open \u00b7 $50 buy-in \u00b7 Keeper league \u00b7 7 years running",
    spots: 1,
  },
  {
    name: "Dynasty Baseball League",
    details: "2 spots open \u00b7 Free \u00b7 H2H Points \u00b7 Year-round trading",
    spots: 2,
  },
  {
    name: "Competitive 5x5 Roto",
    details: "3 spots open \u00b7 $100 buy-in \u00b7 Redraft \u00b7 Est. 2018",
    spots: 3,
  },
];

/* ── Main Page ──────────────────────────────────────────────────── */

export default function Concepts() {
  const { leagueId } = useLeague();

  return (
    <div className="px-4 py-6 md:px-6 md:py-10 max-w-7xl mx-auto space-y-10">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-semibold text-[var(--lg-text-heading)]">
            Concepts Lab
          </h1>
          <span className="text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400">
            BETA
          </span>
        </div>
        <p className="text-sm text-[var(--lg-text-secondary)]">
          Live features and upcoming prototypes
        </p>
        <AdminCrossNav />
      </div>

      {/* ── League Board (REAL) ─────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--lg-accent)]" />
            <h2 className="text-lg font-semibold text-[var(--lg-text-heading)]">
              League Board
            </h2>
            <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              LIVE
            </span>
          </div>
          <Link
            to="/board"
            className="flex items-center gap-1 text-xs font-medium text-[var(--lg-accent)] hover:underline"
          >
            Full page <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <p className="text-xs text-[var(--lg-text-muted)] mb-5 max-w-2xl">
          A 3-column async board for your league: Commissioner announcements, Trade Block,
          and Banter. Click any card to open a threaded conversation with replies.
        </p>

        <LeagueBoard leagueId={leagueId} />
      </section>

      {/* ── Coming Soon: Community Marketplace ─────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-5 h-5 text-[var(--lg-accent)]" />
          <h2 className="text-lg font-semibold text-[var(--lg-text-heading)]">
            Community Marketplace
          </h2>
          <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-[var(--lg-tint)] text-[var(--lg-text-muted)]">
            COMING SOON
          </span>
        </div>
        <p className="text-xs text-[var(--lg-text-muted)] mb-5 max-w-2xl">
          Find leagues looking for players. Post your team for adoption. Browse by format, buy-in, and timezone.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MARKETPLACE_CARDS.map((listing, i) => (
            <div
              key={i}
              className="rounded-xl p-4 border border-[var(--lg-border-faint)]
                bg-[var(--lg-glass-bg)] hover:bg-[var(--lg-glass-bg-hover)]
                transition-all duration-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-semibold text-[var(--lg-text-primary)]">
                  {listing.name}
                </h3>
                <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                  <MapPin className="w-3 h-3" />
                  {listing.spots} open
                </span>
              </div>
              <p className="text-xs text-[var(--lg-text-muted)]">{listing.details}</p>
              <button
                className="mt-3 flex items-center gap-1 text-xs font-medium text-[var(--lg-accent)] hover:underline"
                onClick={() => {}}
              >
                View details <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--lg-border-faint)] pt-6 pb-4">
        <p className="text-xs text-[var(--lg-text-muted)] text-center">
          Live features and upcoming prototypes.{" "}
          <Link to="/roadmap" className="text-[var(--lg-accent)] hover:underline">
            View Roadmap
          </Link>
        </p>
      </footer>
    </div>
  );
}
