// The explainer at the top of the player check. It opens short: why the check
// exists, the three rules, and a "Got it" button. "More detail" adds how to
// decide each kind of name, tips, and what the decisions feed next. Open until
// the reader folds it; that choice is remembered on this device only (a
// convenience, so storage may fail).
import React, { useRef, useState } from "react";

const KEY = "apc-guide-folded";

function readFolded(): boolean {
  try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; }
}
function writeFolded(folded: boolean) {
  try { window.localStorage.setItem(KEY, folded ? "1" : "0"); } catch { /* private window: just don't remember */ }
}

/** Who is reading, as far as the guide's wording goes. */
export type GuideReader =
  | { kind: "owner"; team: string }
  | { kind: "commissioner" }
  | { kind: "admin" };

/** The one place on the page that says whose decisions are final, worded for the reader. */
function finalSay(reader: GuideReader): string {
  if (reader.kind === "owner") return `You see only the names on ${reader.team}. The commissioner’s decisions are final and can replace yours.`;
  if (reader.kind === "commissioner") return "Your decisions are final: nobody else can change them, and you can change anyone’s.";
  return "Your decisions and the commissioner’s are final: nobody else can change them.";
}

export function PlayerCheckGuide({ settled, reader }: { settled: number; reader: GuideReader }) {
  const [open, setOpen] = useState(() => !readFolded());
  const [more, setMore] = useState(false);
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
      <summary>How this works</summary>

      <div className="apc-guide-short">
        <p>
          The old workbooks write players as an initial and a last name (“J. Wright”). Before we can pull stats and
          check each season’s totals, every name has to point to one MLB player. The computer settled{" "}
          {settled.toLocaleString("en-US")} names on its own; these are the ones it couldn’t.
        </p>
        <ul>
          <li><strong>Pick the player who was on that team that season.</strong> Confirm the suggested one, pick another, or search.</li>
          <li><strong>Not sure? Leave it.</strong> A wrong pick puts the wrong stats on a team. An undecided name just waits.</li>
          <li>{finalSay(reader)}</li>
        </ul>
        <div className="apc-guide-actions">
          <button type="button" className="apc-btn is-primary" onClick={done}>Got it, show the names</button>
          <button type="button" className="apc-btn" aria-expanded={more} aria-controls="apc-guide-more" onClick={() => setMore((v) => !v)}>
            {more ? "Less detail" : "More detail"}
          </button>
        </div>
      </div>

      {more && (
        <div id="apc-guide-more">
          <section aria-label="What each card shows">
            <h2>What each card shows</h2>
            <p>
              The spelling from the workbook, the season and team, the roster slots the player held (3B, OF, P…),
              where the name appears (draft day, each period’s roster, the final roster) and the candidates with their
              stats for that season.
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
                listed at 3B). If that really was him and the league allowed it, tap <strong>Keep [player]: the league
                allowed it</strong>. If it’s the wrong person, tap <strong>Wrong player</strong> and search for the right one.
              </dd>
              <dt>Open</dt>
              <dd>
                More than one player fits and none is clearly right, or nobody fits the spelling. We may still point to
                the player who played the most; treat that as a hint, not an answer. Pick the right one, or tap{" "}
                <strong>Search for someone else</strong> and type at least three letters of the name. If you can’t find
                him, tap <strong>Can’t find him</strong> or <strong>None of these</strong> so we know it still needs work.
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
              <li>Tap a candidate’s name to open his MLB.com page (with his teams and positions) in a new tab.</li>
              <li>The original workbook for any season is on that season’s Archive page, under Download workbook.</li>
              <li>Use <strong>Decide the next name</strong> to go straight to the next one. You can take back your own decision with <strong>Undo</strong>.</li>
              <li>Every decision is saved with the name of the person who made it.{reader.kind === "owner" ? "" : " Owners who help see only their own team’s names."}</li>
            </ul>
          </section>

          <section aria-label="What happens next">
            <h2>What happens next</h2>
            <p>
              Once the names are decided, we pull every player’s stats for the periods he was on each team and check our
              totals against the workbook’s. Where they don’t match, the archive will show it and say why, so any
              mistakes get found and fixed.
            </p>
          </section>
        </div>
      )}
    </details>
  );
}
