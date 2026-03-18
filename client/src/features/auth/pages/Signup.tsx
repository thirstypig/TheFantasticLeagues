import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import GoogleSignInButton from "../../../components/GoogleSignInButton";
import { Logo } from "../../../components/ui/Logo";
import { useAuth } from "../../../auth/AuthProvider";

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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      
      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
        <Link to="/" className="flex items-center gap-3 mb-12 justify-center group">
          <Logo size={40} />
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-[var(--lg-text-heading)] leading-none">TFL</span>
            <span className="text-xs font-bold tracking-wide text-[var(--lg-text-muted)] opacity-60 uppercase mt-0.5">The Fantastic Leagues</span>
          </div>
        </Link>

        <div className="lg-card p-8 md:p-10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[var(--lg-accent)] to-transparent opacity-50" />
          
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--lg-text-heading)] mb-2">Create Account</h2>
            <p className="text-sm font-medium text-[var(--lg-text-secondary)] opacity-60">Create your free account</p>
          </div>

          <div className="space-y-6">
            {success ? (
              <div className="text-center space-y-4">
                <div className="p-4 rounded-xl bg-[var(--lg-success)]/10 border border-[var(--lg-success)]/20 text-[var(--lg-success)] text-sm font-medium">
                  Check your email for a confirmation link to activate your account.
                </div>
                <Link to="/login" className="text-sm font-bold text-[var(--lg-accent)] hover:underline">
                  Back to Login
                </Link>
              </div>
            ) : (<>
            <div>
              <GoogleSignInButton label="Continue with Google" onClick={loginWithGoogle} />
            </div>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--lg-border-faint)]"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wide">
                <span className="bg-[var(--lg-card-bg)] px-3 text-[var(--lg-text-muted)] font-bold">Or sign up with email</span>
              </div>
            </div>

            <form onSubmit={handleSignup} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-[var(--lg-text-muted)] mb-2 ml-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] focus:border-[var(--lg-accent)] focus:ring-1 focus:ring-[var(--lg-accent)] outline-none transition-all text-sm font-medium"
                  placeholder="John Doe"
                />
              </div>
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
                <label className="block text-xs font-bold text-[var(--lg-text-muted)] mb-2 ml-1">
                  Password
                </label>
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

              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-[var(--lg-accent)] hover:bg-[var(--lg-accent-hover)] text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 active:scale-[0.98]"
              >
                {loading ? "Creating account..." : "Create Account"}
              </button>
            </form>
            </>)}
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm font-medium text-[var(--lg-text-muted)] opacity-60 flex items-center justify-center gap-2">
            Already have an account? 
            <Link 
              to="/login"
              className="font-bold text-[var(--lg-accent)] hover:text-[var(--lg-accent-hover)] transition-colors"
            >
              Log In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
