// One name on the archive player check: who it might be, why it's in doubt,
// and the buttons that settle it. Everything stays on the card — a search for
// someone who isn't listed opens inline, never in a modal.
import React, { useState } from "react";
import type {
  PlayerCheckCandidate, PlayerCheckDecisionBody, PlayerCheckItem, SlotCheck,
} from "@shared/api/archivePlayerCheck";
import { ApiError } from "../../../api/base";
import { explain, formatDecidedAt, formatLine, formatSeenIn, searchSeed, STATUS_LABEL } from "../lib/playerCheck";
import { searchPlayers } from "../playerCheckApi";

const STATUS_TONE = { FLAGGED: "is-alert", OPEN: "is-plain", SUGGESTED: "is-good" } as const;

const mlbUrl = (mlbId: number) => `https://www.mlb.com/player/${mlbId}`;

function PlayerName({ mlbId, name }: { mlbId: number; name: string }) {
  return <a href={mlbUrl(mlbId)} target="_blank" rel="noopener noreferrer">{name}</a>;
}

function Checks({ checks }: { checks: SlotCheck[] }) {
  return (
    <>
      {checks.map((c) => (
        <div key={c.slot} className="apc-check">
          <span className={`apc-mark ${c.eligible ? "is-yes" : "is-no"}`} aria-label={c.eligible ? "Eligible" : "Not eligible"}>{c.eligible ? "✓" : "✗"}</span>
          <span><span className="apc-slot">{c.slot}</span> {c.reason}</span>
        </div>
      ))}
    </>
  );
}

function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.serverMessage || err.detail || fallback;
  return fallback;
}

type SearchState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "done"; query: string; candidates: PlayerCheckCandidate[]; more: boolean };

interface Props {
  item: PlayerCheckItem;
  /** A save for this name is in flight. */
  busy: boolean;
  /** Why the last save failed, if it did. */
  error: string | null;
  onDecide: (item: PlayerCheckItem, body: PlayerCheckDecisionBody) => void;
  onUndo: (item: PlayerCheckItem) => void;
}

