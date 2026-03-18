import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../../../lib/supabase";

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

  if (!ready) {
    return (
      <div className="lg-auth-container flex items-center justify-center">
        <div className="lg-auth-form-card text-center">
          <div className="mb-4 text-[var(--lg-text-muted)]">
            <div className="animate-spin h-8 w-8 border-2 border-[var(--lg-accent)] border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-sm">Verifying your reset link...</p>
          </div>
          <p className="text-xs text-[var(--lg-text-muted)] mt-4">
            If this takes too long, the link may have expired.{" "}
            <Link to="/forgot-password" className="text-[var(--lg-accent)] hover:underline">
              Request a new one
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="lg-auth-container">
      <div className="lg-auth-hero">
        <div>
           <div className="flex items-center gap-3 mb-8">
             <div className="w-10 h-10 rounded-xl bg-[var(--lg-tint-hover)] border border-[var(--lg-border-subtle)] flex items-center justify-center backdrop-blur-sm">
               <span className="font-bold text-white text-lg">F</span>
             </div>
             <div className="text-xl font-bold tracking-tight text-white">TFL</div>
           </div>
           <h1 className="text-4xl md:text-3xl font-extrabold tracking-tight mb-6 text-white leading-tight">
             New <br/> Beginnings.
           </h1>
           <p className="text-lg text-white/70 max-w-md leading-relaxed">
             Secure your account by choosing a strong new password.
           </p>
        </div>
      </div>

      <div className="lg-auth-form-area">
         <div className="lg-auth-form-card">
           <div className="mb-8">
             <h2 className="lg-heading-2 mb-2">Create New Password</h2>
             <p className="text-sm text-[var(--lg-text-muted)]">Almost there!</p>
           </div>

           {message ? (
             <div className="space-y-6">
                <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                  {message}
                </div>
                <Link
                  to="/login"
                  className="w-full h-11 bg-[var(--lg-accent)] hover:bg-[var(--lg-accent-hover)] text-white font-semibold rounded-xl transition-all text-center flex items-center justify-center"
                >
                  Sign In Now
                </Link>
             </div>
           ) : (
             <form onSubmit={handleReset} className="space-y-4">
               <div>
                 <label className="block text-xs font-medium text-[var(--lg-text-muted)] uppercase tracking-wider mb-1.5 ml-1">
                   New Password
                 </label>
                 <div className="relative">
                   <input
                     type={showPassword ? "text" : "password"}
                     required
                     value={password}
                     onChange={(e) => setPassword(e.target.value)}
                     className="w-full h-11 pl-4 pr-11 rounded-xl bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] focus:border-[var(--lg-accent)] focus:ring-1 focus:ring-[var(--lg-accent)] outline-none transition-all"
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
               <div>
                 <label className="block text-xs font-medium text-[var(--lg-text-muted)] uppercase tracking-wider mb-1.5 ml-1">
                   Confirm New Password
                 </label>
                 <div className="relative">
                   <input
                     type={showConfirmPassword ? "text" : "password"}
                     required
                     value={confirmPassword}
                     onChange={(e) => setConfirmPassword(e.target.value)}
                     className="w-full h-11 pl-4 pr-11 rounded-xl bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] focus:border-[var(--lg-accent)] focus:ring-1 focus:ring-[var(--lg-accent)] outline-none transition-all"
                   />
                   <button
                     type="button"
                     onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                     className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--lg-text-muted)] hover:text-white transition-colors"
                     tabIndex={-1}
                   >
                     {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                   </button>
                 </div>
               </div>

               {error && (
                 <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                   {error}
                 </div>
               )}

               <button
                 type="submit"
                 disabled={loading}
                 className="w-full h-11 bg-[var(--lg-accent)] hover:bg-[var(--lg-accent-hover)] text-white font-semibold rounded-xl transition-all shadow-lg shadow-[var(--lg-accent)]/20 disabled:opacity-50"
               >
                 {loading ? "Updating..." : "Update Password"}
               </button>
             </form>
           )}
         </div>
      </div>
    </div>
  );
}
