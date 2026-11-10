import { useState, useEffect } from "react";
import { Palette, RotateCcw, Check, Sun, Moon } from "lucide-react";
import {
  type Palette as PaletteDef,
  DARK_PALETTES,
  LIGHT_PALETTES,
  COLOR_LAB_STORAGE_KEY,
  applyPalette,
  resetPalette,
  findPaletteById,
} from "../../../lib/colorLabPalettes";

/**
 * Color palette lab — preview alternate token values without committing.
 *
 * Palettes + persistence + reapply-on-boot live in
 * `client/src/lib/colorLabPalettes.ts` so `main.tsx` can reapply the user's
 * last choice before React mounts. This component just drives the UI.
 */

function PaletteCard({
  palette,
  isActive,
  onApply,
}: {
  palette: PaletteDef;
  isActive: boolean;
  onApply: (p: PaletteDef) => void;
}) {
  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{
        background: palette.tokens["--lg-bg-card"],
        borderColor: palette.tokens["--lg-border-subtle"],
        color: palette.tokens["--lg-text-primary"],
      }}
    >
      <div className="flex gap-1.5">
        {Object.entries(palette.tokens).slice(0, 6).map(([key, value]) => (
          <div
            key={key}
            title={`${key}: ${value}`}
            className="h-6 w-6 rounded border"
            style={{ background: value, borderColor: palette.tokens["--lg-border-subtle"] }}
          />
        ))}
      </div>

      <div>
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold" style={{ color: palette.tokens["--lg-text-heading"] }}>
            {palette.name}
          </h4>
          {isActive && (
            <span
              className="flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
              style={{ background: palette.tokens["--lg-accent"], color: palette.tokens["--lg-bg-page"] }}
            >
              <Check className="w-3 h-3" /> Preview
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5" style={{ color: palette.tokens["--lg-text-muted"] }}>
          {palette.tagline}
        </p>
      </div>

      <div
        className="rounded border p-3 space-y-2"
        style={{
          background: palette.tokens["--lg-bg-page"],
          borderColor: palette.tokens["--lg-border-subtle"],
        }}
      >
        <div className="text-xs font-semibold" style={{ color: palette.tokens["--lg-text-heading"] }}>
          Skunk Dogs · 114 R
        </div>
        <div className="text-[11px]" style={{ color: palette.tokens["--lg-text-muted"] }}>
          +6 vs last week · 2.55 ERA · 7.5 pts
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-[10px] font-bold uppercase px-2 py-1 rounded"
            style={{ background: palette.tokens["--lg-accent"], color: palette.tokens["--lg-bg-page"] }}
          >
            Propose trade
          </button>
          <span
            className="text-[10px] px-2 py-0.5 rounded"
            style={{ background: palette.tokens["--lg-tint"], color: palette.tokens["--lg-text-primary"] }}
          >
            Hover tint
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onApply(palette)}
        className="w-full text-xs font-semibold py-2 rounded border transition-colors"
        style={{
          background: isActive ? palette.tokens["--lg-accent"] : "transparent",
          color: isActive ? palette.tokens["--lg-bg-page"] : palette.tokens["--lg-accent"],
          borderColor: palette.tokens["--lg-accent"],
        }}
      >
        {isActive ? "Previewing site-wide" : "Preview site-wide"}
      </button>
    </div>
  );
}

export default function ColorLab() {
  // Seed from sessionStorage so a reload keeps the active preview selected.
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(COLOR_LAB_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [mode, setMode] = useState<"dark" | "light">(() => {
    const stored = findPaletteById(activeId);
    if (stored) return stored.mode;
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  });

  // Keep the mode toggle in sync if the user opens the sidebar theme switcher.
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      if (activeId) return; // user-selected preview wins
      setMode(root.classList.contains("dark") ? "dark" : "light");
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [activeId]);

  const palettes = mode === "dark" ? DARK_PALETTES : LIGHT_PALETTES;

  const handleApply = (p: PaletteDef) => {
    if (activeId === p.id) {
      resetPalette();
      setActiveId(null);
    } else {
      applyPalette(p);
      setActiveId(p.id);
    }
  };

  const handleReset = () => {
    resetPalette();
    setActiveId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Palette className="w-5 h-5 text-[var(--lg-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--lg-text-heading)]">Color System Lab</h2>
        <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400">
          BETA
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-[var(--lg-border-subtle)] overflow-hidden">
            <button
              type="button"
              onClick={() => setMode("dark")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ${
                mode === "dark"
                  ? "bg-[var(--lg-accent)] text-[var(--lg-on-accent)]"
                  : "text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]"
              }`}
            >
              <Moon className="w-3 h-3" /> Dark
            </button>
            <button
              type="button"
              onClick={() => setMode("light")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ${
                mode === "light"
                  ? "bg-[var(--lg-accent)] text-[var(--lg-on-accent)]"
                  : "text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]"
              }`}
            >
              <Sun className="w-3 h-3" /> Light
            </button>
          </div>
          {activeId && (
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--lg-border-subtle)] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-[var(--lg-text-muted)] max-w-2xl">
        Preview candidate palettes live. Click any <em>Preview site-wide</em> to apply to the whole app — navigate around, check the Players/Season tables, then return here to reset or pick a different one. Selection persists across page reloads; hit <em>Reset</em> or clear your session to remove.
        <br />
        <span className="opacity-75">
          Ship a winner by updating <code className="text-[10px] px-1 rounded bg-[var(--lg-tint)]">client/src/index.css</code> tokens to match.
        </span>
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {palettes.map((p) => (
          <PaletteCard key={p.id} palette={p} isActive={activeId === p.id} onApply={handleApply} />
        ))}
      </div>
    </div>
  );
}
