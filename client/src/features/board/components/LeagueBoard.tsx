import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Shield,
  ArrowLeftRight,
  MessageCircle,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Clock,
  Send,
  Trash2,
  X,
  Plus,
  ChevronDown,
} from "lucide-react";
import { formatRelativeTime } from "../../../lib/timeUtils";
import {
  getBoardCards,
  createBoardCard,
  voteBoardCard,
  replyToBoardCard,
  deleteBoardCard,
  type BoardCard,
} from "../api";
import { useAuth } from "../../../auth/AuthProvider";
import PlayerDetailModal from "../../../components/shared/PlayerDetailModal";

/* -- Column config -------------------------------------------------------- */

type ColumnId = "commissioner" | "trade_block" | "banter";

const COLUMNS: {
  id: ColumnId;
  label: string;
  icon: React.ElementType;
  accent: string;
  accentBg: string;
  accentBorder: string;
}[] = [
  {
    id: "commissioner",
    label: "Commissioner",
    icon: Shield,
    accent: "text-amber-500",
    accentBg: "bg-amber-500/10",
    accentBorder: "border-amber-500/30",
  },
  {
    id: "trade_block",
    label: "Trade Block",
    icon: ArrowLeftRight,
    accent: "text-emerald-500",
    accentBg: "bg-emerald-500/10",
    accentBorder: "border-emerald-500/30",
  },
  {
    id: "banter",
    label: "Banter",
    icon: MessageCircle,
    accent: "text-purple-500",
    accentBg: "bg-purple-500/10",
    accentBorder: "border-purple-500/30",
  },
];

/* -- Reaction Bar --------------------------------------------------------- */

