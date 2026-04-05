import React, { useState, useEffect, useCallback } from "react";
import {
  Pin,
  Activity,
  ArrowLeftRight,
  MessageCircle,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Clock,
  Send,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatRelativeTime } from "../../../lib/timeUtils";
import {
  getBoardCards,
  createBoardCard,
  voteBoardCard,
  replyToBoardCard,
  deleteBoardCard,
  type BoardCard,
  type BoardReply,
} from "../api";
import { useAuth } from "../../../auth/AuthProvider";

/* ── Column config ──────────────────────────────────────────────── */

type ColumnId = "pinned" | "activity" | "trade_block" | "banter";

const COLUMNS: {
  id: ColumnId;
  label: string;
  icon: React.ElementType;
  accent: string;
  accentBg: string;
  accentBorder: string;
}[] = [
  { id: "pinned", label: "Pinned", icon: Pin, accent: "text-amber-500", accentBg: "bg-amber-500/10", accentBorder: "border-amber-500/30" },
  { id: "activity", label: "Activity", icon: Activity, accent: "text-blue-500", accentBg: "bg-blue-500/10", accentBorder: "border-blue-500/30" },
  { id: "trade_block", label: "Trade Block", icon: ArrowLeftRight, accent: "text-emerald-500", accentBg: "bg-emerald-500/10", accentBorder: "border-emerald-500/30" },
  { id: "banter", label: "Banter", icon: MessageCircle, accent: "text-purple-500", accentBg: "bg-purple-500/10", accentBorder: "border-purple-500/30" },
];

/* ── Reaction Bar ───────────────────────────────────────────────── */

function ReactionBar({
  thumbsUp,
  thumbsDown,
  myVote,
  onVote,
}: {
  thumbsUp: number;
  thumbsDown: number;
  myVote: "up" | "down" | null;
  onVote: (vote: "up" | "down") => void;
}) {
  return (
    <div className="flex items-center gap-1 pt-2">
      <button
        onClick={() => onVote("up")}
        aria-label={`Thumbs up (${thumbsUp})`}
        className={`flex items-center gap-1 px-2 py-1.5 min-h-[44px] min-w-[44px] justify-center rounded-lg
          transition-colors text-xs
          ${myVote === "up"
            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "bg-[var(--lg-tint)] hover:bg-[var(--lg-tint-hover)] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]"
          }`}
      >
        <ThumbsUp className="w-3.5 h-3.5" />
        {thumbsUp > 0 && <span>{thumbsUp}</span>}
      </button>
      <button
        onClick={() => onVote("down")}
        aria-label={`Thumbs down (${thumbsDown})`}
        className={`flex items-center gap-1 px-2 py-1.5 min-h-[44px] min-w-[44px] justify-center rounded-lg
          transition-colors text-xs
          ${myVote === "down"
            ? "bg-red-500/15 text-red-600 dark:text-red-400"
            : "bg-[var(--lg-tint)] hover:bg-[var(--lg-tint-hover)] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]"
          }`}
      >
        <ThumbsDown className="w-3.5 h-3.5" />
        {thumbsDown > 0 && <span>{thumbsDown}</span>}
      </button>
    </div>
  );
}

/* ── Reply Section ──────────────────────────────────────────────── */

