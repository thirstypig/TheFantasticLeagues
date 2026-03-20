import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import type { ChatMessage } from '../hooks/useAuctionState';

interface ChatTabProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  myUserId?: number;
}

export default function ChatTab({ messages, onSend, myUserId }: ChatTabProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput('');
    inputRef.current?.focus();
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="h-full flex flex-col bg-[var(--lg-glass-bg)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {messages.length === 0 && (
          <div className="text-center text-xs text-[var(--lg-text-muted)] italic py-12 opacity-50">
            No messages yet. Say something!
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.userId === myUserId;
          return (
            <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 ${
                isMe
                  ? 'bg-[var(--lg-accent)] text-white'
                  : 'bg-[var(--lg-tint)] text-[var(--lg-text-primary)]'
              }`}>
                {!isMe && (
                  <div className="text-[9px] font-semibold uppercase tracking-wide opacity-60 mb-0.5">
                    {msg.userName}
                  </div>
                )}
                <div className="text-sm leading-snug break-words">{msg.text}</div>
              </div>
              <span className="text-[9px] text-[var(--lg-text-muted)] opacity-40 mt-0.5 px-1">
                {formatTime(msg.timestamp)}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-2 py-2 border-t border-[var(--lg-border-subtle)] bg-[var(--lg-glass-bg-hover)] flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          placeholder="Type a message..."
          maxLength={500}
          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-secondary)] text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)]/40 outline-none focus:ring-1 focus:ring-[var(--lg-accent)]"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="p-1.5 rounded-lg bg-[var(--lg-accent)] text-white hover:opacity-90 disabled:opacity-30 transition-opacity"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
