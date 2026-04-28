import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import "../../../components/aurora/aurora.css";
import { AmbientBg, Glass, SectionLabel } from "../../../components/aurora/atoms";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  // Supabase puts tokens in the URL hash fragment (#access_token=...).
  // The Supabase JS client auto-detects them and fires PASSWORD_RECOVERY.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    // Also check if we already have a session (e.g., page was refreshed after Supabase processed the hash)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) throw updateError;

      setMessage("Password updated successfully!");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  // Live, inline match-validation hint (faint until we know it doesn't match)
  const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  const showMismatchHint = confirmPassword.length > 0 && password !== confirmPassword;

  // Shared styles
  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 44,
    padding: "0 44px 0 14px",
    borderRadius: 12,
    background: "var(--am-surface-faint)",
    border: "1px solid var(--am-border)",
    color: "var(--am-text)",
    fontSize: 14,
    outline: "none",
    fontFamily: "var(--am-body)",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "var(--am-text-faint)",
    fontWeight: 600,
    marginBottom: 8,
    marginLeft: 2,
  };

  const eyeBtnStyle: React.CSSProperties = {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    background: "transparent",
    border: "none",
    color: "var(--am-text-faint)",
    cursor: "pointer",
    padding: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const submitStyle: React.CSSProperties = {
    width: "100%",
    height: 44,
    borderRadius: 999,
    background: "var(--am-irid)",
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    border: "1px solid var(--am-border-strong)",
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.6 : 1,
    boxShadow: "0 8px 24px rgba(74,140,255,0.25)",
    fontFamily: "var(--am-body)",
    letterSpacing: 0.2,
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
        <Glass strong style={{ maxWidth: 440, width: "100%", padding: 32 }}>
          {/* Brand header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
            <div
              aria-hidden
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "var(--am-irid)",
                boxShadow: "0 8px 24px rgba(255,80,80,0.25)",
                flexShrink: 0,
              }}
            />
            <div
              style={{
                fontFamily: "var(--am-display)",
                fontSize: 17,
                color: "var(--am-text)",
                letterSpacing: -0.2,
                lineHeight: 1.1,
              }}
            >
              The Fantastic Leagues
            </div>
          </div>

          {!ready ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <SectionLabel>Verifying</SectionLabel>
              <div
                aria-hidden
                style={{
                  width: 32,
                  height: 32,
                  margin: "8px auto 16px",
                  borderRadius: 999,
                  border: "2px solid var(--am-border)",
                  borderTopColor: "var(--am-accent)",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <p style={{ fontSize: 13, color: "var(--am-text-muted)", marginBottom: 12 }}>
                Verifying your reset link...
              </p>
              <p style={{ fontSize: 12, color: "var(--am-text-faint)" }}>
                If this takes too long, the link may have expired.{" "}
                <Link
                  to="/forgot-password"
                  style={{ color: "var(--am-accent)", textDecoration: "none", fontWeight: 500 }}
                >
                  Request a new one
                </Link>
              </p>
            </div>
          ) : (
            <>
              <SectionLabel>Account recovery</SectionLabel>
              <h1
                style={{
                  fontFamily: "var(--am-display)",
                  fontSize: 26,
                  fontWeight: 500,
                  color: "var(--am-text)",
                  letterSpacing: -0.4,
                  margin: "0 0 6px 0",
                  lineHeight: 1.15,
                }}
              >
                Set a new password
              </h1>
              <p style={{ fontSize: 13, color: "var(--am-text-muted)", margin: "0 0 24px 0" }}>
                Choose something strong. You'll use it next time you sign in.
              </p>

              {message ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div
                    style={{
                      padding: 14,
                      borderRadius: 12,
                      background: "var(--am-surface-faint)",
                      border: "1px solid var(--am-border)",
                      color: "var(--am-positive)",
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        background: "var(--am-positive)",
                        color: "#0b1230",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      ✓
                    </span>
                    <span>Password updated.</span>
                  </div>
                  <Link
                    to="/login"
                    style={{
                      ...submitStyle,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textDecoration: "none",
                      cursor: "pointer",
                      opacity: 1,
                    }}
                  >
                    Sign in →
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={labelStyle}>New password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={inputStyle}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={eyeBtnStyle}
                        tabIndex={-1}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Confirm new password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        style={inputStyle}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        style={eyeBtnStyle}
                        tabIndex={-1}
                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {/* Inline match hint */}
                    <div
                      style={{
                        fontSize: 11,
                        marginTop: 6,
                        marginLeft: 2,
                        color: showMismatchHint
                          ? "var(--am-negative)"
                          : passwordsMatch
                          ? "var(--am-positive)"
                          : "var(--am-text-faint)",
                        minHeight: 14,
                      }}
                    >
                      {showMismatchHint
                        ? "Passwords don't match"
                        : passwordsMatch
                        ? "Passwords match"
                        : "At least 6 characters."}
                    </div>
                  </div>

                  {error && (
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        background: "var(--am-surface-faint)",
                        border: "1px solid var(--am-border)",
                        color: "var(--am-negative)",
                        fontSize: 12,
                      }}
                    >
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={loading} style={submitStyle}>
                    {loading ? "Updating..." : "Update password"}
                  </button>

                  <div style={{ textAlign: "center", marginTop: 4 }}>
                    <Link
                      to="/login"
                      style={{
                        fontSize: 12,
                        color: "var(--am-text-faint)",
                        textDecoration: "none",
                      }}
                    >
                      Back to sign in
                    </Link>
                  </div>
                </form>
              )}
            </>
          )}
        </Glass>
      </div>
    </div>
  );
}
