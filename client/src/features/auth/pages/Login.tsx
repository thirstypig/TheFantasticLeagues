// client/src/pages/Login.tsx
//
// Aurora pre-auth port. Login lives OUTSIDE AuroraShell, so the page
// itself owns the `aurora-theme` wrapper + AmbientBg layer (vs in-shell
// pages which inherit them from AuroraShell). Centered Glass-strong card
// over the full-bleed iridescent ambient background.
//
// Business logic (supabase auth, redirects, error states, dev login,
// resend confirmation) is unchanged from the legacy chrome — only the
// surface presentation moves to Aurora tokens.
import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../../../auth/AuthProvider";
import { supabase } from "../../../lib/supabase";
import { track } from "../../../lib/posthog";
import { AmbientBg, Glass } from "../../../components/aurora/atoms";
import "../../../components/aurora/aurora.css";

export default function Login() {
  const [searchParams] = useSearchParams();
  const urlError = searchParams.get("error");

  const { loginWithGoogle, loginWithPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(urlError === "not_approved" ? "not_approved" : "");
  const [loading, setLoading] = useState(false);
  const [devLoading, setDevLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [emailFocus, setEmailFocus] = useState(false);
  const [passwordFocus, setPasswordFocus] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResendSuccess(false);
    setLoading(true);

    try {
      await loginWithPassword(email, password);
      track("login", { method: "password" });
      window.location.href = "/";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      // Detect "email not confirmed" from Supabase error
      if (msg.includes("not confirmed") || msg.includes("email_not_confirmed"))
        setError("email_not_confirmed");
      else if (msg.includes("Invalid login credentials"))
        setError("Invalid email or password. Please check your credentials.");
      else
        setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    setResendLoading(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
      });
      if (resendError) throw resendError;
      setResendSuccess(true);
    } catch {
      setError("Failed to resend confirmation email. Try again in a few minutes.");
    } finally {
      setResendLoading(false);
    }
  };

  // Shared input chrome — focus ring handled inline via state.
  const inputStyle = (focused: boolean): React.CSSProperties => ({
    width: "100%",
    height: 44,
    padding: "0 14px",
    background: "var(--am-surface-faint)",
    border: `1px solid ${focused ? "var(--am-accent)" : "var(--am-border)"}`,
    boxShadow: focused ? "0 0 0 1px var(--am-accent)" : "none",
    borderRadius: 12,
    color: "var(--am-text)",
    fontSize: 14,
    outline: "none",
    transition: "border-color 120ms ease, box-shadow 120ms ease",
  });

  return (
    <div
      className="aurora-theme dark"
      style={{
        position: "relative",
        minHeight: "100svh",
        background: "var(--am-bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      <AmbientBg />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 440,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <Glass strong padded={false} style={{ padding: "32px 28px" }}>
          {/* Hero */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 24 }}>
            <div
              aria-hidden
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "var(--am-irid)",
                boxShadow: "0 6px 20px rgba(255,80,80,0.28)",
                marginBottom: 14,
              }}
            />
            <div
              style={{
                fontFamily: "var(--am-display)",
                fontSize: 18,
                lineHeight: 1.1,
                letterSpacing: -0.2,
                color: "var(--am-text)",
              }}
            >
              The Fantastic Leagues
            </div>
            <div style={{ fontSize: 13, color: "var(--am-text-muted)", marginTop: 6 }}>
              Sign in to your league
            </div>
          </div>

          {/* OAuth */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
            <button
              type="button"
              onClick={() => { track("login", { method: "google" }); loginWithGoogle(); }}
              style={{
                width: "100%",
                height: 44,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                padding: "0 14px",
                borderRadius: 12,
                background: "rgba(66, 133, 244, 0.08)",
                border: "1px solid var(--am-border)",
                color: "var(--am-text)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 120ms ease, border-color 120ms ease",
              }}
            >
              <GoogleGlyph />
              Continue with Google
            </button>
          </div>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <div style={{ flex: 1, height: 1, background: "var(--am-border)" }} />
            <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--am-text-faint)", fontWeight: 600 }}>
              Or with email
            </div>
            <div style={{ flex: 1, height: 1, background: "var(--am-border)" }} />
          </div>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
                onFocus={() => setEmailFocus(true)}
                onBlur={() => setEmailFocus(false)}
                placeholder="you@example.com"
                style={inputStyle(emailFocus)}
              />
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <label
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.4,
                    textTransform: "uppercase",
                    color: "var(--am-text-faint)",
                    fontWeight: 600,
                  }}
                >
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  style={{
                    fontSize: 11,
                    color: "var(--am-text-muted)",
                    textDecoration: "underline",
                    textUnderlineOffset: 2,
                  }}
                >
                  Forgot password?
                </Link>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPasswordFocus(true)}
                  onBlur={() => setPasswordFocus(false)}
                  style={{ ...inputStyle(passwordFocus), paddingRight: 42 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: "var(--am-text-muted)",
                    cursor: "pointer",
                    padding: 4,
                    display: "inline-flex",
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error === "not_approved" && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  background: "rgba(255, 80, 80, 0.08)",
                  border: "1px solid var(--am-border)",
                  color: "var(--am-negative)",
                  fontSize: 12,
                }}
              >
                Your email is not approved. Contact your league admin for access.
              </div>
            )}

            {error === "email_not_confirmed" && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  background: "var(--am-surface-faint)",
                  border: "1px solid var(--am-border)",
                  fontSize: 12,
                  color: "var(--am-text)",
                }}
              >
                <div style={{ marginBottom: 8 }}>
                  Please check your email for a confirmation link before logging in.
                </div>
                {resendSuccess ? (
                  <div style={{ fontSize: 11, color: "var(--am-positive)" }}>
                    Confirmation email sent! Check your inbox.
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={resendLoading || !email}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--am-accent)",
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: resendLoading || !email ? "not-allowed" : "pointer",
                      opacity: resendLoading || !email ? 0.5 : 1,
                      textDecoration: "underline",
                      textUnderlineOffset: 2,
                    }}
                  >
                    {resendLoading ? "Sending..." : "Resend confirmation email"}
                  </button>
                )}
              </div>
            )}

            {error && error !== "not_approved" && error !== "email_not_confirmed" && (
              <div
                style={{
                  padding: 10,
                  borderRadius: 12,
                  background: "rgba(255, 80, 80, 0.08)",
                  border: "1px solid var(--am-border)",
                  color: "var(--am-negative)",
                  fontSize: 12,
                  fontWeight: 500,
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
                height: 46,
                marginTop: 4,
                borderRadius: 99,
                background: "var(--am-irid)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                boxShadow: "0 8px 24px rgba(255, 80, 80, 0.32)",
                transition: "opacity 120ms ease, transform 120ms ease",
                letterSpacing: 0.2,
              }}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          {import.meta.env.DEV && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--am-border)" }}>
              <button
                type="button"
                disabled={devLoading}
                onClick={async () => {
                  setDevLoading(true);
                  setError("");
                  try {
                    const res = await fetch("/api/auth/dev-login", { method: "POST" });
                    const { email: devEmail, password: devPwd, error: apiErr } = await res.json();
                    if (apiErr) throw new Error(apiErr);
                    await loginWithPassword(devEmail, devPwd);
                    window.location.href = "/";
                  } catch (err: unknown) {
                    setError(err instanceof Error ? err.message : "Dev login failed");
                  } finally {
                    setDevLoading(false);
                  }
                }}
                style={{
                  width: "100%",
                  height: 40,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  borderRadius: 12,
                  background: "var(--am-surface-faint)",
                  border: "1px solid var(--am-border)",
                  color: "var(--am-text-muted)",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  cursor: devLoading ? "not-allowed" : "pointer",
                  opacity: devLoading ? 0.5 : 1,
                }}
              >
                <span style={{ color: "#f5b400" }}>⚡</span>
                {devLoading ? "Logging in..." : "Dev Login"}
              </button>
            </div>
          )}
        </Glass>

        {/* Sign up footer */}
        <div style={{ textAlign: "center", fontSize: 13, color: "var(--am-text-muted)" }}>
          New to FBST?{" "}
          <Link
            to="/signup"
            style={{
              color: "var(--am-text)",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Sign up →
          </Link>
        </div>
      </div>
    </div>
  );
}

// Inline Google glyph — keeps the OAuth chip self-contained without
// pulling the legacy GoogleSignInButton chrome into the Aurora surface.
function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
      <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92a8.78 8.78 0 0 0 2.68-6.6z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26a5.4 5.4 0 0 1-3.04.86 5.34 5.34 0 0 1-5.02-3.7H.96v2.32A9 9 0 0 0 9 18z" fill="#34A853" />
      <path d="M3.98 10.71A5.41 5.41 0 0 1 3.7 9c0-.59.1-1.17.28-1.71V4.97H.96A8.99 8.99 0 0 0 0 9c0 1.45.35 2.82.96 4.03l3.02-2.32z" fill="#FBBC05" />
      <path d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.58-2.58A8.97 8.97 0 0 0 9 0 9 9 0 0 0 .96 4.97L3.98 7.3A5.34 5.34 0 0 1 9 3.58z" fill="#EA4335" />
    </svg>
  );
}
