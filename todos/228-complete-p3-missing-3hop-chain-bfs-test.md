---
status: pending
priority: p3
issue_id: 228
tags: [code-review, testing, transactions]
---

# Missing 3-Hop Chain BFS Test in AddDropPanel.test.tsx

## Problem Statement

The BFS chain-fit algorithm in `filteredDropCandidates` claims to handle "2-, 3-, 4+-player chains" (see comment at line 667). The 6 BFS tests in PR #349 only exercise 1-hop chains (Tatis 2B→OF frees a slot for a 2B FA). There is no test that exercises a 3-hop chain:

```
Add: a 2B player (addSlots = {2B, MI})
Roster: 
  Player A: assigned 2B, eligible 2B+MI
  Player B: assigned MI, eligible MI+3B
  Player C: assigned 3B, eligible 3B+OF
Drop: Player D (assigned OF, pure OF)
Expected: Player D should appear in filteredDropCandidates via chain A→B→C
```

If the BFS `while (changed)` loop had a depth-1 bug (only ran once instead of until stable), all existing tests would pass but 3-hop chains would silently fail.

## Proposed Solution

Add one test to `AddDropPanel.test.tsx` in the `chain-drop-candidates` describe block:

```typescript
it("3-hop chain: A(2B→MI) B(MI→3B) C(3B→OF) — drop a pure OF player", async () => {
  const fa2B = { mlb_id: "900", player_name: "2B FA", positions: "2B" } as RosterMovesPlayer;
  const playerA = { _dbPlayerId: 901, _dbTeamId: 147, player_name: "Player A", assignedPosition: "2B", positions: "2B,MI" } as RosterMovesPlayer;
  const playerB = { _dbPlayerId: 902, _dbTeamId: 147, player_name: "Player B", assignedPosition: "MI", positions: "MI,3B" } as RosterMovesPlayer;
  const playerC = { _dbPlayerId: 903, _dbTeamId: 147, player_name: "Player C", assignedPosition: "3B", positions: "3B,OF" } as RosterMovesPlayer;
  const dropTarget = { _dbPlayerId: 904, _dbTeamId: 147, player_name: "Drop Target OF", assignedPosition: "OF", positions: "OF" } as RosterMovesPlayer;

  mockSeasonStatus.value = "SETUP";
  const user = userEvent.setup();
  render(<AddDropPanel {...BASE_PROPS} players={[fa2B, playerA, playerB, playerC, dropTarget]} />);
  await user.click(screen.getByText("2B FA"));
  expect(await screen.findByRole("row", { name: /Drop Target OF/ })).toBeInTheDocument();
});
```

## Acceptance Criteria
- [ ] Test added and passing
- [ ] Test explicitly uses a 3-player intermediate chain (not a 1-hop)
- [ ] A player with NO chain path (e.g. pure 1B) is also in the fixture and asserted absent
