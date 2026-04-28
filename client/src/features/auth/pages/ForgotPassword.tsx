import React, { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import "../../../components/aurora/aurora.css";
import { AmbientBg, Glass } from "../../../components/aurora/atoms";

function mapSupabaseError(msg: string): string {
  if (msg.includes("rate_limit") || msg.includes("over_email_send_rate_limit"))
    return "Too many attempts. Please try again in a few minutes.";
  if (msg.includes("not found") || msg.includes("invalid"))
    return "If an account exists for this email, a reset link has been sent.";
  return msg;
}

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) throw resetError;

      setMessage("Check your email for a password reset link. It may take a minute to arrive.");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(mapSupabaseError(err.message));
      } else {
        setError("An unknown error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="aurora-theme dark"
      style={{ position: "relative", minHeight: "100svh", background: "var(--am-bg)" }}
    >
      <AmbientBg />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100svh",
          padding: 16,
        }}
      >
        <Glass strong style={{ maxWidth: 440, width: "100%", padding: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
            <div
              aria-hidden
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                background: "var(--am-irid)",
                boxShadow: "0 6px 20px rgba(255,80,80,0.28)",
                flexShrink: 0,
              }}
            />
            <div
              style={{
                fontFamily: "var(--am-display)",
                fontSize: 14,
                color: "var(--am-text-muted)",
                letterSpacing: -0.1,
              }}
            >
              The Fantastic Leagues
            </div>
          </div>

          <h1
            style={{
              fontFamily: "var(--am-display)",
              fontSize: 28,
              fontWeight: 300,
              lineHeight: 1.1,
              color: "var(--am-text)",
              margin: 0,
              marginBottom: 8,
              letterSpacing: -0.4,
            }}
          >
            Reset your password
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--am-text-muted)",
              margin: 0,
              marginBottom: 22,
              lineHeight: 1.5,
            }}
          >
            Enter your email and we'll send you a reset link.
          </p>

          {message ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: 14,
                  borderRadius: 14,
                  background: "var(--am-surface-faint)",
                  border: "1px solid var(--am-border)",
                  color: "var(--am-text)",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    borderRadius: 99,
                    background: "var(--am-positive)",
                    color: "#0a0a0a",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    marginTop: 1,
                  }}
                >
                  ✓
                </span>
                <div>
                  <div style={{ fontWeight: 500, color: "var(--am-positive)", marginBottom: 2 }}>
                    Check your email for the reset link
                  </div>
                  <div style={{ color: "var(--am-text-muted)" }}>{message}</div>
                </div>
              </div>
              <Link
                to="/login"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 44,
                  borderRadius: 14,
                  background: "var(--am-surface-faint)",
                  border: "1px solid var(--am-border)",
                  color: "var(--am-text)",
                  fontSize: 13,
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                Back to login →
              </Link>
            </div>
          ) : (
            <form
              onSubmit={handleRequest}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 10,
                    letterSpacing: 1.4,
                    textTransform: "uppercase",
                    color: "var(--am-text-faint)",
                    fontWeight: 600,
                    marginBottom: 6,
                  }}
                >
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  style={{
                    width: "100%",
                    height: 44,
                    padding: "0 14px",
                    borderRadius: 12,
                    background: "var(--am-surface-faint)",
                    border: "1px solid var(--am-border)",
                    color: "var(--am-text)",
                    fontSize: 14,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--am-accent)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--am-border)";
                  }}
                />
              </div>

              {error && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "var(--am-surface-faint)",
                    border: "1px solid var(--am-border)",
                    color: "var(--am-cardinal)",
                    fontSize: 12,
                    lineHeight: 1.4,
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  height: 44,
                  borderRadius: 999,
                  background: "var(--am-irid)",
                  border: "1px solid var(--am-border-strong)",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.5 : 1,
                  boxShadow: "0 6px 20px rgba(255,80,80,0.28)",
                  marginTop: 4,
                }}
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>

              <div style={{ textAlign: "center", marginTop: 4 }}>
                <Link
                  to="/login"
                  style={{
                    fontSize: 12,
                    color: "var(--am-text-muted)",
                    textDecoration: "none",
                  }}
                >
                  Back to login →
                </Link>
              </div>
            </form>
          )}
        </Glass>
      </div>
    </div>
  );
}
