import React, { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Pin,
  Activity,
  ArrowLeftRight,
  MessageCircle,
  Trophy,
  Flame,
  ThumbsUp,
  ThumbsDown,
  Laugh,
  MessageSquare,
  Clock,
  Shield,
  Send,
  ChevronRight,
  Users,
  MapPin,
  DollarSign,
  Sparkles,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────── */

type ColumnId = "pinned" | "activity" | "trade-block" | "banter";

interface Reaction {
  fire: number;
  laugh: number;
  up: number;
  down: number;
}

interface BoardCard {
  id: string;
  column: ColumnId;
  title: string;
  body: string;
  badge?: string;
  badgeColor?: string;
  timestamp: string;
  reactions: Reaction;
  replies?: number;
  author?: string;
  poll?: { options: string[]; votes: number[] };
}

/* ── Column config ──────────────────────────────────────────────── */

const COLUMNS: { id: ColumnId; label: string; icon: React.ElementType; accent: string; accentBg: string; accentBorder: string }[] = [
  { id: "pinned", label: "Pinned", icon: Pin, accent: "text-amber-500", accentBg: "bg-amber-500/10", accentBorder: "border-amber-500/30" },
  { id: "activity", label: "Activity", icon: Activity, accent: "text-blue-500", accentBg: "bg-blue-500/10", accentBorder: "border-blue-500/30" },
  { id: "trade-block", label: "Trade Block", icon: ArrowLeftRight, accent: "text-emerald-500", accentBg: "bg-emerald-500/10", accentBorder: "border-emerald-500/30" },
  { id: "banter", label: "Banter", icon: MessageCircle, accent: "text-purple-500", accentBg: "bg-purple-500/10", accentBorder: "border-purple-500/30" },
];

/* ── Seed data ──────────────────────────────────────────────────── */

const SEED_CARDS: BoardCard[] = [
  // Pinned
  {
    id: "p1",
    column: "pinned",
    title: "Trade Deadline: April 15",
    body: "All trades must be submitted by 11:59 PM ET. No exceptions.",
    badge: "Deadline",
    badgeColor: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
    timestamp: "Pinned",
    reactions: { fire: 2, laugh: 0, up: 8, down: 0 },
    replies: 4,
  },
  {
    id: "p2",
    column: "pinned",
    title: "Rule Change: Waiver budget increased to $200",
    body: "Effective immediately. Commissioner approved after league vote (7-3).",
    badge: "Commissioner",
    badgeColor: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
    timestamp: "2d ago",
    reactions: { fire: 1, laugh: 0, up: 6, down: 2 },
    replies: 7,
  },
  // Activity
  {
    id: "a1",
    column: "activity",
    title: "Trade Executed",
    body: "Los Doyers traded Will Smith (C) to Dodger Dawgs for Austin Riley (3B)",
    badge: "Trade",
    badgeColor: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
    timestamp: "2h ago",
    reactions: { fire: 5, laugh: 3, up: 2, down: 1 },
    replies: 12,
  },
  {
    id: "a2",
    column: "activity",
    title: "Waiver Won",
    body: "RGing Sluggers claimed Corbin Burnes ($15) \u2014 3.12 ERA, 42 K in 38 IP",
    badge: "Waiver",
    badgeColor: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
    timestamp: "5h ago",
    reactions: { fire: 3, laugh: 1, up: 4, down: 0 },
  },
  {
    id: "a3",
    column: "activity",
    title: "Period 2 Awards",
    body: "Manager of the Period: Demolition Lumber Co. (+12.5 pts)",
    badge: "Award",
    badgeColor: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
    timestamp: "1d ago",
    reactions: { fire: 7, laugh: 0, up: 9, down: 0 },
    replies: 3,
  },
  {
    id: "a4",
    column: "activity",
    title: "Stat Alert",
    body: "Juan Soto: 3-for-4, 2 HR, 5 RBI tonight",
    badge: "Live",
    badgeColor: "bg-red-500/20 text-red-500",
    timestamp: "Just now",
    reactions: { fire: 14, laugh: 2, up: 11, down: 0 },
    replies: 6,
  },
  // Trade Block
  {
    id: "t1",
    column: "trade-block",
    title: "Spencer Steer \u2014 Looking for SP",
    body: "1B/3B/OF eligible. Batting .285 with 8 HR. Will consider any mid-rotation arm.",
    badge: "1B/3B/OF",
    badgeColor: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
    timestamp: "6h ago",
    reactions: { fire: 1, laugh: 0, up: 3, down: 0 },
    replies: 2,
    author: "Los Doyers",
  },
  {
    id: "t2",
    column: "trade-block",
    title: "Brandon Lowe \u2014 Open to offers",
    body: "2B eligible. Consistent .270 hitter, 12 HR pace. Rebuilding for keepers.",
    badge: "2B",
    badgeColor: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
    timestamp: "1d ago",
    reactions: { fire: 0, laugh: 0, up: 2, down: 0 },
    author: "Skunk Dogs",
  },
  // Banter
  {
    id: "b1",
    column: "banter",
    title: "Who wins this trade?",
    body: "Will Smith for Austin Riley \u2014 cast your vote!",
    timestamp: "2h ago",
    reactions: { fire: 3, laugh: 4, up: 0, down: 0 },
    replies: 8,
    poll: { options: ["Los Doyers (Smith side)", "Dodger Dawgs (Riley side)"], votes: [14, 9] },
  },
  {
    id: "b2",
    column: "banter",
    title: "The Show is going down this year",
    body: "0-4 start and their best pitcher is on the IL. Season over before it started.",
    timestamp: "4h ago",
    reactions: { fire: 2, laugh: 11, up: 3, down: 5 },
    replies: 15,
  },
  {
    id: "b3",
    column: "banter",
    title: "Bold prediction: Skunk Dogs win it all",
    body: "Mark my words. Best keeper core in the league and deepest pitching staff.",
    timestamp: "Yesterday",
    reactions: { fire: 1, laugh: 6, up: 7, down: 4 },
    replies: 9,
  },
];

/* ── Reaction button ────────────────────────────────────────────── */

const REACTION_CONFIG: { key: keyof Reaction; icon: React.ElementType; label: string }[] = [
  { key: "fire", icon: Flame, label: "Fire" },
  { key: "laugh", icon: Laugh, label: "Laugh" },
  { key: "up", icon: ThumbsUp, label: "Thumbs up" },
  { key: "down", icon: ThumbsDown, label: "Thumbs down" },
];

function ReactionBar({
  reactions,
  onReact,
}: {
  reactions: Reaction;
  onReact: (key: keyof Reaction) => void;
}) {
  return (
    <div className="flex items-center gap-1 pt-2">
      {REACTION_CONFIG.map(({ key, icon: Icon, label }) => {
        const count = reactions[key];
        return (
          <button
            key={key}
            onClick={() => onReact(key)}
            aria-label={`${label} (${count})`}
            className="flex items-center gap-1 px-2 py-1.5 min-h-[44px] min-w-[44px] justify-center rounded-lg
              bg-[var(--lg-tint)] hover:bg-[var(--lg-tint-hover)] transition-colors text-[var(--lg-text-muted)]
              hover:text-[var(--lg-text-primary)] text-xs"
          >
            <Icon className="w-3.5 h-3.5" />
            {count > 0 && <span>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ── Board Card ─────────────────────────────────────────────────── */

function CardComponent({
  card,
  onReact,
}: {
  card: BoardCard;
  onReact: (cardId: string, key: keyof Reaction) => void;
}) {
  const [pollVoted, setPollVoted] = useState<number | null>(null);
  const [pollVotes, setPollVotes] = useState(card.poll?.votes ?? []);

  const handleVote = (idx: number) => {
    if (pollVoted !== null) return;
    setPollVoted(idx);
    setPollVotes((prev) => prev.map((v, i) => (i === idx ? v + 1 : v)));
  };

  const totalVotes = pollVotes.reduce((a, b) => a + b, 0);

  return (
    <div
      className="rounded-xl p-3.5 border border-[var(--lg-border-faint)]
        bg-[var(--lg-glass-bg)] hover:bg-[var(--lg-glass-bg-hover)]
        transition-all duration-200 hover:shadow-md"
    >
      {/* Badge + timestamp row */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          {card.badge && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${card.badgeColor}`}>
              {card.badge}
            </span>
          )}
          {card.author && (
            <span className="text-[10px] text-[var(--lg-text-muted)]">
              {card.author}
            </span>
          )}
        </div>
        <span className="text-[10px] text-[var(--lg-text-muted)] flex items-center gap-1 whitespace-nowrap">
          <Clock className="w-3 h-3" />
          {card.timestamp}
        </span>
      </div>

      {/* Title */}
      <h4 className="text-[13px] font-semibold text-[var(--lg-text-primary)] leading-snug mb-1">
        {card.title}
      </h4>

      {/* Body */}
      <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed">
        {card.body}
      </p>

      {/* Poll */}
      {card.poll && (
        <div className="mt-2.5 space-y-1.5">
          {card.poll.options.map((opt, idx) => {
            const pct = totalVotes > 0 ? Math.round((pollVotes[idx] / totalVotes) * 100) : 0;
            const isVoted = pollVoted === idx;
            return (
              <button
                key={idx}
                onClick={() => handleVote(idx)}
                disabled={pollVoted !== null}
                className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition-all relative overflow-hidden min-h-[44px]
                  ${isVoted
                    ? "border-purple-500/40 bg-purple-500/10"
                    : "border-[var(--lg-border-faint)] bg-[var(--lg-tint)] hover:bg-[var(--lg-tint-hover)]"
                  }
                  ${pollVoted !== null ? "cursor-default" : "cursor-pointer"}
                `}
              >
                {pollVoted !== null && (
                  <div
                    className="absolute inset-y-0 left-0 bg-purple-500/10 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                )}
                <span className="relative flex items-center justify-between">
                  <span className="text-[var(--lg-text-primary)]">{opt}</span>
                  {pollVoted !== null && (
                    <span className="text-[var(--lg-text-muted)] font-medium">{pct}%</span>
                  )}
                </span>
              </button>
            );
          })}
          <p className="text-[10px] text-[var(--lg-text-muted)]">{totalVotes} votes</p>
        </div>
      )}

      {/* Reactions + replies */}
      <div className="flex items-center justify-between">
        <ReactionBar reactions={card.reactions} onReact={(key) => onReact(card.id, key)} />
        {card.replies && (
          <span className="flex items-center gap-1 text-[10px] text-[var(--lg-text-muted)] pt-2">
            <MessageSquare className="w-3 h-3" />
            {card.replies}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── New Card Form ──────────────────────────────────────────────── */

function NewCardForm({ onPost }: { onPost: (text: string, column: ColumnId) => void }) {
  const [text, setText] = useState("");
  const [column, setColumn] = useState<ColumnId>("banter");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onPost(text.trim(), column);
    setText("");
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl p-3.5 border border-dashed border-[var(--lg-border-subtle)] bg-[var(--lg-tint)]">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Share a hot take, trash talk, or strategy tip..."
        rows={2}
        className="w-full text-xs bg-transparent border-none outline-none resize-none
          text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)]"
      />
      <div className="flex items-center justify-between gap-2 mt-2">
        <select
          value={column}
          onChange={(e) => setColumn(e.target.value as ColumnId)}
          className="text-[11px] px-2 py-1.5 rounded-lg bg-[var(--lg-input-bg)] border border-[var(--lg-input-border)]
            text-[var(--lg-text-primary)] outline-none min-h-[44px]"
        >
          {COLUMNS.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!text.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] rounded-lg text-xs font-medium
            bg-[var(--lg-accent)] text-white hover:opacity-90 transition-opacity
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="w-3.5 h-3.5" />
          Post
        </button>
      </div>
    </form>
  );
}

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
  const [cards, setCards] = useState<BoardCard[]>(SEED_CARDS);
  const [activeTab, setActiveTab] = useState<ColumnId>("pinned");

  const handleReact = useCallback((cardId: string, key: keyof Reaction) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? { ...c, reactions: { ...c.reactions, [key]: c.reactions[key] + 1 } }
          : c
      )
    );
  }, []);

  const handlePost = useCallback((text: string, column: ColumnId) => {
    const newCard: BoardCard = {
      id: `user-${Date.now()}`,
      column,
      title: text.length > 60 ? text.slice(0, 60) + "..." : text,
      body: text,
      timestamp: "Just now",
      reactions: { fire: 0, laugh: 0, up: 0, down: 0 },
      author: "You",
    };
    setCards((prev) => [newCard, ...prev]);
  }, []);

  const cardsByColumn = (col: ColumnId) => cards.filter((c) => c.column === col);

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
          Interactive prototypes — play with these before we build them
        </p>
      </div>

      {/* ── League Board Prototype ─────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-[var(--lg-accent)]" />
          <h2 className="text-lg font-semibold text-[var(--lg-text-heading)]">
            League Board
          </h2>
        </div>
        <p className="text-xs text-[var(--lg-text-muted)] mb-5 max-w-2xl">
          A card-based async communication board for your league. Commissioner announcements,
          auto-generated activity, trade block, and banter — all in one place.
        </p>

        {/* Mobile tab pills (visible < md) */}
        <div className="flex md:hidden gap-1.5 overflow-x-auto pb-3 -mx-1 px-1 scrollbar-hide">
          {COLUMNS.map((col) => {
            const Icon = col.icon;
            const isActive = activeTab === col.id;
            return (
              <button
                key={col.id}
                onClick={() => setActiveTab(col.id)}
                className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full text-xs font-medium whitespace-nowrap
                  transition-colors border
                  ${isActive
                    ? `${col.accentBg} ${col.accentBorder} ${col.accent}`
                    : "bg-[var(--lg-tint)] border-transparent text-[var(--lg-text-muted)] hover:bg-[var(--lg-tint-hover)]"
                  }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {col.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? col.accentBg : "bg-[var(--lg-tint)]"}`}>
                  {cardsByColumn(col.id).length}
                </span>
              </button>
            );
          })}
        </div>

        {/* New Card Form — mobile (shows above active column) */}
        <div className="md:hidden mb-4">
          <NewCardForm onPost={handlePost} />
        </div>

        {/* Mobile: single column view */}
        <div className="md:hidden space-y-3">
          {cardsByColumn(activeTab).map((card) => (
            <CardComponent key={card.id} card={card} onReact={handleReact} />
          ))}
          {cardsByColumn(activeTab).length === 0 && (
            <p className="text-xs text-[var(--lg-text-muted)] text-center py-8">
              No cards in this column yet.
            </p>
          )}
        </div>

        {/* Desktop: 4-column grid (hidden on mobile) */}
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const Icon = col.icon;
            const colCards = cardsByColumn(col.id);
            return (
              <div key={col.id} className="space-y-3">
                {/* Column header */}
                <div className={`flex items-center gap-2 px-1 pb-2 border-b-2 ${col.accentBorder}`}>
                  <Icon className={`w-4 h-4 ${col.accent}`} />
                  <span className={`text-xs font-semibold ${col.accent}`}>{col.label}</span>
                  <span className="text-[10px] text-[var(--lg-text-muted)] ml-auto">
                    {colCards.length}
                  </span>
                </div>

                {/* New card form in Banter column */}
                {col.id === "banter" && <NewCardForm onPost={handlePost} />}

                {/* Cards */}
                {colCards.map((card) => (
                  <CardComponent key={card.id} card={card} onReact={handleReact} />
                ))}
              </div>
            );
          })}
        </div>
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
          These are interactive prototypes. Play with them and share feedback.{" "}
          <Link to="/roadmap" className="text-[var(--lg-accent)] hover:underline">
            View Roadmap
          </Link>
        </p>
      </footer>
    </div>
  );
}
