# Roster Hub Direction Lock — Answers to the 28 Open Questions

**Date:** 2026-04-30
**Source:** PR #198 (drag + pending-changes preview) + PR #205 (FA / IL / complex batch previews)
**Browser-verified:** all 4 scenarios at `/design/roster-hub-deferred`, screenshots saved to `verify-200-drop-dropdown-fixed.png`, `design-1-hub-scenario.png`, `design-2-fa-scenario.png`, `design-3-il-scenario.png`, `design-4-complex-scenario.png`
**Status:** **Sign-off given by Jimmy Chang on 2026-04-30** — production wiring may proceed using these answers as the contract.

**Update 2026-05-03:** Roster Hub is no longer just a deferred design preview. It is the active product direction for OGBA roster management. Add/drop, IL stash, and IL activate should keep using focused flows with server-backed previews and confirmation gates. The active planning source is `server/data/planning.json`; this doc is rationale and product contract, not the todo list.

---

## Hub mutations (7 questions)

1. **Drop semantics — direct swap vs. queue for bipartite auto-resolve matcher?**
   → **Queue for the bipartite matcher.** Mirrors what production already does at `/manage/claim`. Consistency wins — don't introduce a second policy.

2. **Save trigger — explicit click vs. debounced auto-save?**
   → **Explicit click only.** Roster mutations are deliberate; auto-save is too aggressive. Users compose, then commit.

