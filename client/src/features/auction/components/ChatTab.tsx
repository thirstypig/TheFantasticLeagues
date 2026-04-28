/*
 * ChatTab — Aurora deep port (PR-3 of Auction module rollout).
 *
 * In-draft live chat panel. Business logic preserved 1:1 from the
 * legacy file: useState for input, useRef for input + scroll-to-bottom,
 * useEffect that auto-scrolls on new messages, and the `myUserId`
 * comparison that styles the current user's bubbles distinctly.
 *
 * Chrome moves to Aurora: outer Glass surface, `--am-*` token bubbles,
 * Aurora-styled input row, and a chip-button send control.
 */
import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import type { ChatMessage } from '../hooks/useAuctionState';
import { Glass } from '../../../components/aurora/atoms';

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
    <Glass padded={false} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              fontSize: 12,
              color: 'var(--am-text-faint)',
              fontStyle: 'italic',
              padding: '48px 0',
              opacity: 0.7,
            }}
          >
            No messages yet. Say something!
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.userId === myUserId;
          const isLast = i === messages.length - 1;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isMe ? 'flex-end' : 'flex-start',
                paddingBottom: isLast ? 0 : 6,
                borderBottom: isLast ? 'none' : '1px solid var(--am-border)',
              }}
            >
              <div
                style={{
                  maxWidth: '85%',
                  borderRadius: 12,
                  padding: '6px 10px',
                  background: isMe ? 'var(--am-chip)' : 'transparent',
                  color: 'var(--am-text)',
                  border: isMe ? '1px solid var(--am-border)' : 'none',
                }}
              >
                {!isMe && (
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: 1.2,
                      color: 'var(--am-text-faint)',
                      marginBottom: 2,
                    }}
                  >
                    {msg.userName}
                  </div>
                )}
                <div style={{ fontSize: 13, lineHeight: 1.4, wordBreak: 'break-word' }}>
                  {msg.text}
                </div>
              </div>
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--am-text-faint)',
                  marginTop: 2,
                  padding: '0 4px',
                }}
              >
                {formatTime(msg.timestamp)}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div
        style={{
          padding: '10px 12px',
          borderTop: '1px solid var(--am-border)',
          background: 'var(--am-surface-faint)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          placeholder="Type a message..."
          maxLength={500}
          style={{
            flex: 1,
            padding: '8px 12px',
            fontSize: 13,
            borderRadius: 12,
            border: '1px solid var(--am-border)',
            background: 'var(--am-surface-faint)',
            color: 'var(--am-text)',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 99,
            background: 'var(--am-chip-strong)',
            color: 'var(--am-text)',
            border: '1px solid var(--am-border-strong)',
            cursor: input.trim() ? 'pointer' : 'not-allowed',
            opacity: input.trim() ? 1 : 0.4,
            transition: 'opacity 150ms',
          }}
        >
          <Send size={13} />
        </button>
      </div>
    </Glass>
  );
}
