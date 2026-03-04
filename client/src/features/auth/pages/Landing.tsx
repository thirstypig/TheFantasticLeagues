import React from "react";
import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-3xl animate-in fade-in zoom-in-95 duration-1000">
        <div className="w-24 h-24 rounded-3xl bg-[var(--lg-accent)] flex items-center justify-center text-white font-bold text-3xl shadow-2xl shadow-blue-500/40 transform -rotate-6 hover:rotate-0 transition-transform duration-700 mx-auto mb-12">
          FBST
        </div>
        
        <h1 className="text-3xl md:text-7xl font-bold tracking-tight text-[var(--lg-text-heading)] mb-6 leading-none">
          Fantasy Baseball<br />
          <span className="text-[var(--lg-accent)]">Stat Tool</span>
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