3. **Navigate-away with pending — block / confirm, auto-save, or auto-revert?**
   → **Confirm dialog ("You have N pending changes — save, discard, or stay?") + localStorage backup.** Don't auto-revert (data loss). Don't auto-save (changes the deliberate-commit policy from #2).

4. **Per-row revert UX — currently reverts ALL pending; should it ship?**
   → **Yes, fix to per-item revert.** The current "revert all" behavior on per-row click is the bug — replace it with single-row undo. Add a separate "Revert all" button alongside Save for the bulk action.

5. **Drag handle visibility — always-on vs. hover/focus only?**
   → **Always-on, subtle ⋮⋮ icon.** Hover-only fails on mobile (no hover) and hurts discoverability. Already what the preview ships.

6. **Cross-section drops — shake-reject (current) vs. reinterpret as IL stash / drop?**
   → **Shake-reject (current).** Auto-reinterpreting a hitter→P slot drag as "drop" or "stash" is surprising. Explicit IL-row drop = stash; explicit drop-pool drop = drop. Same surface, different intent, expressed by target.

7. **Pending dot color — yellow conflicts with IL-amber?**
   → **Cyan (`#22d3ee` / aurora-primary-400).** Distinct from IL-amber (`#f59e0b`) and the in-season warning chip yellow. Palette pass owed but the cyan is safe.

---

## Free agent add/drop (7 questions)

1. **Search ergonomics — name only, or also team/MLB position? Fuzzy match?**
   → **Name + MLB team abbreviation (substring, case-insensitive).** "BOS" finds Red Sox players. Position is filtered via the chip strip, not the search box. Fuzzy matching beyond substring is overkill for this dataset size.

2. **Filter persistence — does the panel remember the last filter across opens?**
   → **Session-only (component state). Reset on app reload.** Don't use localStorage — rosters change daily, stale filters confuse.

3. **Multi-add UX — sequential drops (current) vs. batch cart?**
   → **Sequential drops.** The pending-changes panel IS the batch. One source of truth.

4. **Eligibility hint during drag — highlight eligible vs. dim ineligible?**
   → **Both.** Eligible slots glow cyan; ineligible drop to 50% opacity. Dual-channel cue is more accessible.

5. **Drop pool placement — below roster vs. inline with line-through?**
   → **Below the roster, in a "Drop pool · N players" section.** Inline strikethroughs clutter the active table.

6. **Sort order — projected $ desc vs. trending vs. alphabetical?**
   → **Projected $ desc by default.** Add a sort dropdown with "Projected $", "Trending (last 7d)", "Alphabetical", "Position scarcity (eligibility count asc)". Default is the most actionable for in-season decisions.

7. **Mobile layout — side panel vs. full-screen sheet?**
   → **Bottom-anchored sheet at <768px.** Side panel only on tablet+. The sheet shares the active drag surface so long-press grab works across boundaries.

---

## IL management (7 questions)

1. **Status string handling — verbatim vs. normalized?**
   → **Verbatim ("Injured 10-Day", "Injured 60-Day").** It's what MLB.com shows. Carries duration info that "IL-10" loses. Consistent with current production display.

2. **Retroactive IL date — date picker vs. always "today"?**
   → **Always "today" for v1.** Backdating is a commissioner-only override; ships as a separate feature post-MVP.

3. **Ghost-IL warning — players still on roster but missing MLB IL status?**
   → **Surface a warning chip: "Status missing — last known: Injured 10-Day · 5 days ago" + "Resync" affordance.** Critical for transparency given daily MLB API sync lag. The chip links to the runbook for ghost-IL handling.

4. **Activate without drop — when bench has space, skip displacement?**
   → **Yes.** Don't force a drop the user doesn't need. Server-side matcher already handles this correctly.

5. **Auto-resolve preview — shimmy animation vs. explicit text?**
   → **Both.** 200ms shimmy for ≤2-player cascades. For 3+ player cascades, render an explicit "Auto-resolved: A → BN, B → 2B, C → drop pool" text confirmation before save. Threshold preserves snappy feel for simple moves.

6. **FA suggestion follow-up — after stash, surface "Add a FA"?**
   → **Inline chip "Add a FA to fill this slot →" that opens the FA panel pre-filtered to the vacated position.** Don't auto-open — too aggressive.

7. **Cross-role activation — can a hitter IL slot accept a pitcher?**
   → **No, by existing rule.** Confirmed; no change. Hitter IL = hitter only.

---

## Complex batch (7 questions)

1. **Batch reordering — chronological (current) vs. drag to reorder?**
   → **Chronological only for v1.** Reordering changes save semantics and complicates conflict resolution. Don't add a drag handle — would mislead.

2. **Partial revert UX — per-item only vs. "revert this and everything after"?**
   → **Per-item only.** Pending changes are independent unless explicitly chained. Add a dependency badge on chained changes (e.g., "depends on Drop #1") that must revert together. Otherwise per-item.

3. **Save confirm — button only vs. confirm modal?**
   → **Threshold-based.** ≤2 changes: Save click only. ≥3 changes: confirm modal with diff preview ("Save 4 changes? Drop A, IL stash B, Add C, Swap D ↔ E"). Balances friction vs. accidental-destructive risk.

4. **Conflict on save — atomic vs. best-effort partial?**
   → **Atomic.** All-or-nothing. If step 2 fails, all 4 roll back. Partial state is a debugging nightmare and confuses users about what actually happened.

5. **Persistence across navigation — localStorage backup?**
   → **Yes. localStorage with 1-hour TTL.** On next visit: "You have N pending changes from earlier — restore?" prompt. Beyond 1 hour, discard silently (player availability likely changed).

6. **Cross-team validation — client-side vs. server-side?**
   → **Server-side at save time.** Client lookup is best-effort but stale. Show validation results inline per change-row if any fails. Server is truth.

7. **Mobile rendering — full layout vs. condensed?**
   → **Condensed at <768px with "tap to expand".** Show: badge (DROP/SWAP/FA ADD/IL STASH), player name, one-line secondary. Expand reveals full details.

---

## What this unblocks

Production wiring for the **Hub scenario** can proceed now. The blockers were the 7 Hub questions; all 7 are answered.

The FA, IL, and complex-batch scenarios stay deferred until Hub ships and proves out the dnd-kit + pending-changes architecture against real API mutations.

## Implementation sequence (recommended)

1. **Hub** (this answers-doc) — 7 questions answered → wire drag + pending-changes against real `roster.update` / `transactions/claim` / `transactions/il-stash` endpoints. PR target: ~1 week.
2. **FA** — answer set already locked above. Build on Hub's pending-changes engine. PR target: ~3 days post-Hub.
3. **IL** — same pattern. PR target: ~3 days post-FA.
4. **Complex batch** — orchestrates the prior three. PR target: ~5 days post-IL.

Total: ~3-4 weeks for full v3 hub mutation suite to ship.

## Source artifacts

- PR #198 — base preview (Cluster E)
- PR #205 — extended scenarios (Cluster H)
- Verification screenshots — `design-1-hub-scenario.png` through `design-4-complex-scenario.png` in repo root (gitignored locally; copies attached to PR comments)
- Browser test: PR #200 verified end-to-end same session, screenshot at `verify-200-drop-dropdown-fixed.png`
