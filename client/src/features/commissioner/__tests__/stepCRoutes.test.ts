import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// App.tsx is too heavy to mount (providers, auth, lazy shells), so this guards
// the route table at the source level: each step C route must be declared, in
// ErrorBoundary, ABOVE the `/commissioner/:leagueId/:section` catch-all, and
// the more specific path must come before its prefix.
const app = readFileSync(resolve(__dirname, "../../../App.tsx"), "utf8");
const idx = (needle: string) => {
  const i = app.indexOf(needle);
  expect(i, `missing ${needle}`).toBeGreaterThan(-1);
  return i;
};

describe("step C routes in App.tsx", () => {
  const catchAll = () => idx('path="/commissioner/:leagueId/:section"');
  const routes: [string, string][] = [
    ['path="/commissioner/:leagueId/meeting/:periodId/review"', "<MeetingReviewPage />"],
    ['path="/commissioner/:leagueId/meeting/:periodId"', "<MeetingPage />"],
    ['path="/commissioner/:leagueId/rosters/:teamId"', "<TeamRosterPage />"],
    ['path="/commissioner/:leagueId/rosters"', "<RostersPage />"],
    ['path="/commissioner/:leagueId/trades"', "<CommissionerTradesPage />"],
  ];

  it.each(routes)("%s renders %s inside ErrorBoundary above the catch-all", (path, el) => {
    const i = idx(path);
    expect(i).toBeLessThan(catchAll());
    const line = app.slice(i, app.indexOf("\n", i));
    expect(line).toContain("<ErrorBoundary");
    expect(line).toContain(el);
  });

  it("declares routes most-specific first", () => {
    const order = routes.map(([p]) => idx(p));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
