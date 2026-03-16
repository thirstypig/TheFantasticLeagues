import React, { useEffect, useRef, useMemo, useState } from "react";

import { adminCreateLeague, adminDeleteLeague, adminImportRosters, getLeagues, type LeagueListItem } from "../../../api";
import { Button } from "../../../components/ui/button";

export default function AdminLeagueTools() {
  const [error, setError] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<LeagueListItem[]>([]);

  // Create league form
  const [name, setName] = useState("OGBA");
  const [season, setSeason] = useState<number>(2025);
  const [draftMode, setDraftMode] = useState<"AUCTION" | "DRAFT">("AUCTION");
  const [isPublic, setIsPublic] = useState(false);
  const [copyFromId, setCopyFromId] = useState<number | null>(null);

  async function refresh() {
    setError(null);
    try {
      const resp = await getLeagues();
      setLeagues(resp.leagues ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load leagues.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    if (!Array.isArray(leagues)) return [];
    const xs = [...leagues];
    xs.sort((a, b) => {
      if (b.season !== a.season) return b.season - a.season;
      return String(a.name).localeCompare(String(b.name));
    });
    return xs;
  }, [leagues]);

  async function onCreateLeague(e: React.FormEvent) {
    e.preventDefault();
    try {
      setError(null);
      await adminCreateLeague({
        name: String(name || "").trim(),
        season: Number(season),
        draftMode,
        isPublic,
        copyFromLeagueId: copyFromId || undefined,
      });
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create league.");
    }
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-4 rounded-2xl bg-[var(--lg-error)]/10 border border-[var(--lg-error)]/20 text-[var(--lg-error)] text-xs font-bold uppercase tracking-wide">
          {error}
        </div>
      )}

      {/* Create League */}
      <div className="lg-card p-4 md:p-8 bg-[var(--lg-accent)]/5 border-[var(--lg-accent)]/20">
        <div className="mb-6 text-xl font-semibold uppercase tracking-tight text-[var(--lg-text-heading)]">New Season</div>

        <form onSubmit={onCreateLeague} className="grid gap-6 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">League Name</label>
            <input
              className="w-full rounded-2xl border border-[var(--lg-glass-border)] bg-[var(--lg-glass-bg)] px-4 py-3 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-all font-bold"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. OGBA 2025"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">Season</label>
            <input
              className="w-full rounded-2xl border border-[var(--lg-glass-border)] bg-[var(--lg-glass-bg)] px-4 py-3 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-all font-bold font-mono"
              value={season}
              type="number"
              onChange={(e) => setSeason(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">Draft Type</label>
            <select
              className="w-full rounded-2xl border border-[var(--lg-glass-border)] bg-[var(--lg-glass-bg)] px-4 py-3 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-all font-bold"
              value={draftMode}
              onChange={(e) => setDraftMode(e.target.value as "AUCTION" | "DRAFT")}
            >
              <option value="AUCTION">AUCTION</option>
              <option value="DRAFT">DRAFT</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">Copy From (Optional)</label>
            <select
              className="w-full rounded-2xl border border-[var(--lg-glass-border)] bg-[var(--lg-glass-bg)] px-4 py-3 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-all font-bold"
              onChange={(e) => {
                const id = Number(e.target.value) || null;
                setCopyFromId(id);
                if (id) {
                  const source = sorted.find(l => l.id === id);
                  if (source) {
                    setName(source.name);
                    setSeason(source.season + 1);
                  }
                }
              }}
            >
              <option value="">Start Fresh (Default)</option>
              {sorted.map(l => (
                <option key={l.id} value={l.id}>{l.name} {l.season}</option>
              ))}
            </select>
            {copyFromId && <div className="mt-2 text-xs text-sky-400 font-bold uppercase tracking-wider">Settings, Members, and Rules will be cloned.</div>}
          </div>

          <div className="md:col-span-2 flex items-center gap-3 pt-4">
            <input
              id="isPublic"
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="w-5 h-5 rounded-lg border-[var(--lg-glass-border)] bg-[var(--lg-glass-bg)] text-[var(--lg-accent)] focus:ring-0"
            />
            <label htmlFor="isPublic" className="text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)]">
              Public
            </label>
          </div>

          <div className="md:col-span-4 flex justify-end mt-4">
            <Button type="submit">
              Create Season
            </Button>
          </div>
        </form>
      </div>

      {/* Existing Leagues */}
      <div className="lg-card p-4 md:p-8">
        <div className="mb-6 text-xl font-semibold uppercase tracking-tight text-[var(--lg-text-heading)]">Seasons</div>
        <div className="space-y-2">
          {sorted.map(l => (
            <div key={l.id} className="flex items-center justify-between rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] px-4 py-3">
              <div>
                <span className="text-sm font-medium text-[var(--lg-text-primary)]">{l.name}</span>
                <span className="ml-2 text-xs text-[var(--lg-text-muted)]">{l.season}</span>
                <span className="ml-2 text-xs text-[var(--lg-text-muted)]">ID: {l.id}</span>
              </div>
              <button
                onClick={async () => {
                  if (!confirm(`Delete "${l.name} ${l.season}" season? This permanently removes all teams, rosters, and data. This cannot be undone.`)) return;
                  try {
                    setError(null);
                    await adminDeleteLeague(l.id);
                    await refresh();
                  } catch (err: unknown) {
                    setError(err instanceof Error ? err.message : "Failed to delete league.");
                  }
                }}
                className="text-xs font-semibold uppercase tracking-wide text-[var(--lg-error)] hover:text-[var(--lg-error)]/80 px-3 py-1.5 rounded-lg border border-[var(--lg-error)]/20 hover:bg-[var(--lg-error)]/10 transition-all"
              >
                Delete
              </button>
            </div>
          ))}
          {sorted.length === 0 && (
            <p className="text-sm text-[var(--lg-text-muted)]">No seasons found.</p>
          )}
        </div>
      </div>

      {/* CSV Import */}
      <div className="lg-card p-4 md:p-8">
        <div className="mb-6 text-xl font-semibold uppercase tracking-tight text-[var(--lg-text-heading)]">Import Data</div>
        <div className="text-xs text-[var(--lg-text-muted)] font-bold uppercase tracking-wide mb-8 leading-relaxed">
          Import a CSV file to populate league rosters and costs.
          <p className="mt-1 opacity-60">Required Headers: Player, MLB, Team, Cost, Keeper, Pos</p>
        </div>

        <CsvUploader leagues={sorted} onRefresh={refresh} />
      </div>
    </div>
  );
}

function CsvUploader({ leagues, onRefresh }: { leagues: LeagueListItem[]; onRefresh: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [leagueId, setLeagueId] = useState<number | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!leagueId || !file) return;

    setLoading(true);
    setStatus(null);
    setError(null);

    try {
      const text = await file.text();
      const result = await adminImportRosters(Number(leagueId), text);

      setStatus(`Import complete: ${result.count} players imported`);
      if (result.errors?.length) {
        setError(`Import warnings:\n${result.errors.join("\n")}`);
      }
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleUpload} className="space-y-6 max-w-xl">
      <div>
        <label className="block text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">Target Season</label>
        <select
          className="w-full rounded-2xl border border-[var(--lg-glass-border)] bg-[var(--lg-glass-bg)] px-4 py-3 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-all font-bold"
          value={leagueId}
          onChange={e => setLeagueId(Number(e.target.value) || "")}
          required
        >
          <option value="">Select season...</option>
          {leagues.map(l => (
            <option key={l.id} value={l.id}>{l.name} {l.season}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">CSV File</label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="block w-full text-xs text-[var(--lg-text-muted)] file:mr-6 file:py-3 file:px-6 file:rounded-2xl file:border-0 file:text-xs file:font-bold file:uppercase file:tracking-wide file:bg-[var(--lg-tint-hover)] file:text-white hover:file:bg-[var(--lg-tint-hover)] transition-all cursor-pointer"
          onChange={e => setFile(e.target.files?.[0] || null)}
          required
        />
      </div>

      <div className="pt-4">
        <Button
          type="submit"
          variant="emerald"
          disabled={loading || !leagueId || !file}
        >
          {loading ? "Uploading..." : "Upload CSV"}
        </Button>
      </div>

      {status && <div className="p-4 rounded-2xl bg-[var(--lg-success)]/10 border border-[var(--lg-success)]/20 text-[var(--lg-success)] text-xs font-bold uppercase tracking-wide">{status}</div>}
      {error && <div className="p-4 rounded-2xl bg-[var(--lg-error)]/10 border border-[var(--lg-error)]/20 text-[var(--lg-error)] text-xs font-bold uppercase tracking-wide whitespace-pre-wrap">{error}</div>}
    </form>
  );
}