function ReactionBar({
  thumbsUp,
  thumbsDown,
  myVote,
  onVote,
  disabled,
}: {
  thumbsUp: number;
  thumbsDown: number;
  myVote: "up" | "down" | null;
  onVote: (vote: "up" | "down") => void;
  disabled?: boolean;
}) {
  if (disabled) return null;
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={(e) => { e.stopPropagation(); onVote("up"); }}
        aria-label={`Thumbs up (${thumbsUp})`}
        className={`flex items-center gap-1 px-2 py-1.5 min-h-[36px] min-w-[36px] justify-center rounded-lg
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
        onClick={(e) => { e.stopPropagation(); onVote("down"); }}
        aria-label={`Thumbs down (${thumbsDown})`}
        className={`flex items-center gap-1 px-2 py-1.5 min-h-[36px] min-w-[36px] justify-center rounded-lg
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

/* -- Card Detail Panel (Desktop slide-over) ------------------------------- */

function CardDetailPanel({
  card,
  onClose,
  onVote,
  onReply,
  onDelete,
  currentUserId,
  isCommissioner,
}: {
  card: BoardCard;
  onClose: () => void;
  onVote: (cardId: number, vote: "up" | "down") => void;
  onReply: (cardId: number, body: string) => Promise<void>;
  onDelete: (cardId: number) => void;
  currentUserId: number;
  isCommissioner: boolean;
}) {
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canDelete = card.userId === currentUserId || isCommissioner;
  const isCommissionerCard = card.column === "commissioner";
  const isTradeBlock = card.column === "trade_block";

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onReply(card.id, replyText.trim());
      setReplyText("");
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const col = COLUMNS.find((c) => c.id === card.column);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] animate-in fade-in duration-150"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed top-0 right-0 z-50 h-full w-full sm:w-[420px] flex flex-col
          bg-[var(--lg-glass-bg)] backdrop-blur-[var(--lg-glass-blur)]
          border-l border-[var(--lg-glass-border)] shadow-2xl
          animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className={`flex items-center justify-between gap-3 px-5 py-4 border-b
          ${isCommissionerCard ? "border-amber-500/30 bg-amber-500/5" : "border-[var(--lg-glass-border)]"}`}>
          <div className="flex items-center gap-2 min-w-0">
            {col && (
              <span className={`flex items-center gap-1.5 text-xs font-semibold ${col.accent}`}>
                <col.icon className="w-4 h-4" />
                {col.label}
              </span>
            )}
            {isCommissionerCard && (
              <span className="text-xs font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                ANNOUNCEMENT
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]
              hover:bg-[var(--lg-tint-hover)] transition-colors"
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-5 space-y-5">
          {/* Card content */}
          <div>
            <h3 className={`text-base font-semibold text-[var(--lg-text-primary)] leading-snug mb-1
              ${isTradeBlock ? "" : ""}`}>
              {isTradeBlock && (
                <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase
                  bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 mr-2 align-middle">
                  Trade Block
                </span>
              )}
              {card.title}
            </h3>
            {card.body && (
              <div className="mt-2">
                {isTradeBlock ? (
                  <div className="rounded-lg bg-[var(--lg-tint)] border border-[var(--lg-border-faint)] p-3">
                    <div className="text-xs font-semibold uppercase text-[var(--lg-text-muted)] mb-1">
                      Looking for
                    </div>
                    <p className="text-sm text-[var(--lg-text-primary)] leading-relaxed">{card.body}</p>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--lg-text-secondary)] leading-relaxed whitespace-pre-wrap">
                    {card.body}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--lg-border-faint)]">
            <div className="flex items-center gap-2 text-xs text-[var(--lg-text-muted)]">
              {card.user?.name && (
                <span className="font-medium text-[var(--lg-text-secondary)]">{card.user.name}</span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(card.createdAt)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ReactionBar
                thumbsUp={card.thumbsUp}
                thumbsDown={card.thumbsDown}
                myVote={card.myVote}
                onVote={(vote) => onVote(card.id, vote)}
                disabled={isCommissionerCard}
              />
              {canDelete && (
                <button
                  onClick={() => onDelete(card.id)}
                  className="p-1.5 rounded-lg text-[var(--lg-text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                  aria-label="Delete card"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Replies */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-3.5 h-3.5 text-[var(--lg-text-muted)]" />
              <span className="text-xs font-medium text-[var(--lg-text-muted)]">
                {card.replies.length} {card.replies.length === 1 ? "reply" : "replies"}
              </span>
            </div>

            <div className="space-y-3">
              {card.replies.map((r) => (
                <div key={r.id} className="pl-3 border-l-2 border-[var(--lg-border-faint)]">
                  <div className="flex items-center gap-2 text-xs text-[var(--lg-text-muted)]">
                    <span className="font-medium text-[var(--lg-text-secondary)]">
                      {r.user?.name ?? "Unknown"}
                    </span>
                    <span>{formatRelativeTime(r.createdAt)}</span>
                  </div>
                  <p className="text-sm text-[var(--lg-text-primary)] mt-0.5 leading-relaxed">
                    {r.body}
                  </p>
                </div>
              ))}
              {card.replies.length === 0 && (
                <p className="text-xs text-[var(--lg-text-muted)] italic">
                  No replies yet. Start the conversation!
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Reply input - pinned to bottom */}
        <form
          onSubmit={handleReplySubmit}
          className="px-5 py-3 border-t border-[var(--lg-glass-border)] bg-[var(--lg-tint)]"
        >
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Add a reply..."
              rows={2}
              maxLength={1000}
              className="flex-1 text-sm px-3 py-2 rounded-lg bg-[var(--lg-input-bg)] border border-[var(--lg-input-border)]
                text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)] outline-none resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleReplySubmit(e);
                }
              }}
            />
            <button
              type="submit"
              disabled={!replyText.trim() || submitting}
              className="self-end px-3 py-2 min-h-[40px] rounded-lg text-xs font-medium
                bg-[var(--lg-accent)] text-[var(--lg-on-accent)] hover:opacity-90 transition-opacity
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-[var(--lg-text-muted)] mt-1 opacity-60">
            Press Cmd+Enter to send
          </p>
        </form>
      </div>
    </>
  );
}

/* -- Inline Expand (Mobile) ----------------------------------------------- */

function InlineReplySection({
  card,
  onReply,
}: {
  card: BoardCard;
  onReply: (cardId: number, body: string) => Promise<void>;
}) {
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onReply(card.id, replyText.trim());
      setReplyText("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-[var(--lg-border-faint)] space-y-3 animate-in fade-in duration-150">
      {/* Replies */}
      {card.replies.map((r) => (
        <div key={r.id} className="pl-3 border-l-2 border-[var(--lg-border-faint)]">
          <div className="flex items-center gap-2 text-xs text-[var(--lg-text-muted)]">
            <span className="font-medium text-[var(--lg-text-secondary)]">
              {r.user?.name ?? "Unknown"}
            </span>
            <span>{formatRelativeTime(r.createdAt)}</span>
          </div>
          <p className="text-xs text-[var(--lg-text-primary)] mt-0.5">{r.body}</p>
        </div>
      ))}
      {card.replies.length === 0 && (
        <p className="text-xs text-[var(--lg-text-muted)] italic">No replies yet.</p>
      )}

      {/* Reply input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Reply..."
          maxLength={1000}
          className="flex-1 text-xs px-2.5 py-2 min-h-[40px] rounded-lg bg-[var(--lg-input-bg)]
            border border-[var(--lg-input-border)] text-[var(--lg-text-primary)]
            placeholder:text-[var(--lg-text-muted)] outline-none"
        />
        <button
          type="submit"
          disabled={!replyText.trim() || submitting}
          className="px-3 py-2 min-h-[40px] rounded-lg text-xs font-medium
            bg-[var(--lg-accent)] text-[var(--lg-on-accent)] hover:opacity-90 transition-opacity
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}

/* -- Card Component ------------------------------------------------------- */

function CardComponent({
  card,
  onVote,
  onReply,
  onDelete,
  onSelect,
  onOpenPlayer,
  currentUserId,
  isCommissioner,
  expandedId,
  setExpandedId,
}: {
  card: BoardCard;
  onVote: (cardId: number, vote: "up" | "down") => void;
  onReply: (cardId: number, body: string) => Promise<void>;
  onDelete: (cardId: number) => void;
  onSelect: (card: BoardCard) => void;
  onOpenPlayer: (playerId: number) => void;
  currentUserId: number;
  isCommissioner: boolean;
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
}) {
  const canDelete = card.userId === currentUserId || isCommissioner;
  const isCommissionerCard = card.column === "commissioner";
  const isTradeBlock = card.column === "trade_block";
  const isMobileExpanded = expandedId === card.id;

  const handleCardClick = () => {
    // Trade block cards open the PlayerDetailModal
    if (isTradeBlock && card.metadata?.playerId) {
      onOpenPlayer(card.metadata.playerId);
      return;
    }
    // Desktop: open slide-over panel via onSelect
    // Mobile: toggle inline expand
    if (window.innerWidth >= 768) {
      onSelect(card);
    } else {
      setExpandedId(isMobileExpanded ? null : card.id);
    }
  };

  return (
    <div
      className={`rounded-2xl p-3.5 border transition-all duration-200 cursor-pointer
        ${isCommissionerCard
          ? "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10"
          : "border-[var(--lg-border-faint)] bg-[var(--lg-glass-bg)] hover:bg-[var(--lg-glass-bg-hover)]"
        }
        ${isMobileExpanded ? "shadow-lg ring-1 ring-[var(--lg-accent)]/20" : "hover:shadow-md"}`}
      onClick={handleCardClick}
    >
      {/* Badge + timestamp row */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          {isCommissionerCard && (
            <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Shield className="w-3 h-3" />
              Commissioner
            </span>
          )}
          {isTradeBlock && card.metadata?.posPrimary && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              {card.metadata.posPrimary}
            </span>
          )}
          {isTradeBlock && card.metadata?.mlbTeam && (
            <span className="text-xs font-medium text-[var(--lg-text-muted)]">
              {card.metadata.mlbTeam}
            </span>
          )}
          {isTradeBlock && card.metadata?.teamName && (
            <span className="text-xs text-[var(--lg-text-muted)]">
              {card.metadata.teamName}
            </span>
          )}
          {!isTradeBlock && card.user?.name && (
            <span className="text-xs text-[var(--lg-text-muted)]">
              {card.user.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--lg-text-muted)] flex items-center gap-1 whitespace-nowrap">
            <Clock className="w-3 h-3" />
            {formatRelativeTime(card.createdAt)}
          </span>
          {canDelete && !isTradeBlock && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(card.id); }}
              className="p-1 rounded text-[var(--lg-text-muted)] hover:text-red-500 transition-colors"
              aria-label="Delete card"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <h4 className="text-xs font-semibold text-[var(--lg-text-primary)] leading-snug mb-1">
        {card.title}
      </h4>

      {/* Body */}
      {card.body && (
        <div>
          {isTradeBlock ? (
            <div className="text-xs text-[var(--lg-text-muted)] mt-1">
              <span className="font-semibold uppercase">Looking for: </span>
              <span className="text-[var(--lg-text-secondary)]">{card.body}</span>
            </div>
          ) : (
            <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed line-clamp-3">
              {card.body}
            </p>
          )}
        </div>
      )}

      {/* Footer: reactions + reply count */}
      {!isTradeBlock && (
        <div className="flex items-center justify-between mt-2">
          <ReactionBar
            thumbsUp={card.thumbsUp}
            thumbsDown={card.thumbsDown}
            myVote={card.myVote}
            onVote={(vote) => onVote(card.id, vote)}
            disabled={isCommissionerCard}
          />
          <button
            onClick={(e) => { e.stopPropagation(); handleCardClick(); }}
            className="flex items-center gap-1 text-xs text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] transition-colors"
          >
            <MessageSquare className="w-3 h-3" />
            {card.replies.length > 0 ? card.replies.length : ""}
            <span className="hidden sm:inline">
              {card.replies.length === 1 ? "reply" : card.replies.length > 0 ? "replies" : "Reply"}
            </span>
          </button>
        </div>
      )}
      {isTradeBlock && (
        <div className="mt-2 text-xs text-[var(--lg-text-muted)] italic">
          Click to view player details
        </div>
      )}

      {/* Mobile inline expand */}
      {!isTradeBlock && isMobileExpanded && (
        <div className="md:hidden">
          <InlineReplySection card={card} onReply={onReply} />
        </div>
      )}
    </div>
  );
}

/* -- New Card Form -------------------------------------------------------- */

function NewCardForm({
  onPost,
  defaultColumn,
  isCommissioner,
  onCancel,
}: {
  onPost: (title: string, body: string, column: ColumnId) => Promise<void>;
  defaultColumn?: ColumnId;
  isCommissioner: boolean;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [column, setColumn] = useState<ColumnId>(defaultColumn ?? "banter");
  const [submitting, setSubmitting] = useState(false);

  // Determine available columns — trade_block is auto-synced, not manually postable
  const availableColumns = COLUMNS.filter(
    (c) => c.id !== "trade_block" && (c.id !== "commissioner" || isCommissioner)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onPost(title.trim(), body.trim(), column);
      setTitle("");
      setBody("");
      onCancel?.();
    } finally {
      setSubmitting(false);
    }
  };

  // Dynamic placeholders based on column
  const titlePlaceholder = column === "commissioner"
    ? "Announcement title..."
    : "Title...";

  const bodyPlaceholder = column === "commissioner"
    ? "Announcement details..."
    : "Share a hot take, trash talk, or strategy tip...";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl p-3.5 border border-dashed border-[var(--lg-border-subtle)] bg-[var(--lg-tint)]"
    >
      {!defaultColumn && (
        <div className="flex items-center gap-2 mb-3">
          {availableColumns.map((c) => {
            const Icon = c.icon;
            const isActive = column === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setColumn(c.id)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium
                  transition-colors border whitespace-nowrap
                  ${isActive
                    ? `${c.accentBg} ${c.accentBorder} ${c.accent}`
                    : "bg-transparent border-transparent text-[var(--lg-text-muted)] hover:bg-[var(--lg-tint-hover)]"
                  }`}
              >
                <Icon className="w-3 h-3" />
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={titlePlaceholder}
        maxLength={200}
        className="w-full text-xs font-medium bg-transparent border-none outline-none mb-1
          text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)]"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={bodyPlaceholder}
        rows={2}
        maxLength={2000}
        className="w-full text-xs bg-transparent border-none outline-none resize-none
          text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)]"
      />
      <div className="flex items-center justify-end gap-2 mt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 min-h-[40px] rounded-lg text-xs font-medium
              text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!title.trim() || submitting}
          className="flex items-center gap-1.5 px-3 py-1.5 min-h-[40px] rounded-lg text-xs font-medium
            bg-[var(--lg-accent)] text-[var(--lg-on-accent)] hover:opacity-90 transition-opacity
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="w-3.5 h-3.5" />
          Post
        </button>
      </div>
    </form>
  );
}

/* -- Mobile FAB + Bottom Sheet -------------------------------------------- */

function MobileFAB({
  onPost,
  isCommissioner,
}: {
  onPost: (title: string, body: string, column: ColumnId) => Promise<void>;
  isCommissioner: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-30 md:hidden
            w-14 h-14 rounded-full bg-[var(--lg-accent)] text-[var(--lg-on-accent)] shadow-lg
            flex items-center justify-center hover:opacity-90 transition-opacity
            active:scale-95"
          aria-label="New post"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Bottom sheet */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 md:hidden animate-in fade-in duration-150"
            onClick={() => setOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden
            bg-[var(--lg-glass-bg)] backdrop-blur-[var(--lg-glass-blur)]
            border-t border-[var(--lg-glass-border)] rounded-t-2xl
            px-4 pt-4 pb-8 shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="w-12 h-1 rounded-full bg-[var(--lg-border-subtle)] mx-auto mb-4" />
            <NewCardForm
              onPost={onPost}
              isCommissioner={isCommissioner}
              onCancel={() => setOpen(false)}
            />
          </div>
        </>
      )}
    </>
  );
}

/* -- Main Board Component ------------------------------------------------- */

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
  const [activeTab, setActiveTab] = useState<ColumnId>("commissioner");
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null);
  const [mobileExpandedId, setMobileExpandedId] = useState<number | null>(null);
  const [showDesktopForm, setShowDesktopForm] = useState(false);
  const [playerModalCard, setPlayerModalCard] = useState<BoardCard | null>(null);

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

  // Keep selected card in sync with cards state
  useEffect(() => {
    if (selectedCard) {
      const updated = cards.find((c) => c.id === selectedCard.id);
      if (updated) setSelectedCard(updated);
    }
  }, [cards, selectedCard]);

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

          if (oldVote === vote) {
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
      if (selectedCard?.id === cardId) setSelectedCard(null);
    },
    [selectedCard]
  );

  const handleOpenPlayer = useCallback((playerId: number) => {
    // Find the trade block card with this playerId to get full metadata
    const card = cards.find(
      (c) => c.column === "trade_block" && c.metadata?.playerId === playerId
    );
    if (card) setPlayerModalCard(card);
  }, [cards]);

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
      {/* ── Mobile: tab pills + single column ── */}
      <div className="md:hidden">
        <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-1 px-1 scrollbar-hide">
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
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? col.accentBg : "bg-[var(--lg-tint)]"}`}>
                  {cardsByColumn(col.id).length}
                </span>
              </button>
            );
          })}
        </div>

        {activeTab === "trade_block" && (
          <p className="text-xs text-[var(--lg-text-muted)] text-center mt-1 mb-2 italic">
            Auto-synced from team rosters
          </p>
        )}

        <div className="space-y-3 mt-2">
          {cardsByColumn(activeTab).map((card) => (
            <CardComponent
              key={card.id}
              card={card}
              onVote={handleVote}
              onReply={handleReply}
              onDelete={handleDelete}
              onSelect={setSelectedCard}
              onOpenPlayer={handleOpenPlayer}
              currentUserId={currentUserId}
              isCommissioner={isCommissioner}
              expandedId={mobileExpandedId}
              setExpandedId={setMobileExpandedId}
            />
          ))}
          {cardsByColumn(activeTab).length === 0 && (
            <p className="text-xs text-[var(--lg-text-muted)] text-center py-8">
              No cards in this column yet. Be the first to post!
            </p>
          )}
        </div>

        <MobileFAB onPost={handlePost} isCommissioner={isCommissioner} />
      </div>

      {/* ── Desktop: 3-column grid ── */}
      <div className="hidden md:block">
        {/* Top bar with new post button */}
        <div className="flex items-center justify-end mb-4">
          <button
            onClick={() => setShowDesktopForm(!showDesktopForm)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${showDesktopForm
                ? "bg-[var(--lg-tint)] text-[var(--lg-text-primary)]"
                : "bg-[var(--lg-accent)] text-[var(--lg-on-accent)] hover:opacity-90"
              }`}
          >
            {showDesktopForm ? (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Hide Form
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                New Post
              </>
            )}
          </button>
        </div>

        {showDesktopForm && (
          <div className="mb-4">
            <NewCardForm
              onPost={handlePost}
              isCommissioner={isCommissioner}
              onCancel={() => setShowDesktopForm(false)}
            />
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-4">
          {COLUMNS.map((col) => {
            const Icon = col.icon;
            const colCards = cardsByColumn(col.id);
            return (
              <div key={col.id} className="space-y-3">
                {/* Column header */}
                <div className={`flex items-center gap-2 px-1 pb-2 border-b-2 ${col.accentBorder}`}>
                  <Icon className={`w-4 h-4 ${col.accent}`} />
                  <div className="flex flex-col">
                    <span className={`text-xs font-semibold ${col.accent}`}>{col.label}</span>
                    {col.id === "trade_block" && (
                      <span className="text-xs text-[var(--lg-text-muted)] leading-tight">
                        auto-synced from team rosters
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--lg-text-muted)] ml-auto">
                    {colCards.length}
                  </span>
                </div>

                {/* Cards */}
                {colCards.map((card) => (
                  <CardComponent
                    key={card.id}
                    card={card}
                    onVote={handleVote}
                    onReply={handleReply}
                    onDelete={handleDelete}
                    onSelect={setSelectedCard}
                    onOpenPlayer={handleOpenPlayer}
                    currentUserId={currentUserId}
                    isCommissioner={isCommissioner}
                    expandedId={mobileExpandedId}
                    setExpandedId={setMobileExpandedId}
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

      {/* ── Desktop: Slide-over detail panel ── */}
      {selectedCard && (
        <div className="hidden md:block">
          <CardDetailPanel
            card={selectedCard}
            onClose={() => setSelectedCard(null)}
            onVote={handleVote}
            onReply={handleReply}
            onDelete={handleDelete}
            currentUserId={currentUserId}
            isCommissioner={isCommissioner}
          />
        </div>
      )}

      {/* Player detail modal for trade block cards */}
      {playerModalCard && (
        <PlayerDetailModal
          player={{
            mlb_id: String(playerModalCard.metadata?.mlbId ?? ""),
            player_name: playerModalCard.title,
            posPrimary: playerModalCard.metadata?.posPrimary,
            mlbTeam: playerModalCard.metadata?.mlbTeam,
          } as any}
          onClose={() => setPlayerModalCard(null)}
          open={true}
        />
      )}
    </div>
  );
}