export function PlayerCheckCard({ item, busy, error, onDecide, onUndo }: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState(() => searchSeed(item.names[0] ?? ""));
  const [search, setSearch] = useState<SearchState>({ state: "idle" });

  const decided = item.decision;
  const unknown = decided?.decision === "NONE" || decided?.decision === "WRONG";
  const canChange = !decided || !decided.locked;
  const nobodyListed = !item.match && item.candidates.length === 0;
  // The search is the only way forward when nobody is listed or the listed ones were rejected.
  const showSearch = canChange && (decided ? unknown : searchOpen || nobodyListed);
  const pickedOutsideList = decided?.decision === "PICK" && decided.mlbId != null
    && !item.candidates.some((c) => c.mlbId === decided.mlbId);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearch({ state: "loading" });
    try {
      const res = await searchPlayers(item.id, q);
      setSearch({ state: "done", query: q, candidates: res.candidates, more: res.more });
    } catch (err) {
      setSearch({ state: "error", message: errorText(err, "The search didn’t work. Try again.") });
    }
  }

  const candidateBox = (c: PlayerCheckCandidate, opts: { fromSearch?: boolean } = {}) => {
    const suggested = !opts.fromSearch && item.suggestion?.mlbId === c.mlbId;
    const chosen = decided?.decision === "PICK" && decided.mlbId === c.mlbId;
    const canPick = !decided || (opts.fromSearch && unknown && canChange);
    return (
      <div key={c.mlbId} className={`apc-cand ${suggested && !decided ? "is-suggested" : ""} ${chosen ? "is-chosen" : ""}`}>
        {suggested && (
          <div className="apc-tags">
            <span className="apc-tag-good">Suggested</span>
            {item.suggestion?.closeCall && <span className="apc-tag-alert">Close call</span>}
          </div>
        )}
        <div className="apc-cand-name"><PlayerName mlbId={c.mlbId} name={c.name} /></div>
        <div className="apc-line">{formatLine(c.line, item.role)}</div>
        <Checks checks={c.checks} />
        {c.note && <div className="apc-line">Offered because: {c.note}</div>}
        {canPick && (
          <button
            type="button" className={`apc-btn ${suggested ? "is-primary" : ""}`} disabled={busy}
            onClick={() => onDecide(item, { decision: "PICK", mlbId: c.mlbId })}
          >
            {suggested ? "Confirm" : "Pick"} {c.name}
          </button>
        )}
      </div>
    );
  };

  return (
    <article className="apc-card apc-item" aria-label={`${item.names.join(" / ")}, ${item.year} ${item.teamName}`}>
      <div className="apc-head">
        <span className={`apc-chip ${STATUS_TONE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
        <h2 className="apc-name">{item.names.join(" / ")}</h2>
        <span className="apc-meta">
          {item.year} · {item.teamName} · {item.slots.map((s) => <React.Fragment key={s}><span className="apc-slot">{s}</span>{" "}</React.Fragment>)}
          · on {formatSeenIn(item.seenIn)}
        </span>
      </div>
      <p className="apc-note">{explain(item)}</p>

      {item.match && (
        <div className="apc-cands">
          <div className={`apc-cand ${decided?.decision === "EXCEPTION" ? "is-chosen" : ""}`}>
            <div className="apc-cand-name"><PlayerName mlbId={item.match.mlbId} name={item.match.name} /></div>
            <div className="apc-line">{formatLine(item.match.line, item.role)}</div>
            <Checks checks={item.match.checks} />
          </div>
        </div>
      )}
      {item.candidates.length > 0 && <div className="apc-cands">{item.candidates.map((c) => candidateBox(c))}</div>}
      {!decided && item.suggestion && item.candidates.length > 1 && (
        <p className="apc-note">Why suggested: {item.suggestion.why}.</p>
      )}

      {decided && (
        <div className={`apc-decided ${unknown ? "is-unknown" : ""}`}>
          <span>
            {decided.decision === "PICK" && <>Picked <strong>{pickedOutsideList && decided.mlbId != null ? <PlayerName mlbId={decided.mlbId} name={decided.name ?? ""} /> : decided.name}</strong></>}
            {decided.decision === "EXCEPTION" && <>Kept <strong>{decided.name}</strong>: the league allowed it</>}
            {decided.decision === "WRONG" && <>Marked as the wrong player. Search for the right one.</>}
            {decided.decision === "NONE" && <>{nobodyListed ? "Not found yet." : "None of these."} Search for the right one.</>}
            <span className="apc-meta">{" "}· {[decided.byName, formatDecidedAt(decided.at)].filter(Boolean).join(", ")}</span>
          </span>
          {decided.locked
            ? <span className="apc-meta">The commissioner decided this one.</span>
            : <button type="button" className="apc-btn" disabled={busy} onClick={() => onUndo(item)}>Undo</button>}
        </div>
      )}

      {!decided && (
        <div className="apc-actions">
          {item.match && (
            <>
              <button type="button" className="apc-btn is-primary" disabled={busy} onClick={() => onDecide(item, { decision: "EXCEPTION" })}>
                Keep {item.match.name}: the league allowed it
              </button>
              <button type="button" className="apc-btn" disabled={busy} onClick={() => onDecide(item, { decision: "WRONG" })}>Wrong player</button>
            </>
          )}
          {!item.match && item.candidates.length > 0 && (
            <>
              <button type="button" className="apc-btn" disabled={busy} onClick={() => onDecide(item, { decision: "NONE" })}>None of these</button>
              <button type="button" className="apc-btn" aria-expanded={searchOpen} onClick={() => setSearchOpen((v) => !v)}>
                {searchOpen ? "Hide search" : "Search for someone else"}
              </button>
            </>
          )}
          {nobodyListed && (
            <button type="button" className="apc-btn" disabled={busy} onClick={() => onDecide(item, { decision: "NONE" })}>Can’t find him</button>
          )}
        </div>
      )}
      {error && <p role="alert" className="apc-error">{error}</p>}

      {showSearch && (
        <div className="apc-search">
          <form onSubmit={runSearch}>
            <label>
              Find the player by name
              <input className="apc-field" type="search" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={60} />
            </label>
            <button type="submit" className="apc-btn" disabled={search.state === "loading" || query.trim().length < 3}>
              {search.state === "loading" ? "Searching…" : "Search"}
            </button>
          </form>
          {search.state === "error" && <p role="alert" className="apc-error">{search.message}</p>}
          {search.state === "done" && search.candidates.length === 0 && (
            <p className="apc-note">No MLB player found for “{search.query}”. Try the surname alone, or a different spelling.</p>
          )}
          {search.state === "done" && search.candidates.length > 0 && (
            <>
              <div className="apc-cands">{search.candidates.map((c) => candidateBox(c, { fromSearch: true }))}</div>
              {search.more && <p className="apc-note">More players match. Add a first name to narrow it down.</p>}
            </>
          )}
        </div>
      )}
    </article>
  );
}
