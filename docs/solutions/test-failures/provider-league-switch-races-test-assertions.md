---
title: "LeagueProvider tests flake on slow CI: the provider switches league mid-test and the test reads the wrong league's rules"
slug: provider-league-switch-races-test-assertions
category: test-failures
problem_type: flaky-test / async-race
component: "client/src/contexts/LeagueContext.tsx, client/src/contexts/__tests__/LeagueContext.test.tsx"
created: 2026-11-17
severity: medium
symptoms:
  - "main's CI goes red on a LeagueContext test that passed on its PR and passes on rerun"
  - "The failing assertion sees the rules (or `live` flag) of league 1, not the user's league"
  - "Only reproduces under load (CI runners, full suite), never in an isolated local run"
root_cause: "LeagueProvider mounts on league 1, then switches to the user's own league once getLeagues resolves, which clears and refetches the rules. A test that queued a mocked rules response (mockImplementationOnce) right after the first render could have that response consumed by the switch's refetch instead of by the event it meant to test, or could assert before the switch landed."
related_files:
  - client/src/contexts/__tests__/LeagueContext.test.tsx
tags:
  - ci
  - flaky-test
  - vitest
  - react-testing-library
  - async
---

# LeagueProvider tests flake when the league switch lands mid-test

## Symptom

Main went red three times in a row (commits 9832fce, 89de463, 1c6164a, 2026-11-15) on two
LeagueContext tests: "a failed rules refresh keeps the rules it already has" and "re-reads the
league rules when the tab becomes visible, keeping the old map meanwhile". Each passed on its
own PR. Nobody noticed for a day because the post-merge check only confirmed the prod
`/api/health` version, and Railway deploys whether or not main's CI passes.

## Root cause

The provider has two phases at mount: it starts on league 1, then moves to the user's league
after `getLeagues`. That move clears the rules and fetches them again. The tests waited only
for "rules loaded", which is true in BOTH phases. On a fast machine the switch was done before
the test's next step; on a loaded runner it wasn't, so either:

- the test's one-shot mocked response (`mockImplementationOnce`) was eaten by the switch's
  refetch, or
- the assertion ran against league 1's rules.

## Reproduction (the proof the fix targets the real cause)

Hold the `getLeagues` promise open, and release it immediately after the test queues its slow
rules response. main's version of the test fails every time; the fixed version passes.

## Fix (PR #506 for the first test, #508 for the second)

A probe renders both the league the rules belong to (`rules-league`) and the `live` flag, and a
helper waits for both before the test does anything else:

```ts
async function settledOnLeague(leagueId: number, live: string) {
  await waitFor(() => {
    expect(screen.getByTestId("rules-league").textContent).toBe(String(leagueId));
    expect(screen.getByTestId("live").textContent).toBe(live);
  });
}
```

## General rule

When a provider reaches its final state in more than one step, "loaded" isn't a safe point to
wait for. Wait for a value that only the FINAL step produces: here, the league id the rules
were loaded for. And after every merge, check main's CI run, not just the deployed version.
