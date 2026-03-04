// client/src/pages/Leagues.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { adminCreateLeague, getLeagues, getMe, type LeagueListItem } from "../../../api";

import PageHeader from "../../../components/ui/PageHeader";
import { Button } from "../../../components/ui/button";



export default function Leagues() {
  const [meLoading, setMeLoading] = useState(true);
  const [me, setMe] = useState<{ email: string; isAdmin: boolean } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<LeagueListItem[]>([]);

  // Admin create form (simple)
  const [name, setName] = useState("OGBA");
  const [season, setSeason] = useState<number>(2025);
  const [draftMode, setDraftMode] = useState<"AUCTION" | "DRAFT">("AUCTION");
  const [isPublic, setIsPublic] = useState(false);
  const [copyFromId, setCopyFromId] = useState<number | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);

    try {
      // If not logged in, show a clean state (do not treat as an error).
      const meResp = await getMe().catch(() => ({ user: null }));
      setMe(meResp.user ?? null);

      if (!meResp.user) {
        setLeagues([]);
        return;
      }

      const leaguesResp = await getLeagues();
      setLeagues(leaguesResp.leagues ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load leagues.");
    } finally {
      setLoading(false);
      setMeLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAdminUser = Boolean(me?.isAdmin);

  const sorted = useMemo(() => {
    if (!Array.isArray(leagues)) {
      console.warn("Leagues is not an array:", leagues);
      return [];
    }
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
    <div className="flex flex-col h-full bg-[var(--lg-glass-bg)]">
      <PageHeader 
        title="Leagues Hub" 
        subtitle="Select a league to manage or access commissioner tools."
        rightElement={
             <Button
              variant="outline"
              size="sm"
              onClick={refresh}
            >
              Sync Data
            </Button>
        }
      />

      <div className="px-10 py-8 mx-auto max-w-5xl w-full">
        <div className="lg-card p-6">
          {meLoading ? (
            <div className="text-sm text-[var(--lg-text-muted)] font-bold uppercase tracking-wide animate-pulse">Loading…</div>
          ) : !me ? (
            <div className="text-sm text-[var(--lg-text-muted)] font-bold uppercase tracking-wide leading-relaxed">
              Not signed in
              <p className="mt-1 text-xs opacity-60">Sign in to access your leagues.</p>
            </div>
          ) : (
            <div className="text-sm text-[var(--lg-text-muted)] font-bold uppercase tracking-wide flex items-center justify-between">
              <div>
                Signed in as: <span className="text-[var(--lg-text-primary)]">{me.email}</span>
              </div>
              {me.isAdmin ? <span className="rounded-full bg-[var(--lg-accent)]/20 border border-[var(--lg-accent)]/30 px-3 py-1 text-xs text-[var(--lg-accent)]">ADMINISTRATOR</span> : null}
            </div>
          )}
        </div>

        <div className="mt-8 space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--lg-text-heading)]">Your Leagues</h2>
          </div>

          {!me ? (
            <div className="lg-card py-10 text-center text-sm text-[var(--lg-text-muted)]">Sign in to see your leagues.</div>
          ) : loading ? (
            <div className="lg-card py-10 text-center text-sm text-[var(--lg-text-muted)] animate-pulse">Loading leagues…</div>
          ) : error ? (
            <div className="lg-card py-10 text-center text-sm text-[var(--lg-error)] bg-[var(--lg-error)]/5 border-[var(--lg-error)]/20">{error}</div>
          ) : sorted.length === 0 ? (
            <div className="lg-card py-10 text-center text-sm text-[var(--lg-text-muted)]">No leagues found.</div>
          ) : (
            <div className="space-y-3">
              {sorted.map((l) => {
                const access = l.access;
                const role = access?.type === "MEMBER" ? access.role : null;
                const isPublicViewer = access?.type === "PUBLIC_VIEWER";
                const canCommissioner = role === "COMMISSIONER" || Boolean(me?.isAdmin);

                return (
                  <div
                    key={l.id}
                    className="flex items-center justify-between lg-card px-6 py-5 group"
                  >
                    <div className="min-w-0">
                      <div className="text-lg font-bold text-[var(--lg-text-primary)] tracking-tight">
                        {l.name} <span className="text-[var(--lg-text-muted)] opacity-50 ml-2 font-bold font-mono">({l.season})</span>
                      </div>

                      <div className="mt-1 text-xs uppercase font-bold tracking-wide text-[var(--lg-text-muted)] flex items-center gap-3">
                        <span className="bg-[var(--lg-tint)] px-2 py-0.5 rounded-md">{l.draftMode}</span>
                        {role ? (
                          <span className="text-[var(--lg-accent)]">ROLE: {role}</span>
                        ) : isPublicViewer ? (
                          <span className="text-sky-400">PUBLIC ACCESS</span>
                        ) : (
                          <span className="text-[var(--lg-error)]">NO ACCESS</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {role && (
                           <Link to={`/leagues/${l.id}/keepers`}>
                            <Button variant="emerald" size="sm">
                              Keepers
                            </Button>
                          </Link>
                      )}
                      {canCommissioner ? (
                        <Link to={`/commissioner/${l.id}`}>
                          <Button variant="default" size="sm">
                            Commissioner
                          </Button>
                        </Link>
                      ) : (
                        <Button variant="secondary" size="sm" disabled title="You are not a commissioner for this league.">
                          Commissioner
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {isAdminUser ? (
          <div className="mt-10 lg-card p-8 bg-[var(--lg-accent)]/5 border-[var(--lg-accent)]/20">
            <div className="mb-6 text-xl font-bold uppercase tracking-tight text-[var(--lg-text-heading)]">Create League</div>

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
                    onChange={(e) => setCopyFromId(Number(e.target.value) || null)}
                 >
                    <option value="">Start Fresh (Default)</option>
                    {Array.isArray(leagues) && leagues.map(l => (
                        <option key={l.id} value={l.id}>{l.name} ({l.season})</option>
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
                  Create League
                </Button>
              </div>
            </form>
          </div>
        ) : null}

        <div className="mt-12 text-center text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)] opacity-30">
          Go to Commissioner Tools to manage league settings
        </div>
      <div className="mt-10 lg-card p-8">
          <div className="mb-6 text-xl font-bold uppercase tracking-tight text-[var(--lg-text-heading)]">Import Data</div>
          <div className="text-xs text-[var(--lg-text-muted)] font-bold uppercase tracking-wide mb-8 leading-relaxed">
             Import a CSV file to populate league rosters and costs.
             <p className="mt-1 opacity-60">Required Headers: Player, MLB, Team, Cost, Keeper, Pos</p>
          </div>
          
          <CsvUploader leagues={sorted} onRefresh={refresh} />
      </div>
      </div>
    </div>
  );
}

// Subcomponent for CSV Upload
function CsvUploader({ leagues, onRefresh }: { leagues: LeagueListItem[]; onRefresh: () => void }) {
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
        // Dynamic import to avoid circular dependencies if any? No, import from api directly.
        const { adminImportRosters } = await import("../../../api");
        
        const result = await adminImportRosters(Number(leagueId), text);
        
        setStatus(`Import complete: ${result.count} players imported`);
        if (result.errors?.length) {
            setError(`Import warnings:\n${result.errors.join("\n")}`);
        }
        setFile(null);
        // Clear file input visually? Harder with react state but ok.
        (document.getElementById("csvInput") as HTMLInputElement).value = "";
        
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
            <label className="block text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">Target League</label>
            <select 
                className="w-full rounded-2xl border border-[var(--lg-glass-border)] bg-[var(--lg-glass-bg)] px-4 py-3 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-all font-bold"
                value={leagueId}
                onChange={e => setLeagueId(Number(e.target.value) || "")}
                required
            >
                <option value="">Select league...</option>
                {leagues.map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.season})</option>
                ))}
            </select>
        </div>

        <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">CSV File</label>
            <input 
                id="csvInput"
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
