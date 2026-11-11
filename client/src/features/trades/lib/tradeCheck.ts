// Roster check for the New trade screen. Mirrors the server rule
// (tradeCapViolations): only a team whose active count goes UP and ends OVER
// the cap is blocked; a team already over the cap can still trade evenly.
export type CheckLine = { tone: "good" | "bad" | "note"; text: string };

export function checkTrade(args: {
  mineActive: number;
  theirsActive: number;
  give: number;
  get: number;
  cap: number;
  myName: string;
  theirName: string;
}): { ok: boolean; lines: CheckLine[] } {
  const { mineActive, theirsActive, give, get, cap, myName, theirName } = args;
  if (give === 0 && get === 0) return { ok: false, lines: [] };

  const mineAfter = mineActive - give + get;
  const theirsAfter = theirsActive - get + give;
  const lines: CheckLine[] = [];
  let ok = true;

  const teams = [
    { name: myName, before: mineActive, after: mineAfter },
    { name: theirName, before: theirsActive, after: theirsAfter },
  ];
  for (const t of teams) {
    if (t.after > t.before && t.after > cap) {
      ok = false;
      lines.push({ tone: "bad", text: `${t.name} would have ${t.after} players (limit ${cap})` });
    }
  }
  for (const t of teams) {
    if (t.after < t.before) {
      lines.push({ tone: "note", text: `${t.name} goes to ${t.after} and fills the spot at the meeting` });
    }
  }
  if (give === get) {
    lines.push({
      tone: "good",
      text: mineActive === theirsActive ? `Both rosters stay at ${mineActive}` : "Both rosters stay the same",
    });
  }
  return { ok, lines };
}
