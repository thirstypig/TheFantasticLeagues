import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider";
import { useLeague } from "../../../contexts/LeagueContext";
import { useChatWebSocket } from "../hooks/useChatWebSocket";
import type { ChatMessageItem } from "../api";

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onMarkRead: () => void;
  isCommissioner: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ChatMessage({
  msg,
  isOwn,
  isCommissioner,
  onDelete,
}: {
  msg: ChatMessageItem;
  isOwn: boolean;
  isCommissioner: boolean;
  onDelete?: (id: number) => void;
}) {
  const [showDelete, setShowDelete] = useState(false);

  if (msg.msgType === "system") {
    return (
      <div className="flex justify-center py-1.5">
        <div className="px-3 py-1.5 rounded-full bg-[var(--lg-tint)] text-[var(--lg-text-muted)] text-xs italic max-w-[85%] text-center">
          {msg.text}
        </div>
      </div>
    );
  }

  const initial = (msg.userName?.[0] || "?").toUpperCase();

  return (
    <div
      className={`flex gap-2 py-1 group ${isOwn ? "flex-row-reverse" : ""}`}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      {!isOwn && (
        <div className="w-7 h-7 rounded-full bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] flex items-center justify-center text-[10px] font-bold text-[var(--lg-text-muted)] flex-shrink-0 mt-0.5">
          {initial}
        </div>
      )}
      <div className={`max-w-[75%] ${isOwn ? "text-right" : ""}`}>
        {!isOwn && (
          <div className="text-[10px] font-semibold text-[var(--lg-text-muted)] mb-0.5 px-1">
            {msg.userName}
          </div>
        )}
        <div
          className={`px-3 py-1.5 rounded-2xl text-sm leading-relaxed break-words ${
            isOwn
              ? "bg-[var(--lg-accent)] text-white rounded-br-md"
              : "bg-[var(--lg-tint)] text-[var(--lg-text-primary)] rounded-bl-md"
          }`}
        >
          {msg.text}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 px-1">
          <span className="text-[10px] text-[var(--lg-text-muted)]">{formatTime(msg.createdAt)}</span>
          {isCommissioner && showDelete && (
            <button
              onClick={() => onDelete?.(msg.id)}
              className="text-[10px] text-rose-400 hover:text-rose-300 transition-colors"
              title="Delete message"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChatPanel({ isOpen, onClose, onMarkRead, isCommissioner }: ChatPanelProps) {
  const { user } = useAuth();
  const { leagueId } = useLeague();
  const { messages, sendMessage, loadMore, hasMore, isConnected, isLoadingHistory } = useChatWebSocket({
    leagueId,
    enabled: isOpen,
  });
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  // Mark as read when panel is open and messages arrive
  useEffect(() => {
    if (isOpen && messages.length > 0) {
      onMarkRead();
    }
  }, [isOpen, messages.length, onMarkRead]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    sendMessage(text);
    setInput("");
  }, [input, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleDelete = useCallback(
    (messageId: number) => {
      if (!leagueId) return;
      // Use WebSocket for deletion
      import("../../../lib/supabase").then(({ supabase }) => {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) return;
          // Just call the REST API for deletion; the WS will broadcast the removal
          fetch(`/api/chat/${leagueId}/messages/${messageId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
        });
      });
    },
    [leagueId]
  );

  // Infinite scroll: load more when scrolling to top
  const handleScroll = useCallback(() => {
    if (!containerRef.current || !hasMore || isLoadingHistory) return;
    if (containerRef.current.scrollTop < 50) {
      loadMore();
    }
  }, [hasMore, isLoadingHistory, loadMore]);

  if (!isOpen) return null;

  return (
    <div className="fixed top-0 right-0 h-screen w-[380px] max-w-full z-50 flex flex-col bg-[var(--lg-bg-card)] border-l border-[var(--lg-border-subtle)] shadow-2xl animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--lg-border-faint)]">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-[var(--lg-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="font-semibold text-sm text-[var(--lg-text-heading)]">League Chat</span>
          <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-400"}`} title={isConnected ? "Connected" : "Disconnected"} />
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[var(--lg-tint)] text-[var(--lg-text-muted)] transition-colors"
          aria-label="Close chat"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5"
        onScroll={handleScroll}
      >
        {isLoadingHistory && (
          <div className="flex justify-center py-2">
            <div className="w-5 h-5 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}
        {hasMore && !isLoadingHistory && (
          <button
            onClick={loadMore}
            className="w-full text-center text-xs text-[var(--lg-text-muted)] py-2 hover:text-[var(--lg-accent)] transition-colors"
          >
            Load older messages
          </button>
        )}
        {messages.length === 0 && !isLoadingHistory && (
          <div className="flex flex-col items-center justify-center h-full text-[var(--lg-text-muted)] text-sm">
            <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p>No messages yet</p>
            <p className="text-xs mt-1">Be the first to say something!</p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            msg={msg}
            isOwn={String(msg.userId) === String(user?.id)}
            isCommissioner={isCommissioner}
            onDelete={handleDelete}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--lg-border-faint)] px-3 py-2.5">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none rounded-xl bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] px-3 py-2 text-sm text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)] outline-none focus:border-[var(--lg-accent)] transition-colors max-h-24"
            style={{ minHeight: "36px" }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !isConnected}
            className="p-2 rounded-xl bg-[var(--lg-accent)] text-white disabled:opacity-40 hover:opacity-90 transition-all flex-shrink-0"
            aria-label="Send message"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