function ReplySection({
  replies,
  cardId,
  onReply,
}: {
  replies: BoardReply[];
  cardId: number;
  onReply: (cardId: number, body: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onReply(cardId, replyText.trim());
      setReplyText("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] transition-colors"
      >
        <MessageSquare className="w-3 h-3" />
        {replies.length} {replies.length === 1 ? "reply" : "replies"}
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {replies.map((r) => (
            <div key={r.id} className="pl-3 border-l-2 border-[var(--lg-border-faint)]">
              <div className="flex items-center gap-2 text-[10px] text-[var(--lg-text-muted)]">
                <span className="font-medium text-[var(--lg-text-secondary)]">{r.user?.name ?? "Unknown"}</span>
                <span>{formatRelativeTime(r.createdAt)}</span>
              </div>
              <p className="text-xs text-[var(--lg-text-primary)] mt-0.5">{r.body}</p>
            </div>
          ))}

          <form onSubmit={handleSubmit} className="flex gap-2 mt-2">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Reply..."
              className="flex-1 text-xs px-2 py-1.5 min-h-[44px] rounded-lg bg-[var(--lg-input-bg)] border border-[var(--lg-input-border)]
                text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)] outline-none"
            />
            <button
              type="submit"
              disabled={!replyText.trim() || submitting}
              className="px-3 py-1.5 min-h-[44px] rounded-lg text-xs font-medium
                bg-[var(--lg-accent)] text-white hover:opacity-90 transition-opacity
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ── Card Component ─────────────────────────────────────────────── */

function CardComponent({
  card,
  onVote,
  onReply,
  onDelete,
  currentUserId,
  isCommissioner,
}: {
  card: BoardCard;
  onVote: (cardId: number, vote: "up" | "down") => void;
  onReply: (cardId: number, body: string) => Promise<void>;
  onDelete: (cardId: number) => void;
  currentUserId: number;
  isCommissioner: boolean;
}) {
  const canDelete = card.userId === currentUserId || isCommissioner;

  const typeBadge = (() => {
    switch (card.type) {
      case "trade": return { label: "Trade", cls: "bg-blue-500/20 text-blue-600 dark:text-blue-400" };
      case "waiver": return { label: "Waiver", cls: "bg-blue-500/20 text-blue-600 dark:text-blue-400" };
      case "stat_alert": return { label: "Live", cls: "bg-red-500/20 text-red-500" };
      case "award": return { label: "Award", cls: "bg-amber-500/20 text-amber-600 dark:text-amber-400" };
      case "poll": return { label: "Poll", cls: "bg-purple-500/20 text-purple-600 dark:text-purple-400" };
      case "system": return { label: "System", cls: "bg-blue-500/20 text-blue-600 dark:text-blue-400" };
      default: return null;
    }
  })();

  return (
    <div
      className="rounded-2xl p-3.5 border border-[var(--lg-border-faint)]
        bg-[var(--lg-glass-bg)] hover:bg-[var(--lg-glass-bg-hover)]
        transition-all duration-200 hover:shadow-md"
    >
      {/* Badge + timestamp row */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          {typeBadge && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${typeBadge.cls}`}>
              {typeBadge.label}
            </span>
          )}
          {card.user?.name && (
            <span className="text-[10px] text-[var(--lg-text-muted)]">
              {card.user.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--lg-text-muted)] flex items-center gap-1 whitespace-nowrap">
            <Clock className="w-3 h-3" />
            {formatRelativeTime(card.createdAt)}
          </span>
          {canDelete && (
            <button
              onClick={() => onDelete(card.id)}
              className="p-1 rounded text-[var(--lg-text-muted)] hover:text-red-500 transition-colors"
              aria-label="Delete card"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <h4 className="text-[13px] font-semibold text-[var(--lg-text-primary)] leading-snug mb-1">
        {card.title}
      </h4>

      {/* Body */}
      {card.body && (
        <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed">
          {card.body}
        </p>
      )}

      {/* Reactions + replies */}
      <div className="flex items-center justify-between">
        <ReactionBar
          thumbsUp={card.thumbsUp}
          thumbsDown={card.thumbsDown}
          myVote={card.myVote}
          onVote={(vote) => onVote(card.id, vote)}
        />
        <ReplySection replies={card.replies} cardId={card.id} onReply={onReply} />
      </div>
    </div>
  );
}

/* ── New Card Form ──────────────────────────────────────────────── */

function NewCardForm({
  onPost,
  defaultColumn,
}: {
  onPost: (title: string, body: string, column: ColumnId) => Promise<void>;
  defaultColumn?: ColumnId;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [column, setColumn] = useState<ColumnId>(defaultColumn ?? "banter");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onPost(title.trim(), body.trim(), column);
      setTitle("");
      setBody("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl p-3.5 border border-dashed border-[var(--lg-border-subtle)] bg-[var(--lg-tint)]">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title..."
        maxLength={200}
        className="w-full text-xs font-medium bg-transparent border-none outline-none mb-1
          text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)]"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share a hot take, trash talk, or strategy tip..."
        rows={2}
        maxLength={2000}
        className="w-full text-xs bg-transparent border-none outline-none resize-none
          text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)]"
      />
      <div className="flex items-center justify-between gap-2 mt-2">
        {!defaultColumn && (
          <select
            value={column}
            onChange={(e) => setColumn(e.target.value as ColumnId)}
            className="text-[11px] px-2 py-1.5 rounded-lg bg-[var(--lg-input-bg)] border border-[var(--lg-input-border)]
              text-[var(--lg-text-primary)] outline-none min-h-[44px]"
          >
            {COLUMNS.filter((c) => c.id !== "pinned").map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        )}
        <button
          type="submit"
          disabled={!title.trim() || submitting}
          className="flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] rounded-lg text-xs font-medium
            bg-[var(--lg-accent)] text-white hover:opacity-90 transition-opacity
            disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
        >
          <Send className="w-3.5 h-3.5" />
          Post
        </button>
      </div>
    </form>
  );
}

/* ── Main Board Component ───────────────────────────────────────── */

export default function LeagueBoard({ leagueId }: { leagueId: number }) {
  const { me } = useAuth();
  const currentUserId = me?.user?.id ? Number(me.user.id) : 0;
  const isCommissioner =
    me?.user?.isAdmin ||
    me?.user?.memberships?.some(
      (m: any) => Number(m.leagueId) === leagueId && m.role === "COMMISSIONER"
    ) ||
    false;

  const [cards, setCards] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ColumnId>("pinned");

  const loadCards = useCallback(async () => {
    if (!leagueId) return;
    try {
      const res = await getBoardCards({ leagueId, limit: 100 });
      setCards(res.items);
    } catch (err) {
      console.error("Failed to load board cards:", err);
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const handlePost = useCallback(
    async (title: string, body: string, column: ColumnId) => {
      await createBoardCard({ leagueId, column, title, body, type: "user" });
      await loadCards();
    },
    [leagueId, loadCards]
  );

  const handleVote = useCallback(
    async (cardId: number, vote: "up" | "down") => {
      const result = await voteBoardCard(cardId, vote);
      setCards((prev) =>
        prev.map((c) => {
          if (c.id !== cardId) return c;
          const oldVote = c.myVote;
          let thumbsUp = c.thumbsUp;
          let thumbsDown = c.thumbsDown;

          // Adjust counts based on old and new vote
          if (oldVote === vote) {
            // Toggle off
            if (vote === "up") thumbsUp--;
            else thumbsDown--;
          } else {
            if (oldVote === "up") thumbsUp--;
            if (oldVote === "down") thumbsDown--;
            if (result.myVote === "up") thumbsUp++;
            if (result.myVote === "down") thumbsDown++;
          }

          return { ...c, myVote: result.myVote, thumbsUp, thumbsDown };
        })
      );
    },
    []
  );

  const handleReply = useCallback(
    async (cardId: number, body: string) => {
      const reply = await replyToBoardCard(cardId, body);
      setCards((prev) =>
        prev.map((c) =>
          c.id === cardId
            ? { ...c, replies: [...c.replies, reply], replyCount: c.replyCount + 1 }
            : c
        )
      );
    },
    []
  );

  const handleDelete = useCallback(
    async (cardId: number) => {
      if (!confirm("Delete this card?")) return;
      await deleteBoardCard(cardId);
      setCards((prev) => prev.filter((c) => c.id !== cardId));
    },
    []
  );

  const cardsByColumn = (col: ColumnId) => cards.filter((c) => c.column === col);

  if (loading) {
    return (
      <div className="text-center text-[var(--lg-text-muted)] py-20 animate-pulse text-sm">
        Loading board...
      </div>
    );
  }

  return (
    <div>
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

      {/* Mobile: new card form + single column view */}
      <div className="md:hidden mb-4">
        <NewCardForm onPost={handlePost} />
      </div>
      <div className="md:hidden space-y-3">
        {cardsByColumn(activeTab).map((card) => (
          <CardComponent
            key={card.id}
            card={card}
            onVote={handleVote}
            onReply={handleReply}
            onDelete={handleDelete}
            currentUserId={currentUserId}
            isCommissioner={isCommissioner}
          />
        ))}
        {cardsByColumn(activeTab).length === 0 && (
          <p className="text-xs text-[var(--lg-text-muted)] text-center py-8">
            No cards in this column yet. Be the first to post!
          </p>
        )}
      </div>

      {/* Desktop: 4-column grid */}
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
              {col.id === "banter" && <NewCardForm onPost={handlePost} defaultColumn="banter" />}

              {/* Cards */}
              {colCards.map((card) => (
                <CardComponent
                  key={card.id}
                  card={card}
                  onVote={handleVote}
                  onReply={handleReply}
                  onDelete={handleDelete}
                  currentUserId={currentUserId}
                  isCommissioner={isCommissioner}
                />
              ))}

              {colCards.length === 0 && (
                <p className="text-xs text-[var(--lg-text-muted)] text-center py-6">
                  No cards yet.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
