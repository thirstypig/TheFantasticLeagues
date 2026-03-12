// client/src/pages/Login.tsx
import React, { useState } from "react";
import GoogleSignInButton from "../../../components/GoogleSignInButton";
import { Link, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../../../auth/AuthProvider";

export default function Login() {
  const [searchParams] = useSearchParams();
  const urlError = searchParams.get("error");
  
  const { loginWithGoogle, loginWithYahoo, loginWithPassword } = useAuth();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(urlError === "not_approved" ? "not_approved" : "");
  const [loading, setLoading] = useState(false);
  const [devLoading, setDevLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await loginWithPassword(email, password);
      window.location.href = "/";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      
      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
        <Link to="/" className="flex items-center gap-3 mb-12 justify-center group">
          <div className="w-10 h-10 rounded-xl bg-[var(--lg-accent)] flex items-center justify-center text-white font-bold text-sm shadow-2xl shadow-blue-500/40 transform group-hover:-rotate-6 transition-transform">FBST</div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-[var(--lg-text-heading)] leading-none">FBST</span>
            <span className="text-xs font-bold tracking-wide text-[var(--lg-text-muted)] opacity-60 uppercase mt-0.5">Fantasy Baseball Stat Tool</span>
          </div>
        </Link>

        <div className="lg-card p-8 md:p-10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[var(--lg-accent)] to-transparent opacity-50" />
          
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--lg-text-heading)] mb-2">Log In</h2>
            <p className="text-sm font-medium text-[var(--lg-text-secondary)] opacity-60">Sign in to your account</p>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <GoogleSignInButton label="Google" onClick={loginWithGoogle} />
              <button
                type="button"
                onClick={loginWithYahoo}
                className="flex items-center justify-center gap-2 w-full h-11 px-4 rounded-xl bg-[#6001d2]/10 border border-[#6001d2]/20 hover:bg-[#6001d2]/20 hover:border-[#6001d2]/30 text-white font-medium transition-all duration-200"
              >
                <span className="w-5 h-5 flex items-center justify-center bg-[#6001d2] rounded-full text-xs font-bold">Y</span>
                Yahoo
              </button>
            </div>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--lg-border-faint)]"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wide">
                <span className="bg-[var(--lg-card-bg)] px-3 text-[var(--lg-text-muted)] font-bold">Or sign in with email</span>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-[var(--lg-text-muted)] mb-2 ml-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] focus:border-[var(--lg-accent)] focus:ring-1 focus:ring-[var(--lg-accent)] outline-none transition-all placeholder:text-white/20 text-sm font-medium"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2 ml-1">
                  <label className="block text-xs font-bold text-[var(--lg-text-muted)]">
                    Password
                  </label>
                  <Link to="/forgot-password" title="Forgot Password" className="text-xs font-bold text-[var(--lg-accent)] hover:underline">
                    Forgot Password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-12 pl-4 pr-11 rounded-xl bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] focus:border-[var(--lg-accent)] focus:ring-1 focus:ring-[var(--lg-accent)] outline-none transition-all text-sm font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--lg-text-muted)] hover:text-white transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error === 'not_approved' && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300">
                  Your email is not approved. Contact your league admin for access.
                </div>
              )}

              {error && error !== 'not_approved' && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-[var(--lg-accent)] hover:bg-[var(--lg-accent-hover)] text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 active:scale-[0.98]"
              >
                {loading ? "Logging in..." : "Log In"}
              </button>
            </form>

            {import.meta.env.DEV && (
              <div className="pt-6 border-t border-[var(--lg-border-faint)]">
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
                  className="flex items-center justify-center gap-2 w-full h-12 px-6 rounded-xl bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] hover:bg-[var(--lg-tint-hover)] hover:border-[var(--lg-border-subtle)] text-white font-bold text-xs uppercase tracking-wide transition-all disabled:opacity-50"
                >
                  <span className="text-amber-400">⚡</span> {devLoading ? "Logging in..." : "Dev Login"}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm font-medium text-[var(--lg-text-muted)] opacity-60 flex items-center justify-center gap-2">
            Don't have an account? 
            <Link 
              to="/signup"
              className="font-bold text-[var(--lg-accent)] hover:text-[var(--lg-accent-hover)] transition-colors"
            >
              Sign Up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
