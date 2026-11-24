// Archive player check (/archive/player-check): every name on every archived
// roster resolves to one MLB player. The matcher settles most of them; this
// page lists the rest for a person to decide. Open to site admins and to the
// owners a site admin lets in (/archive/player-check/access): the commissioner
// sees every name with final say; an owner, only his own franchise's names.
// Each decision carries the name of who made it.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { PlayerCheckDecisionBody, PlayerCheckItem, PlayerCheckResponse, PlayerCheckStatus } from "@shared/api/archivePlayerCheck";
import { ApiError } from "../../../api/base";
import { ArchiveTabs } from "../components/ArchiveTabs";
import { PlayerCheckCard } from "../components/PlayerCheckCard";
import { filterItems, filtersToParams, parseFilters, seasonRows, STATUS_LABEL, type CheckFilters } from "../lib/playerCheck";
import { decidePlayer, getPlayerCheck, undoPlayerDecision } from "../playerCheckApi";
import "../archive.css";
import "../playerCheck.css";

type Load =
  | { state: "loading" }
  | { state: "forbidden"; message: string }
  | { state: "error" }
  | { state: "ready"; data: PlayerCheckResponse };

const STATUSES: PlayerCheckStatus[] = ["FLAGGED", "OPEN", "SUGGESTED"];

function saveError(err: unknown): string {
  if (err instanceof ApiError && err.serverMessage) return err.serverMessage;
  return "That didn’t save. Check your connection and try again.";
}

const cell = (n: number, className = "") => <td className={`${className} ${n ? "" : "is-zero"}`.trim()}>{n.toLocaleString("en-US")}</td>;

