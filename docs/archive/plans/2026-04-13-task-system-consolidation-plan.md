# Task-System Consolidation Plan

**Status:** Proposal — awaiting decision  
**Owner:** @jimmy  
**Blocks:** None (cosmetic IA improvement, not launch-blocking)  
**Unblocks:** Clearer cross-linking, single source of truth for work items

---

## Problem

Two parallel task systems live in `server/data/` with overlapping responsibilities:

| File | Shape | Purpose | Lines |
|---|---|---|---|
| `admin-tasks.json` | `milestones[].tasks[]` | Launch-critical milestone tracking | 485 |
| `todo-tasks.json` | `categories[].tasks[]` | Weekly operational tasks | 285 |

They overlap. Example: both contain a `stripe-setup` task with the same `id`. They're edited from different UIs (`/admin` "Launch Milestones" tab vs. `/todo` page). Changing one does not change the other. An outside observer cannot tell which is canonical, which invites silent drift.

Beyond drift: the field sets diverge.
- `todo-tasks.json` tasks have: `priority`, `targetDate`, `roadmapLink`, `conceptLink`, `notes`, `createdAt`, `updatedAt`
- `admin-tasks.json` tasks have: `owner`, `instructions` — but no priority, no cross-links, no timestamps

The richer schema lives in `/todo`. The cross-link work just completed (Roadmap/Concepts deep links, RelatedTodos reverse panel) only plugs into `todo-tasks.json`. Milestones have no reverse link.

---

## Goal

One canonical task store. One UI for editing. One schema. Cross-links work universally.

Preserve the legitimate distinction between **milestone-level** ("what blocks launch") and **task-level** ("what am I doing this week") as a first-class hierarchy, not two parallel stores.

---

## Proposed shape

Single file `server/data/work.json` (rename-in-spirit — name negotiable):

```jsonc
{
  "milestones": [
    {
      "id": "mvp-launch",
      "title": "MVP — Accept First External League",
      "description": "Everything needed before a non-OGBA league can use the platform.",
      "targetDate": "2026-05-15",
      "status": "in_progress",
      "categories": [
        {
          "id": "monetization",
          "title": "Monetization & Payments",
          "description": "Stripe, pricing, subscriptions, feature gating",
          "tasks": [
            {
              "id": "stripe-setup",
              "title": "Stripe account + product setup",
              "status": "not_started",
              "priority": "p1",
              "owner": "jimmy",
              "instructions": ["…"],
              "roadmapLink": "/roadmap#monetization",
              "conceptLink": "/concepts#pricing",
              "targetDate": "2026-04-30",
              "updatedAt": "…"
            }
          ]
        }
      ]
    },
    {
      "id": "post-launch",
      "title": "Post-Launch Operations",
      "description": "Ongoing weekly work not tied to a specific milestone.",
      "categories": [ /* everything currently in todo-tasks categories */ ]
    }
  ]
}
```

### Why this shape
- **3-level hierarchy** (milestone → category → task) matches how people think about work
- **Migratable**: existing `todo-tasks.json` categories become the `post-launch` milestone's categories verbatim; existing `admin-tasks.json` milestones become top-level milestones (their tasks wrap into a single default category per milestone)
- **No information loss** — all 7 current task fields (priority, targetDate, roadmapLink, conceptLink, notes, createdAt, updatedAt) preserved; admin-tasks gains them with nullable defaults
- **Back-compat**: `GET /api/admin/todos` can return a flattened view (just the tasks) for the existing `/todo` page while milestone-aware consumers query the full tree

---

## Migration

### Data migration (one-shot script)
1. `scripts/migrate-work-data.ts` — merges the two JSON files into `work.json`
2. De-dup rule: if a task id appears in both, the `todo-tasks.json` version wins (richer schema)
3. Write audit log entry for each de-dup decision
4. Back up both source files before overwriting

### Endpoint migration
- Rename `admin/todos` routes → `admin/work` routes, with compat aliases for the old paths (307 redirects) kept for one release
- New endpoint `GET /api/admin/work` returns the full milestone tree
- `GET /api/admin/work/tasks` returns the flat list (for `/todo` page compatibility)
- Deprecate `/api/admin/tasks` (milestone-only endpoint) in favor of `/api/admin/work?milestoneId=…`

### UI migration
- `/admin` "Launch Milestones" tab → reads milestones where `id !== "post-launch"` (the intentional launch-critical ones)
- `/todo` page → reads flattened tasks, with a new "Milestone" column/filter
- Both UIs write through the same endpoint
- `RelatedTodos` component gains a `milestone` field in its display

---

## Alternatives considered

### Option B: Keep two systems, clearer labels
- Pro: Zero migration risk
- Con: Drift risk remains; field divergence forces per-system feature work; cross-linking stays uneven
- **Rejected** — the root problem is two systems, not just two labels

### Option C: Move everything into the database
- Add `WorkItem` Prisma model with self-referential parent_id for milestone/category/task hierarchy
- Pro: Queryable, join-friendly with other models (users, leagues)
- Pro: Real timestamps, real validation, real multi-user editing
- Con: Heavier migration; overkill for a solo-admin tool today
- **Defer** — revisit if multi-admin editing becomes a requirement. For now, JSON with single writer is fine.

### Option D: Nothing — live with the duplication
- Pro: No work
- Con: Every future change doubles the cost
- **Rejected**

---

## Risk

- **Low.** No production-user-facing impact (admin-only UIs). Rollback is restoring two JSON files from git. No DB schema change.
- One-hour implementation if the merge script is kept dumb and explicit. Testing = eyeball the generated file.

---

## Decision requested

1. Approve this shape? Any field additions you want baked in while we're touching everything?
2. OK to merge `todo-tasks` "monetization" category into the new `mvp-launch` milestone? (Currently it's its own top-level category; under the new model it would nest under the MVP milestone.)
3. Timeline — ship before or after the `/admin/users` session-tracking migration? I'd suggest after (that's a bigger schema change; don't stack unrelated risk).

Say "go" and I'll:
1. Write the merge script
2. Generate the merged file
3. Update the two endpoints + UIs
4. Delete the old JSON files
5. Update CLAUDE.md and FEEDBACK.md
