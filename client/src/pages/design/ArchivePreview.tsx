// client/src/pages/design/ArchivePreview.tsx
//
// Static preview of the rebuilt past-seasons archive (PR 3 of the archive
// rebuild). Real 2024 and 2007 data from the parsed commissioner workbooks;
// owner names are placeholders because the repo is public.
//
// NO BUSINESS LOGIC, no API calls. Admin-gated like the other /design pages.
//
// Layout decisions it demonstrates (James, 2026-11-20):
//   - a season opens on its final standings (team, owner, points per period, total)
//   - tapping a team expands its detail inline (no modal): draft + keepers,
//     moves at each meeting, final roster
//   - years without per-period rosters (2007) show the same page with the
//     moves section explaining what the workbook doesn't have
//   - no player stat lines until the re-score (PR 4)

import { useMemo, useState } from "react";
import { Glass, SectionLabel } from "../../components/aurora/atoms";
import { useAuth } from "../../auth/AuthProvider";
import { ARCHIVE_PREVIEW } from "./archivePreviewData";

interface PTeam { code: string; name: string; owner: string | null; points: (number | null)[]; total: number | null }
interface PEntry { slot: string; name: string; price?: number | string | null; keeper?: boolean }
interface PSeason {
  year: number;
  teams: PTeam[];
  draft: Record<string, PEntry[]> | null;
  periods: number[];
  moves: { period: number; byTeam: Record<string, { added: string[]; dropped: string[] }> }[];
  final: Record<string, PEntry[]> | null;
}

const SEASONS = ARCHIVE_PREVIEW as unknown as Record<string, PSeason>;
const YEARS = Object.keys(SEASONS).sort().reverse();