export default function PlayerCheckPage() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set());
  const [errors, setErrors] = useState<Record<number, string>>({});
  // Names decided since the filters last changed stay on screen under "left to decide".
  const [decidedThisVisit, setDecidedThisVisit] = useState<ReadonlySet<number>>(new Set());
  const inFlight = useRef(new Set<number>());
  const listTop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    getPlayerCheck().then(
      (data) => live && setLoad({ state: "ready", data }),
      (err) => live && setLoad(
        err instanceof ApiError && err.status === 403
          ? { state: "forbidden", message: err.serverMessage || "The player check is open to owners the commissioner has let in." }
          : { state: "error" },
      ),
    );
    return () => { live = false; };
  }, []);

  const setFilters = useCallback((next: CheckFilters) => {
    setDecidedThisVisit(new Set());
    setParams(filtersToParams(next), { replace: true });
  }, [setParams]);

  const save = useCallback(async (item: PlayerCheckItem, run: () => Promise<PlayerCheckItem>) => {
    if (inFlight.current.has(item.id)) return;
    inFlight.current.add(item.id);
    setBusy(new Set(inFlight.current));
    setErrors((e) => { const rest = { ...e }; delete rest[item.id]; return rest; });
    try {
      const updated = await run();
      setLoad((l) => (l.state === "ready" ? { state: "ready", data: { ...l.data, items: l.data.items.map((i) => (i.id === updated.id ? updated : i)) } } : l));
      setDecidedThisVisit((s) => new Set(s).add(updated.id));
    } catch (err) {
      setErrors((e) => ({ ...e, [item.id]: saveError(err) }));
    } finally {
      inFlight.current.delete(item.id);
      setBusy(new Set(inFlight.current));
    }
  }, []);

  const onDecide = useCallback((item: PlayerCheckItem, body: PlayerCheckDecisionBody) => save(item, () => decidePlayer(item.id, body)), [save]);
  const onUndo = useCallback((item: PlayerCheckItem) => save(item, () => undoPlayerDecision(item.id)), [save]);

  // The Archive section's tab strip, with Player check selected (no tab for someone turned away).
  const tabStrip = <ArchiveTabs active="check" showCheck={load.state !== "forbidden"} />;

  if (load.state === "loading") {
    return <div className="apc-page">{tabStrip}<h1 className="apc-title">Archive player check</h1><div className="apc-card apc-skeleton" aria-busy="true"><div /><div /><div /></div></div>;
  }
  if (load.state === "forbidden") {
    return <div className="apc-page">{tabStrip}<h1 className="apc-title">Archive player check</h1><p className="apc-lede">{load.message}</p></div>;
  }
  if (load.state === "error") {
    return <div className="apc-page">{tabStrip}<h1 className="apc-title">Archive player check</h1><p role="alert" className="apc-error">Couldn’t load the player check. Reload the page to try again.</p></div>;
  }

  const { items, seasons, teams, viewer } = load.data;
  const rows = seasonRows(seasons, items);
  const verified = seasons.reduce((sum, s) => sum + s.verified, 0);
  const done = items.filter((i) => i.decision).length;
  const visible = filterItems(items, filters, decidedThisVisit);
  // Counts on the status buttons follow the season and team filters, not the status one.
  const inScope = filterItems(items, { ...filters, status: "" }, decidedThisVisit);
  const total = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((sum, r) => sum + pick(r), 0);

  if (seasons.length === 0) {
    return (
      <div className="apc-page">{tabStrip}
        <h1 className="apc-title">Archive player check</h1>
        <p className="apc-lede">Nothing to check yet. The archive’s player list hasn’t been loaded.</p>
      </div>
    );
  }

  return (
    <div className="apc-page">{tabStrip}
      <header>
        <h1 className="apc-title">Archive player check</h1>
        <p className="apc-lede">
          Every name on every archived roster, matched to an MLB player. {verified.toLocaleString("en-US")} are settled.
          {" "}{items.length === 0 ? "None need a decision." : `${items.length} need a decision: confirm the suggested player, pick another, or search for someone else.`}
        </p>
        <p className="apc-note" style={{ marginTop: 8 }}>
          {viewer.level === "OWN_TEAM"
            ? `You’re checking the names on ${teams.map((t) => t.name).join(" and ") || "your team"}. Your decisions are saved under your name; the commissioner’s are final.`
            : viewer.isAdmin
              ? "Each decision shows who made it. Yours and the commissioner’s are final: nobody else can change them."
              : "You have the commissioner’s final say: your decisions lock, and you can change anyone’s."}
          {viewer.isAdmin && <>{" "}<Link to="/archive/player-check/access" className="apc-link">Choose who can help</Link></>}
        </p>
      </header>

      <div className="apc-progress" aria-live="polite">
        <span><strong>{done}</strong> of {items.length} decided</span>
        <span className="apc-bar" aria-hidden="true"><span style={{ width: `${items.length ? Math.round((done / items.length) * 100) : 100}%` }} /></span>
      </div>

      <div className="apc-card" style={{ overflowX: "auto" }}>
        <table className="apc-seasons">
          <thead>
            <tr>
              <th scope="col">Season</th>
              <th scope="col" className="apc-col-verified">Settled</th>
              <th scope="col">Suggested</th>
              <th scope="col">Flagged</th>
              <th scope="col">Open</th>
              <th scope="col">Left to decide</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const selected = filters.year === r.year;
              const choose = () => {
                setFilters({ ...filters, year: selected ? null : r.year });
                // The table is a screen tall: bring the season's names into view.
                if (!selected) listTop.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
              };
              return (
                <tr key={r.year} className={selected ? "is-selected" : ""} onClick={choose}>
                  <td>
                    <button type="button" className="apc-year" aria-pressed={selected} onClick={(e) => { e.stopPropagation(); choose(); }}>{r.year}</button>
                  </td>
                  {cell(r.verified, "apc-col-verified")}
                  {cell(r.suggested)}
                  {cell(r.flagged)}
                  {cell(r.open)}
                  <td className={r.todo ? "is-todo" : "is-zero"}>{r.todo}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>All seasons</td>
              {cell(verified, "apc-col-verified")}
              {cell(total((r) => r.suggested))}
              {cell(total((r) => r.flagged))}
              {cell(total((r) => r.open))}
              <td className={items.length - done ? "is-todo" : "is-zero"}>{items.length - done}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="apc-filters" ref={listTop}>
        {filters.year !== null && (
          <button type="button" className="apc-btn" onClick={() => setFilters({ ...filters, year: null })}>{filters.year} only · show all seasons</button>
        )}
        <select className="apc-field" aria-label="Team" value={filters.team} onChange={(e) => setFilters({ ...filters, team: e.target.value })}>
          <option value="">All teams</option>
          {teams.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
        </select>
        <div className="apc-seg" role="group" aria-label="Status">
          <button type="button" aria-pressed={filters.status === ""} onClick={() => setFilters({ ...filters, status: "" })}>All {inScope.length}</button>
          {STATUSES.map((s) => (
            <button key={s} type="button" aria-pressed={filters.status === s} onClick={() => setFilters({ ...filters, status: s })}>
              {STATUS_LABEL[s]} {inScope.filter((i) => i.status === s).length}
            </button>
          ))}
        </div>
        <label className="apc-toggle">
          <input type="checkbox" checked={filters.todoOnly} onChange={(e) => setFilters({ ...filters, todoOnly: e.target.checked })} />
          Left to decide only
        </label>
        <span className="apc-count" aria-live="polite">{visible.length} shown</span>
      </div>

      <div className="apc-list">
        {visible.length === 0 && (
          <p className="apc-note">{items.length > 0 && done === items.length ? "Every name is decided." : "Nothing to check for this filter."}</p>
        )}
        {visible.map((item) => (
          <PlayerCheckCard key={item.id} item={item} busy={busy.has(item.id)} error={errors[item.id] ?? null} onDecide={onDecide} onUndo={onUndo} />
        ))}
      </div>

      <footer className="apc-note">
        <p style={{ margin: "0 0 8px" }}>
          <strong>Suggested player.</strong> Among the candidates who qualify for the most slots, the one with the most plate
          appearances (hitter slots) or innings (pitcher slots) that season. “Close call” means the runner-up played at least 85% as much.
        </p>
        <p style={{ margin: "0 0 8px" }}>
          <strong>Flagged</strong>: the name fits one MLB player, but he didn’t qualify for a slot he held.{" "}
          <strong>Suggested</strong>: several players fit, and exactly one qualifies for every slot.{" "}
          <strong>Open</strong>: more than one player fits, or none does.
        </p>
        <p style={{ margin: 0 }}>
          <strong>Qualifying for a slot.</strong> 3 games at the position that season, or 20 the season before. DH needs 10 games at DH.
          The pre-2022 R slot is the rookie spot. An injured-list slot takes anyone, and a kept player keeps last season’s slot.
          Games are full-season totals.
        </p>
      </footer>
    </div>
  );
}
