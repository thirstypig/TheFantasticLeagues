import React from "react";
import { Link } from "react-router-dom";
import { Logo } from "../../../components/ui/Logo";

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-3xl animate-in fade-in zoom-in-95 duration-1000">
        <div className="mx-auto mb-12">
          <Logo size={96} />
        </div>

        <h1 className="text-3xl md:text-7xl font-bold tracking-tight text-[var(--lg-text-heading)] mb-6 leading-none">
          The Fantastic<br />
          <span className="text-[var(--lg-accent)]">Leagues</span>
        </h1>
        
        <p className="text-lg md:text-xl font-medium text-[var(--lg-text-secondary)] mb-12 leading-relaxed opacity-70 max-w-xl mx-auto">
          Your fantasy baseball hub. Track stats, manage rosters, and dominate your league.
        </p>

        <div className="flex flex-col md:flex-row items-center justify-center gap-4">
          <Link 
            to="/login" 
            className="lg-button lg-button-primary px-12 py-4 text-lg shadow-2xl shadow-blue-500/30 w-full md:w-auto"
          >
            Log In
          </Link>
          <Link 
            to="/signup" 
            className="lg-button lg-button-secondary px-12 py-4 text-lg w-full md:w-auto"
          >
            Create Account
          </Link>
        </div>
      </div>
    </div>
  );
}
