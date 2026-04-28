/*
 * Signup — Aurora pre-auth port.
 *
 * Pre-auth pages (Login/Signup/etc.) sit OUTSIDE AuroraShell, so this
 * page mounts its own `.aurora-theme dark` wrapper + AmbientBg. All
 * hooks, callbacks, supabase auth calls, and validation/error handling
 * are preserved verbatim from the legacy implementation.
 */
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import GoogleSignInButton from "../../../components/GoogleSignInButton";
import { useAuth } from "../../../auth/AuthProvider";
import { track } from "../../../lib/posthog";
import "../../../components/aurora/aurora.css";
import { AmbientBg, Glass, SectionLabel } from "../../../components/aurora/atoms";

export default function Signup() {
  const { loginWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { supabase } = await import("../../../lib/supabase");
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      });

      if (signUpError) throw signUpError;

      track("signup", { method: "password" });
      setSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unknown error occurred";
      // Map Supabase error messages to user-friendly text
      if (msg.includes("already registered") || msg.includes("already_exists"))
        setError("An account with this email already exists. Try logging in.");
      else if (msg.includes("weak_password") || msg.includes("at least"))
        setError("Password must be at least 6 characters.");
      else if (msg.includes("rate_limit") || msg.includes("over_email_send_rate_limit"))
        setError("Too many attempts. Please try again in a few minutes.");
      else if (msg.includes("valid email") || msg.includes("invalid"))
        setError("Please enter a valid email address.");
      else
        setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Aurora field styles ──────────────────────────────────────────────
  const fieldLabelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "var(--am-text-faint)",
    marginBottom: 6,
    marginLeft: 2,
  };
  const fieldInputStyle: React.CSSProperties = {
    width: "100%",
    height: 44,
    padding: "0 14px",
    borderRadius: 12,
    background: "var(--am-surface-faint)",
    border: "1px solid var(--am-border)",
    color: "var(--am-text)",
    fontSize: 14,
    fontFamily: "var(--am-body)",
    outline: "none",
    transition: "border-color 120ms ease, box-shadow 120ms ease",
  };
  const fieldHintStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--am-text-faint)",
    marginTop: 6,
    marginLeft: 2,
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
          minHeight: "100svh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 16px 56px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 480 }}>
          {/* Brand mark */}
          <Link
            to="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 24,
              justifyContent: "center",
              textDecoration: "none",
            }}
          >
            <div
              aria-hidden
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "var(--am-irid)",
                boxShadow: "0 6px 20px rgba(255,80,80,0.28)",
                flexShrink: 0,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
              <span
                style={{
                  fontFamily: "var(--am-display)",
                  fontSize: 18,
                  fontWeight: 500,
                  color: "var(--am-text)",
                  letterSpacing: -0.2,
                }}
              >
                The Fantastic Leagues
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--am-text-faint)",
                  marginTop: 4,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                Fantasy baseball, powered by AI
              </span>
            </div>
          </Link>

          <Glass strong style={{ padding: 32 }}>
            <div style={{ marginBottom: 24, textAlign: "center" }}>
              <SectionLabel style={{ marginBottom: 8 }}>✦ Welcome</SectionLabel>
              <div
                style={{
                  fontFamily: "var(--am-display)",
                  fontSize: 28,
                  fontWeight: 400,
                  color: "var(--am-text)",
                  letterSpacing: -0.4,
                  marginBottom: 6,
                }}
              >
                Create your account
              </div>
              <div style={{ fontSize: 13, color: "var(--am-text-muted)" }}>
                Free for commissioners and managers
              </div>
            </div>

            {success ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "8px 0" }}>
                <div
                  style={{
                    padding: 16,
                    borderRadius: 14,
                    background: "var(--am-surface-faint)",
                    border: "1px solid var(--am-border)",
                    color: "var(--am-text)",
                    fontSize: 13,
                    textAlign: "center",
                    width: "100%",
                  }}
                >
                  Check your email for a confirmation link to activate your account.
                </div>
                <Link
                  to="/login"
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--am-accent)",
                    textDecoration: "none",
                  }}
                >
                  Back to Log in →
                </Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Google OAuth */}
                <GoogleSignInButton
                  label="Continue with Google"
                  onClick={() => {
                    track("signup", { method: "google" });
                    loginWithGoogle();
                  }}
                />

                {/* Divider */}
                <div style={{ position: "relative", padding: "4px 0" }}>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ width: "100%", borderTop: "1px solid var(--am-border)" }} />
                  </div>
                  <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
                    <span
                      style={{
                        background: "var(--am-surface-strong)",
                        padding: "0 12px",
                        fontSize: 10,
                        letterSpacing: 1.4,
                        textTransform: "uppercase",
                        fontWeight: 600,
                        color: "var(--am-text-faint)",
                      }}
                    >
                      Or sign up with email
                    </span>
                  </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={fieldLabelStyle}>Full name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      style={fieldInputStyle}
                      placeholder="Jane Manager"
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "var(--am-accent)";
                        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(92, 240, 212, 0.15)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "var(--am-border)";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    />
                    <div style={fieldHintStyle}>Shown on your team profile</div>
                  </div>

                  <div>
                    <label style={fieldLabelStyle}>Email</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={fieldInputStyle}
                      placeholder="you@example.com"
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "var(--am-accent)";
                        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(92, 240, 212, 0.15)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "var(--am-border)";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    />
                    <div style={fieldHintStyle}>We'll send you a confirmation link</div>
                  </div>

                  <div>
                    <label style={fieldLabelStyle}>Password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{ ...fieldInputStyle, paddingRight: 44 }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = "var(--am-accent)";
                          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(92, 240, 212, 0.15)";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = "var(--am-border)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
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
                          cursor: "pointer",
                          color: "var(--am-text-faint)",
                          display: "flex",
                          alignItems: "center",
                          padding: 4,
                        }}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <div style={fieldHintStyle}>At least 6 characters</div>
                  </div>

                  {error && (
                    <div
                      role="alert"
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        background: "var(--am-surface-faint)",
                        border: "1px solid var(--am-negative)",
                        color: "var(--am-negative)",
                        fontSize: 12,
                        fontWeight: 600,
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
                      borderRadius: 99,
                      border: "1px solid var(--am-border-strong)",
                      background: "var(--am-irid)",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 600,
                      letterSpacing: 0.2,
                      cursor: loading ? "not-allowed" : "pointer",
                      opacity: loading ? 0.6 : 1,
                      transition: "transform 80ms ease, opacity 120ms ease",
                      boxShadow: "0 8px 26px rgba(74, 140, 255, 0.30)",
                    }}
                    onMouseDown={(e) => {
                      if (!loading) e.currentTarget.style.transform = "scale(0.985)";
                    }}
                    onMouseUp={(e) => {
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    {loading ? "Creating account…" : "Create account"}
                  </button>
                </form>
              </div>
            )}
          </Glass>

          {/* Footer — sign-in link */}
          <div style={{ marginTop: 24, textAlign: "center" }}>
            <span style={{ fontSize: 13, color: "var(--am-text-muted)" }}>
              Already have an account?{" "}
              <Link
                to="/login"
                style={{
                  color: "var(--am-accent)",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Sign in →
              </Link>
            </span>
          </div>

          {/* Marketing footer links */}
          <div
            style={{
              marginTop: 32,
              paddingTop: 20,
              borderTop: "1px solid var(--am-border)",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 14,
                fontSize: 11,
                color: "var(--am-text-faint)",
              }}
            >
              <Link to="/discover" style={{ color: "inherit", textDecoration: "none" }}>
                Discover Leagues
              </Link>
              <span aria-hidden>·</span>
              <Link to="/pricing" style={{ color: "inherit", textDecoration: "none" }}>
                Pricing
              </Link>
              <span aria-hidden>·</span>
              <a
                href="https://www.thefantasticleagues.com"
                rel="noopener noreferrer"
                style={{ color: "inherit", textDecoration: "none" }}
              >
                About
              </a>
            </div>
            <a
              href="https://www.thefantasticleagues.com"
              rel="noopener noreferrer"
              style={{
                fontSize: 11,
                color: "var(--am-text-faint)",
                opacity: 0.7,
                textDecoration: "none",
              }}
            >
              ← thefantasticleagues.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
