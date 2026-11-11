// Season and periods (Style Bible screen 22): list the season's periods, add the
// next one, edit or delete pending ones. Starting and closing stay on their own
// guided pages; there is no raw status control here.
import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../../api/base";
import { ConfirmSheet } from "../../../components/shared/ConfirmSheet";
import { useToast } from "../../../contexts/ToastContext";
import { CardError, LINK, PRIMARY, SECONDARY, Skeleton } from "../components/cardParts";
import { createSeasonPeriod, deleteSeasonPeriod, getCommissionerSeason, updateSeasonPeriod, type CurrentSeason, type SeasonPeriodRow } from "../api";
import { CommissionerOnly } from "../components/CommissionerOnly";
import "../commissioner.css";

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-06-14T12:00:00.000Z" -> "2026-06-14". Periods are stored at noon UTC, so the date part is the calendar day. */
const day = (iso: string) => iso.slice(0, 10);

/** Adds days to a YYYY-MM-DD string with UTC math (no local-timezone drift). */
function addDays(ymd: string, n: number): string {
  const [y, mo, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

function fmtDay(ymd: string): string {
  const [, mo, d] = ymd.split("-").map(Number);
  return `${MONTHS[mo - 1]} ${d}`;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Defaults for the add form: "Period N+1", the day after the latest end, 14 days long. */
export function nextPeriodDefaults(periods: SeasonPeriodRow[]): { name: string; start: string; end: string } {
  const numbers = periods.map((p) => /(\d+)/.exec(p.name)).filter((x): x is RegExpExecArray => !!x).map((x) => Number(x[1]));
  const n = numbers.length ? Math.max(...numbers) : periods.length;
  const lastEnd = periods.map((p) => day(p.endDate)).sort().pop();
  const start = lastEnd ? addDays(lastEnd, 1) : todayUtc();
  return { name: `Period ${n + 1}`, start, end: addDays(start, 13) };
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.serverMessage || err.detail || err.message;
  return err instanceof Error && err.message ? err.message : fallback;
}

const END_BEFORE_START = "End date must be after the start date.";

const FIELD: React.CSSProperties = {
  display: "block", width: "100%", boxSizing: "border-box", minHeight: 44, padding: "0 12px",
  fontSize: 17, fontFamily: "inherit", color: "var(--am-text)", background: "var(--am-field)",
  border: "1px solid var(--am-field-line)", borderRadius: 6,
};
const LABEL: React.CSSProperties = { display: "block", fontSize: 13, color: "var(--am-text-muted)", marginBottom: 4 };
const CARD: React.CSSProperties = { background: "var(--am-surface)", border: "1px solid var(--am-border)", borderRadius: 6, overflow: "hidden" };
const ACTION: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 44, padding: "0 12px",
  fontSize: 17, color: "var(--am-accent)", background: "transparent", border: 0, cursor: "pointer",
};

function Chip({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <span
      style={{
        flex: "none", fontSize: 13, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
        border: `1px solid ${accent ? "var(--am-accent)" : "var(--am-border-strong)"}`,
        background: accent ? "var(--am-accent)" : "transparent",
        color: accent ? "var(--am-on-accent)" : "var(--am-text-muted)",
      }}
    >
      {label}
    </span>
  );
}

function PeriodRow({
  period, chip, base, busy, onSaved, onDelete,
}: {
  period: SeasonPeriodRow;
  chip: "Closed" | "Now" | "Next" | "Upcoming";
  base: string;
  busy: boolean;
  onSaved: (p: SeasonPeriodRow) => void;
  onDelete: () => void;
}) {
  const pending = period.status === "pending";
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(period.name);
  const [start, setStart] = useState(day(period.startDate));
  const [end, setEnd] = useState(day(period.endDate));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  async function save() {
    if (inFlight.current) return;
    if (end <= start) { setError(END_BEFORE_START); return; }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateSeasonPeriod(period.id, { name: name.trim(), startDate: start, endDate: end });
      onSaved({ ...period, ...updated });
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err, "Couldn’t save the period."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <div data-testid="period-row" style={{ minHeight: 56, padding: "8px 16px", borderBottom: "1px solid var(--am-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minHeight: 44 }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 17, fontWeight: 600, color: "var(--am-text)" }}>{period.name}</span>
          <span style={{ display: "block", fontSize: 13, color: "var(--am-text-muted)" }}>
            {`${fmtDay(day(period.startDate))} – ${fmtDay(day(period.endDate))}`}
          </span>
        </span>
        <Chip label={chip} accent={chip === "Now"} />
        {chip === "Now" && <Link to={`${base}/close/${period.id}`} style={LINK}>Close ›</Link>}
        {chip === "Next" && <Link to={`${base}/start/${period.id}`} style={LINK}>Start ›</Link>}
        {pending && !editing && (
          <>
            <button type="button" style={ACTION} aria-label={`Edit ${period.name}`} disabled={busy} onClick={() => setEditing(true)}>Edit</button>
            <button type="button" style={{ ...ACTION, color: "var(--am-negative)" }} aria-label={`Delete ${period.name}`} disabled={busy} onClick={onDelete}>Delete</button>
          </>
        )}
      </div>
      {editing && (
        <form
          onSubmit={(e) => { e.preventDefault(); void save(); }}
          style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0 8px" }}
        >
          <label>
            <span style={LABEL}>Edit name</span>
            <input style={FIELD} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            <span style={LABEL}>Edit start</span>
            <input style={FIELD} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            <span style={LABEL}>Edit end</span>
            <input style={FIELD} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          {error && <div role="alert" style={{ fontSize: 13, color: "var(--am-negative)" }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={PRIMARY} disabled={saving || !name.trim()}>Save</button>
            <button
              type="button"
              style={SECONDARY}
              disabled={saving}
              onClick={() => { setEditing(false); setError(null); setName(period.name); setStart(day(period.startDate)); setEnd(day(period.endDate)); }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function AddPeriodForm({ season, onAdded }: { season: CurrentSeason; onAdded: (p: SeasonPeriodRow) => void }) {
  const initial = nextPeriodDefaults(season.periods);
  const [name, setName] = useState(initial.name);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    if (end <= start) { setError(END_BEFORE_START); return; }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const created = await createSeasonPeriod({ leagueId: season.leagueId, seasonId: season.id, name: name.trim(), startDate: start, endDate: end });
      onAdded(created);
      // Re-seed the form for the period after the one just added.
      const next = nextPeriodDefaults([...season.periods, created]);
      setName(next.name); setStart(next.start); setEnd(next.end);
    } catch (err) {
      setError(errorMessage(err, "Couldn’t add the period."));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--am-text)" }}>Add next period</h2>
      <label>
        <span style={LABEL}>Name</span>
        <input style={FIELD} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        <span style={LABEL}>Start</span>
        <input style={FIELD} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label>
        <span style={LABEL}>End</span>
        <input style={FIELD} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
      </label>
      {error && <div role="alert" style={{ fontSize: 13, color: "var(--am-negative)" }}>{error}</div>}
      <button type="submit" style={PRIMARY} disabled={busy || !name.trim() || !start || !end}>Add period</button>
    </form>
  );
}

function SeasonPageBody() {
  const leagueId = Number(useParams().leagueId);
  const base = `/commissioner/${leagueId}`;
  const { toast } = useToast();
  const [season, setSeason] = useState<CurrentSeason | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [toDelete, setToDelete] = useState<SeasonPeriodRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteInFlight = useRef(false);

  useEffect(() => {
    let live = true;
    setSeason(undefined);
    setFailed(false);
    getCommissionerSeason(leagueId).then(
      (s) => live && setSeason(s),
      () => live && setFailed(true),
    );
    return () => { live = false; };
  }, [leagueId]);

  async function confirmDelete() {
    if (deleteInFlight.current || !toDelete) return;
    deleteInFlight.current = true;
    setDeleting(true);
    const target = toDelete;
    try {
      await deleteSeasonPeriod(target.id);
      setSeason((s) => (s ? { ...s, periods: s.periods.filter((p) => p.id !== target.id) } : s));
      toast(`${target.name} deleted`, "success");
    } catch (err) {
      toast(errorMessage(err, "Couldn’t delete the period."), "error");
    } finally {
      deleteInFlight.current = false;
      setDeleting(false);
      setToDelete(null);
    }
  }

  const back = <Link to={base} style={LINK}>‹ Commissioner</Link>;
  const title = <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 700, color: "var(--am-text)" }}>Season and periods</h1>;
  const shell = (children: React.ReactNode) => (
    <div style={{ padding: "0 16px 32px", maxWidth: 1100, margin: "0 auto" }}>{back}{title}{children}</div>
  );

  if (failed) return shell(<CardError>Couldn’t load the season.</CardError>);
  if (season === undefined) return shell(<div style={CARD}><Skeleton /></div>);
  if (season === null) return shell(<p style={{ margin: 0, fontSize: 17, color: "var(--am-text-muted)" }}>No season is set up for this league yet.</p>);

  const sorted = [...season.periods].sort((a, b) => day(a.startDate).localeCompare(day(b.startDate)));
  const nextId = sorted.find((p) => p.status === "pending")?.id;
  const chipFor = (p: SeasonPeriodRow): "Closed" | "Now" | "Next" | "Upcoming" =>
    p.status === "completed" ? "Closed" : p.status === "active" ? "Now" : p.id === nextId ? "Next" : "Upcoming";

  return shell(
    <>
      <div className="season-cols">
        <div style={CARD}>
          {sorted.length === 0 ? (
            <p style={{ margin: 0, padding: 16, fontSize: 17, color: "var(--am-text-muted)" }}>No periods yet. Add the first one.</p>
          ) : (
            sorted.map((p) => (
              <PeriodRow
                key={p.id}
                period={p}
                chip={chipFor(p)}
                base={base}
                busy={deleting}
                onSaved={(u) => setSeason((s) => s && { ...s, periods: s.periods.map((x) => (x.id === u.id ? u : x)) })}
                onDelete={() => setToDelete(p)}
              />
            ))
          )}
        </div>
        <AddPeriodForm
          key={season.periods.length}
          season={season}
          onAdded={(p) => setSeason((s) => s && { ...s, periods: [...s.periods, p] })}
        />
      </div>
      <Link to={`${base}/archive`} style={{ ...LINK, marginTop: 8 }}>Season status ›</Link>
      <ConfirmSheet
        open={toDelete !== null}
        title={`Delete ${toDelete?.name ?? ""}?`}
        body="This can't be undone."
        confirmLabel="Delete period"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </>,
  );
}

export default function SeasonPage() {
  const leagueId = Number(useParams().leagueId);
  return <CommissionerOnly leagueId={leagueId}><SeasonPageBody /></CommissionerOnly>;
}
