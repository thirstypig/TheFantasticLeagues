// Who can help on the archive player check (/archive/player-check/access).
// Site admins only. One row per franchise member with three choices:
//   Off        no player check (the default)
//   Own team   his own franchise's names, every year (by the team he owns now)
//   All teams  every name, and his decisions are final (the commissioner)
// A choice saves as soon as it's tapped; there's no form to submit.
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ArchiveAuditAccess, AuditAccessMember } from "@shared/api/archivePlayerCheck";
import { ApiError } from "../../../api/base";
import { listAuditAccess, setAuditAccess } from "../playerCheckApi";
import "../playerCheck.css";

type Load =
  | { state: "loading" }
  | { state: "forbidden" }
  | { state: "error" }
  | { state: "ready"; members: AuditAccessMember[] };

const CHOICES: { value: ArchiveAuditAccess; label: string }[] = [
  { value: "NONE", label: "Off" },
  { value: "OWN_TEAM", label: "Own team" },
  { value: "ALL", label: "All teams" },
];

/** What the member can do with his current access, in a few words. */
function describe(m: AuditAccessMember): string {
  const teams = m.teamNames.join(" and ");
  if (m.access === "ALL") return `Every team's names, final say${teams ? ` · owns ${teams}` : ""}`;
  if (m.access === "OWN_TEAM") return teams ? `Team: ${teams}` : "Owns no team, so sees nothing";
  return teams ? `Owns ${teams}` : "Owns no team";
}

/** What just changed, said once after a save. */
function savedNote(m: AuditAccessMember, access: ArchiveAuditAccess): string {
  const first = m.name.split(" ")[0] || m.name;
  if (access === "ALL") return `Saved ✓ ${first}'s decisions are now final and can replace owners'.`;
  if (access === "OWN_TEAM") return `Saved ✓ ${first} can decide ${m.teamNames.join(" and ") || "their own team"}'s names.`;
  return `Saved ✓ ${first} can no longer decide names.`;
}

export default function PlayerCheckAccessPage() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [saving, setSaving] = useState<ReadonlySet<number>>(new Set());
  const [notes, setNotes] = useState<Record<number, { text: string; error?: boolean; saved?: boolean }>>({});
  const inFlight = useRef(new Set<number>());

  useEffect(() => {
    let live = true;
    listAuditAccess().then(
      (members) => live && setLoad({ state: "ready", members }),
      (err) => live && setLoad({ state: err instanceof ApiError && err.status === 403 ? "forbidden" : "error" }),
    );
    return () => { live = false; };
  }, []);

  const choose = async (m: AuditAccessMember, access: ArchiveAuditAccess) => {
    if (access === m.access || inFlight.current.has(m.membershipId)) return;
    inFlight.current.add(m.membershipId);
    setSaving(new Set(inFlight.current));
    setNotes((n) => ({ ...n, [m.membershipId]: { text: "Saving…" } }));
    try {
      await setAuditAccess(m.membershipId, access);
      setLoad((l) => (l.state === "ready"
        ? { state: "ready", members: l.members.map((x) => (x.membershipId === m.membershipId ? { ...x, access } : x)) }
        : l));
      setNotes((n) => ({ ...n, [m.membershipId]: { text: savedNote(m, access), saved: true } }));
    } catch (err) {
      const text = err instanceof ApiError && err.serverMessage ? err.serverMessage : "That didn’t save. Try again.";
      setNotes((n) => ({ ...n, [m.membershipId]: { text, error: true } }));
    } finally {
      inFlight.current.delete(m.membershipId);
      setSaving(new Set(inFlight.current));
    }
  };

  const header = (
    <header>
      <Link to="/archive/player-check" className="apc-link apc-back">← Player check</Link>
      <h1 className="apc-title" style={{ marginTop: 8 }}>Who can help</h1>
      <p className="apc-lede">
        Choose which owners can help decide archive names. <strong>Own team</strong>: the names on their own franchise’s
        rosters, every year. <strong>All teams</strong>: every name, and their decisions are final, like yours. Give that to the commissioner.
      </p>
    </header>
  );

  if (load.state === "loading") {
    return <div className="apc-page">{header}<div className="apc-card apc-skeleton" aria-busy="true"><div /><div /><div /></div></div>;
  }
  if (load.state === "forbidden") {
    return <div className="apc-page">{header}<p className="apc-error">Only a site admin can choose who helps.</p></div>;
  }
  if (load.state === "error") {
    return <div className="apc-page">{header}<p role="alert" className="apc-error">Couldn’t load the members. Reload the page to try again.</p></div>;
  }

  return (
    <div className="apc-page">
      {header}
      {load.members.length === 0 ? (
        <p className="apc-note">No league members to give access to yet.</p>
      ) : (
        <ul className="apc-access apc-card">
          {load.members.map((m) => {
            const note = notes[m.membershipId];
            const busy = saving.has(m.membershipId);
            return (
              <li key={m.membershipId}>
                <div className="apc-access-who">
                  <span className="apc-access-name">{m.name}{m.role === "COMMISSIONER" ? " · commissioner" : ""}</span>
                  <span className={`apc-access-status ${note?.error ? "is-error" : note?.saved ? "is-saved" : ""}`.trim()} aria-live="polite">
                    {note?.text ?? describe(m)}
                  </span>
                </div>
                <div className="apc-seg" role="radiogroup" aria-label={`Player check access for ${m.name}`}>
                  {CHOICES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      role="radio"
                      aria-checked={m.access === c.value}
                      disabled={busy}
                      onClick={() => choose(m, c.value)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="apc-note">Site admins always have full access and aren’t listed.</p>
    </div>
  );
}
