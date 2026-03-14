import React, { useState } from "react";
import { Link } from "react-router-dom";

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
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      setMessage(data.message);
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
             Recover <br/> Access.
           </h1>
           <p className="text-lg text-white/70 max-w-md leading-relaxed">
             Enter your email and we'll send you a link to reset your password.
           </p>
        </div>
      </div>

      <div className="lg-auth-form-area">
         <div className="lg-auth-form-card">
           <div className="mb-8">
             <h2 className="lg-heading-2 mb-2">Reset Password</h2>
             <p className="text-sm text-[var(--lg-text-muted)]">We'll help you get back in.</p>
           </div>

           {message ? (
             <div className="space-y-6">
                <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                  {message}
                </div>
                <Link 
                  to="/login"
                  className="w-full h-11 bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] hover:bg-[var(--lg-tint-hover)] text-white font-semibold rounded-xl transition-all text-center flex items-center justify-center"
                >
                  Return to Login
                </Link>
             </div>
           ) : (
             <form onSubmit={handleRequest} className="space-y-4">
               <div>
                 <label className="block text-xs font-medium text-[var(--lg-text-muted)] uppercase tracking-wider mb-1.5 ml-1">
                   Email Address
                 </label>
                 <input
                   type="email"
                   required
                   value={email}
                   onChange={(e) => setEmail(e.target.value)}
                   className="w-full h-11 px-4 rounded-xl bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] focus:border-[var(--lg-accent)] focus:ring-1 focus:ring-[var(--lg-accent)] outline-none transition-all placeholder:text-white/20"
                   placeholder="name@example.com"
                 />
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
                 {loading ? "Sending..." : "Send Reset Link"}
               </button>

               <div className="text-center">
                 <Link to="/login" className="text-xs text-[var(--lg-text-muted)] hover:text-white transition-colors">
                   Back to Login
                 </Link>
               </div>
             </form>
           )}
         </div>
      </div>
    </div>
  );
}
