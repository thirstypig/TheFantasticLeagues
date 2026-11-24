// The Archive section's tabs: Season | Trophy case | Player check. Links, not
// in-page tabs, because Player check is its own page (/archive/player-check);
// both pages render this strip so it reads as one section. Player check shows
// only to people allowed on it (site admins and owners let in on "Who can help").
import React from "react";
import { Link } from "react-router-dom";

export type ArchiveTab = "season" | "trophy" | "check";

export function ArchiveTabs({ active, season, showCheck }: { active: ArchiveTab; season?: number | null; showCheck: boolean }) {
  const tabs: { key: ArchiveTab; label: string; to: string }[] = [
    { key: "season", label: "Season", to: season ? `/archive?season=${season}` : "/archive" },
    { key: "trophy", label: "Trophy case", to: "/archive?tab=trophy" },
  ];
  if (showCheck) tabs.push({ key: "check", label: "Player check", to: "/archive/player-check" });
  return (
    <nav className="arc-tabs" aria-label="Archive">
      {tabs.map((t) => (
        <Link key={t.key} to={t.to} aria-current={t.key === active ? "page" : undefined}>{t.label}</Link>
      ))}
    </nav>
  );
}
