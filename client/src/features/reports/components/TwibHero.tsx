/**
 * Retro broadcast-style hero mark for the Weekly Report.
 * Evokes 1970s-80s baseball highlight shows without reproducing the MLB TWIB logo.
 * Pure inline SVG + text — no image assets, no external fonts beyond Inter.
 */
export function TwibHero({ label }: { label: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--lg-border-subtle)] bg-gradient-to-br from-[#0b1e4a] via-[#152a5c] to-[#0b1e4a] px-6 py-8 md:px-10 md:py-12">
      {/* Stripes backdrop — hints at retro broadcast bumper */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-45deg, #fff 0, #fff 2px, transparent 2px, transparent 12px)",
        }}
      />

      <div className="relative flex items-center gap-4 md:gap-6">
        {/* Baseball with motion lines */}
        <svg
          viewBox="0 0 80 80"
          className="h-14 w-14 md:h-20 md:w-20 shrink-0"
          aria-hidden
        >
          <defs>
            <radialGradient id="twib-ball" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#e5e5e5" />
            </radialGradient>
          </defs>
          {/* Motion lines */}
          <line x1="2" y1="32" x2="18" y2="32" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" />
          <line x1="2" y1="42" x2="14" y2="42" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" />
          <line x1="2" y1="52" x2="18" y2="52" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" />
          {/* Baseball */}
          <circle cx="50" cy="42" r="24" fill="url(#twib-ball)" stroke="#111" strokeWidth="1.5" />
          {/* Stitching */}
          <path
            d="M 32 28 Q 40 42 32 56"
            fill="none"
            stroke="#dc2626"
            strokeWidth="1.5"
            strokeDasharray="2 3"
          />
          <path
            d="M 68 28 Q 60 42 68 56"
            fill="none"
            stroke="#dc2626"
            strokeWidth="1.5"
            strokeDasharray="2 3"
          />
        </svg>

        {/* Wordmark */}
        <div className="flex-1 min-w-0">
          <div className="font-black uppercase tracking-[0.08em] leading-none text-white text-xl md:text-3xl">
            This Week in Baseball
          </div>
          <div className="mt-2 font-semibold uppercase tracking-[0.2em] text-xs md:text-sm text-[#fbbf24]">
            {label}
          </div>
        </div>

        {/* Red accent block — classic broadcast chyron vibe */}
        <div className="hidden md:flex h-16 w-2 bg-[#dc2626] shrink-0" aria-hidden />
      </div>
    </div>
  );
}