const cell: React.CSSProperties = { padding: "8px 10px", fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const head: React.CSSProperties = { ...cell, fontWeight: 600, color: "var(--am-text-faint)", letterSpacing: 0.5 };

function fmt(n: number | null) {
  return n === null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function TeamDetail({ season, team }: { season: PSeason; team: PTeam }) {
  const draft = season.draft?.[team.code] ?? [];
  const keepers = draft.filter((e) => e.keeper);
  const final = season.final?.[team.code] ?? [];
  const moves = season.moves.map((m) => ({ period: m.period, ...m.byTeam[team.code] })).filter((m) => m.added?.length || m.dropped?.length);
  const hasPeriods = season.periods.length > 1;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, padding: "12px 4px 4px" }}>
      <section>
        <SectionLabel>Draft day{keepers.length ? ` · ${keepers.length} possible keepers` : ""}</SectionLabel>
        {draft.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--am-text-faint)" }}>No draft sheet for this year.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {draft.map((e, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--am-border)" }}>
                  <td style={{ ...cell, textAlign: "left", width: 40, color: "var(--am-text-faint)" }}>{e.slot}</td>
                  <td style={{ ...cell, textAlign: "left" }}>
                    {e.name}
                    {e.keeper && <span title="Same team and same price as at the end of last season: kept, or bought back for the same price" style={{ marginLeft: 6, fontSize: 13, color: "var(--am-accent)" }}>possible keeper</span>}
                  </td>
                  <td style={cell}>{typeof e.price === "number" ? `$${e.price}` : e.price ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <SectionLabel>Moves at each meeting</SectionLabel>
        {!hasPeriods ? (
          <p style={{ fontSize: 13, color: "var(--am-text-faint)", lineHeight: 1.5 }}>
            The {season.year} workbook only has draft-day and end-of-season rosters, so the meeting-by-meeting moves aren't known.
            Compare the two lists to see who came and went during the season.
          </p>
        ) : moves.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--am-text-faint)" }}>No moves.</p>
        ) : (
          moves.map((m) => (
            <div key={m.period} style={{ borderTop: "1px solid var(--am-border)", padding: "8px 0", fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Before period {m.period}</div>
              {m.added.map((n) => <div key={"a" + n} style={{ color: "var(--am-positive)" }}>+ {n}</div>)}
              {m.dropped.map((n) => <div key={"d" + n} style={{ color: "var(--am-text-muted)" }}>− {n}</div>)}
            </div>
          ))
        )}
      </section>

      <section>
        <SectionLabel>End of season</SectionLabel>
        {final.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--am-text-faint)" }}>No final roster for this year.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {final.map((e, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--am-border)" }}>
                  <td style={{ ...cell, textAlign: "left", width: 40, color: "var(--am-text-faint)" }}>{e.slot}</td>
                  <td style={{ ...cell, textAlign: "left" }}>{e.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export default function ArchivePreview() {
  const { user } = useAuth();
  const [year, setYear] = useState(YEARS[0]);
  const [open, setOpen] = useState<string | null>(null);
  const season = SEASONS[year];

  const ranked = useMemo(
    () => [...season.teams].sort((a, b) => (b.total ?? 0) - (a.total ?? 0)),
    [season],
  );
  const nPeriods = Math.max(...season.teams.map((t) => t.points.length));
  const best = Array.from({ length: nPeriods }, (_, i) => Math.max(...season.teams.map((t) => t.points[i] ?? -Infinity)));

  // Admin-gated in production; open in local dev so it can be checked without an admin login.
  if (!user?.isAdmin && !import.meta.env.DEV) {
    return (
      <Glass strong>
        <SectionLabel>✦ Design preview</SectionLabel>
        <p style={{ fontSize: 13 }}>Admins only.</p>
      </Glass>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, color: "var(--am-text)" }}>
      <Glass strong>
        <SectionLabel>✦ Design preview · past seasons</SectionLabel>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <h1 style={{ fontFamily: "var(--am-display)", fontSize: 32, fontWeight: 300, margin: 0 }}>{year} season</h1>
          <div style={{ display: "flex", gap: 6 }}>
            {YEARS.map((y) => (
              <button
                key={y}
                onClick={() => { setYear(y); setOpen(null); }}
                style={{
                  padding: "6px 12px", borderRadius: 999, fontSize: 13, cursor: "pointer", minHeight: 44,
                  background: y === year ? "var(--am-chip-strong)" : "var(--am-chip)",
                  border: "1px solid " + (y === year ? "var(--am-border-strong)" : "var(--am-border)"),
                  color: "var(--am-text)",
                }}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 13, color: "var(--am-text-muted)", margin: "8px 0 0" }}>
          Final standings as recorded in the commissioner's workbook. Points per scoring period; tap a team for its draft, moves and final roster.
          {season.periods.length <= 1 && " This year's workbook has no rosters between draft day and the end of the season."}
        </p>
      </Glass>

      <Glass>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: "left", width: 32 }}>#</th>
              <th style={{ ...head, textAlign: "left" }}>Team</th>
              {Array.from({ length: nPeriods }, (_, i) => (
                <th key={i} style={head}>P{i + 1}</th>
              ))}
              <th style={head}>Total</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((t, idx) => (
              <FragmentRow
                key={t.code}
                rank={idx + 1}
                team={t}
                nPeriods={nPeriods}
                best={best}
                isOpen={open === t.code}
                onToggle={() => setOpen(open === t.code ? null : t.code)}
                detail={<TeamDetail season={season} team={t} />}
              />
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 13, color: "var(--am-text-faint)", margin: "10px 4px 0" }}>
          Bold = best score that period. Player stats return for 2016 and 2021–2025 once those seasons are re-scored.
        </p>
      </Glass>
    </div>
  );
}

function FragmentRow(props: {
  rank: number; team: PTeam; nPeriods: number; best: number[];
  isOpen: boolean; onToggle: () => void; detail: React.ReactNode;
}) {
  const { rank, team, nPeriods, best, isOpen, onToggle, detail } = props;
  return (
    <>
      <tr
        onClick={onToggle}
        style={{ borderTop: "1px solid var(--am-border)", cursor: "pointer", background: isOpen ? "var(--am-chip)" : "transparent" }}
        aria-expanded={isOpen}
      >
        <td style={{ ...cell, textAlign: "left", color: "var(--am-text-muted)" }}>{rank}</td>
        <td style={{ ...cell, textAlign: "left" }}>
          <span style={{ fontWeight: 600 }}>{team.name}</span>
          {team.owner && <span style={{ marginLeft: 8, color: "var(--am-text-faint)" }}>{team.owner}</span>}
          <span style={{ marginLeft: 8, color: "var(--am-text-faint)" }}>{isOpen ? "▾" : "▸"}</span>
        </td>
        {Array.from({ length: nPeriods }, (_, i) => {
          const v = team.points[i] ?? null;
          return <td key={i} style={{ ...cell, fontWeight: v !== null && v === best[i] ? 700 : 400 }}>{fmt(v)}</td>;
        })}
        <td style={{ ...cell, fontWeight: 700 }}>{fmt(team.total)}</td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={nPeriods + 3} style={{ padding: "0 6px 12px" }}>{detail}</td>
        </tr>
      )}
    </>
  );
}
