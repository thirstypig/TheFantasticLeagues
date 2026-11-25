// The explainer at the top of the player check: why it exists, what a person
// decides, how to decide each kind of name, who has the final say, and what
// the decisions feed next. Open until the reader folds it; that choice is
// remembered on this device only (a convenience, so storage may fail).
import React, { useRef, useState } from "react";

const KEY = "apc-guide-folded";

function readFolded(): boolean {
  try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; }
}
function writeFolded(folded: boolean) {
  try { window.localStorage.setItem(KEY, folded ? "1" : "0"); } catch { /* private window: just don't remember */ }
}

export function PlayerCheckGuide({ settled, ownTeam }: { settled: number; ownTeam: string | null }) {
  const [open, setOpen] = useState(() => !readFolded());
  const ref = useRef<HTMLDetailsElement>(null);
  /** "Got it": fold the guide and bring the work into view. */
  const done = () => {
    setOpen(false);
    writeFolded(true);
    ref.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  const onToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    const next = e.currentTarget.open;
    setOpen(next);
    writeFolded(!next);
  };

  return (
    <details ref={ref} className="apc-card apc-guide" open={open} onToggle={onToggle}>
      <summary>{open ? "How the player check works" : "How the player check works (read this first)"}</summary>

      <section aria-label="Why">
        <h2>Why we’re doing this</h2>
        <p>
          Every past season in the archive was rebuilt from the commissioner’s workbooks. The workbooks write players
          the way we always have, as a first initial and a last name (“J. Wright”), and never say which real player
          that was. The next step is to pull each player’s actual stats for the periods he was on a team and
          re-score every old season against the points in the workbook. That only works if every name points to
          exactly one MLB player.
        </p>
        <p>
          The computer matched {settled.toLocaleString("en-US")} names on its own by checking who played that season
          and at the positions the team used him. The names below are the ones it couldn’t settle. You knew these
          rosters, so you can.
        </p>
      </section>

      <section aria-label="What you decide">
        <h2>What you decide</h2>
        <p>
          For each name: <strong>which real player was on this team that season.</strong> Each card shows the
          spelling from the workbook, the season and team, the roster slots he held (3B, OF, P…), where the name
          appears (the draft, each period’s roster P1–P6, the final roster) and the candidates with their stats
          for that season.
        </p>
      </section>

      <section aria-label="How to decide">
        <h2>How to decide each kind of name</h2>
        <dl>
          <dt>Suggested</dt>
          <dd>
            Several players fit the name and exactly one qualified for every slot he held. That one is marked
            Suggested. If he’s right, tap <strong>Confirm</strong>. If it was someone else on the list, tap
            <strong> Pick</strong> on that player. “Close call” means the runner-up played almost as much, so look twice.
          </dd>
          <dt>Flagged</dt>
          <dd>
            The name fits one player, but he didn’t qualify for a slot he held (for example, a first baseman
            listed at 3B). If that really was him and the league allowed it, tap <strong>Keep … the league allowed
            it</strong>. If it’s the wrong person, tap <strong>Wrong player</strong> and search for the right one.
          </dd>
          <dt>Open</dt>
          <dd>
            More than one player fits and nothing separates them, or nobody fits the spelling. Pick the right one,
            or tap <strong>Search for someone else</strong> and type at least three letters of the name. If you
            can’t find him, tap <strong>Can’t find him</strong> or <strong>None of these</strong> so we know it
            still needs work.
          </dd>
        </dl>
        <p>
          Qualifying for a slot means 3 games at that position that season, or 20 the season before. DH needs 10
          games at DH. Before 2022 the R slot was the rookie spot. An injured-list slot takes anyone, and a kept
          player keeps last season’s slot.
        </p>
      </section>

      <section aria-label="Tips">
        <h2>Tips</h2>
        <ul>
          <li><strong>When unsure, leave it.</strong> A wrong pick puts the wrong stats on a team. An undecided name just waits.</li>
          <li>Tap a candidate’s name to open his MLB.com page (with his teams and positions) in a new tab.</li>
          <li>The original workbook for any season is on that season’s Archive page, under Download workbook.</li>
          <li>Use <strong>Decide the next name</strong> to go straight to the next one. You can take back your own decision with <strong>Undo</strong>.</li>
        </ul>
      </section>

      <section aria-label="Who decides">
        <h2>Who has the final say</h2>
        <p>
          {ownTeam
            ? `You see only the names on ${ownTeam}. `
            : "Owners who help see only their own team’s names. "}
          Every decision is saved with the name of the person who made it. The commissioner’s decisions are
          final, like the site admin’s: nobody else can change them, and he can change anyone’s.
        </p>
      </section>

      <section aria-label="What happens next">
        <h2>What happens next</h2>
        <p>
          Once the names are decided, we pull every player’s stats for the periods he was on each team and
          re-score each season. Where our numbers and the workbook’s don’t match, the archive will show it and
          say why, so any mistakes get found and fixed.
        </p>
        <button type="button" className="apc-btn is-primary" onClick={done}>Got it, show the names</button>
      </section>
    </details>
  );
}
