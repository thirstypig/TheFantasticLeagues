---
title: "test: End-to-end auction lifecycle test in production"
type: test
status: active
date: 2026-03-22
---

# test: End-to-end auction lifecycle test in production

## Overview

Full lifecycle test of the auction system on thefantasticleagues.com before the real draft. Covers: init → nominate → bid → timer → finish → roster update, plus WebSocket, proxy bids, pause/resume, multi-user, mobile, and post-draft analytics.

## Prerequisites

- [ ] Production deployed with latest code (PRs #76, #77 merged)
- [ ] At least 2 browser sessions (one admin, one team owner) — or two devices
- [ ] League with 2+ teams set up (league 1 or 2, user jimmychang316@gmail.com is admin + commissioner)
- [ ] Season in SETUP status (auction init will auto-transition to DRAFT)

---

## Phase 1: Initialization & Connection

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1.1 | **Health check** | `curl https://thefantasticleagues.com/api/health` | 200 OK |
| 1.2 | **Auth** | Log in as admin user | Dashboard loads, league selector works |
| 1.3 | **Init auction** | POST `/api/auction/init` (via Admin page or curl) | Auction state created, season → DRAFT |
| 1.4 | **WebSocket connect** | Navigate to Auction page | Connection status: "connected" (no reconnecting banner) |
| 1.5 | **State load** | Refresh page | Auction state persists (nomination queue, budgets visible) |

## Phase 2: Nomination Flow

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 2.1 | **Nominate player** | Click player in pool → nominate with $1 start bid | Player appears in stage, timer starts, sound plays |
| 2.2 | **Queue rotation** | After finish, check whose turn | Queue advances to next team |
| 2.3 | **Player pool filter** | Search by name, filter by position, toggle AL/NL | Filters work, nominated players removed from pool |
| 2.4 | **Watchlist** | Star a player, toggle watchlist view | Stars persist across page refresh |
| 2.5 | **Nomination queue** | Add players to personal queue, reorder | Queue persists in localStorage |
| 2.6 | **Nomination timer skip** | Let nomination timer expire (30s default) | Queue auto-advances to next team |

## Phase 3: Bidding Flow

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 3.1 | **Place bid** | Bid on active nomination | Bid accepted, timer resets, amount updates |
| 3.2 | **Minimum increment** | Try bid = currentBid (not higher) | Error: bid must exceed current |
| 3.3 | **Budget limit** | Try bid exceeding remaining budget | Error: insufficient budget |
| 3.4 | **Position limit** | Try bidding when pitcher/hitter slots full | Error: position limit reached |
| 3.5 | **Outbid notification** | Get outbid by another user/session | Sound plays, notification pops (if permitted) |
| 3.6 | **Real-time update** | Bid from session A, observe session B | Both sessions see bid update simultaneously |

## Phase 4: Proxy Bidding

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 4.1 | **Set proxy bid** | Enter max bid amount | Proxy saved, confirmation shown |
| 4.2 | **Auto-bid trigger** | Someone bids below your proxy max | System auto-bids to currentBid+1 |
| 4.3 | **Proxy vs proxy** | Two teams with proxy bids, manual bid triggers resolution | Higher proxy wins at lower proxy + 1 |
| 4.4 | **Cancel proxy** | Delete proxy bid | Proxy removed, no more auto-bids |
| 4.5 | **Privacy** | Check if other users can see your proxy | Proxy bids stripped from broadcast |

## Phase 5: Timer & Auto-Finish

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 5.1 | **Timer countdown** | Watch timer after nomination | Counts down from bid_timer (15s default) |
| 5.2 | **Timer extension** | Bid with <5s remaining | Timer resets to full bid_timer |
| 5.3 | **Auto-finish** | Let timer expire without bidding | Player awarded to high bidder automatically |
| 5.4 | **Critical timer** | Watch last 5 seconds | Sound ticks, visual glow/animation |
| 5.5 | **Going once** | Timer at 3-5 seconds | "Going once..." message visible |

## Phase 6: Pause & Resume

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 6.1 | **Pause auction** | Click pause as commissioner/admin | Timer stops, status shows paused |
| 6.2 | **Time preserved** | Note remaining time before pause | On resume, timer starts from preserved time |
| 6.3 | **Resume** | Click resume | Timer resumes, bidding continues |
| 6.4 | **Non-admin pause** | Try to pause as regular team owner | Not available / 403 error |

## Phase 7: Finish & Roster

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 7.1 | **Manual finish** | Click finish as admin | Player awarded, roster entry created |
| 7.2 | **Budget deduction** | Check winning team's budget | Budget reduced by winning bid amount |
| 7.3 | **Roster entry** | Check winning team's roster | Player appears on roster |
| 7.4 | **Queue advance** | After finish | Next team prompted to nominate |
| 7.5 | **Undo finish** | Click undo as admin | Last roster entry deleted, queue backs up |

## Phase 8: WebSocket & Reconnection

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 8.1 | **Real-time sync** | Two browsers, actions in one appear in other | Updates within 100ms |
| 8.2 | **Reconnect** | Kill network briefly (airplane mode on phone) | "Reconnecting..." banner, auto-reconnects |
| 8.3 | **State recovery** | Reconnect after missing events | Full state fetched on reconnect, no stale data |
| 8.4 | **Chat** | Send message in chat tab | Message appears in all connected sessions |
| 8.5 | **Chat rate limit** | Send 6+ messages in 10 seconds | Excess messages silently dropped |

## Phase 9: Mobile (390px)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 9.1 | **Layout stacked** | Open auction on phone | Nomination stage on top, player pool below |
| 9.2 | **Bid controls** | Tap bid buttons | All buttons tappable (44px+ targets) |
| 9.3 | **Timer visible** | Active nomination on mobile | Timer countdown clearly visible |
| 9.4 | **Player pool scroll** | Scroll through player pool | Smooth scroll, sticky headers work |
| 9.5 | **Hamburger menu** | Open sidebar on mobile | Drawer slides out, navigation works |
| 9.6 | **ContextDeck tabs** | Switch between Pool/Teams/Queue/Chat | Tabs tappable, content switches |

## Phase 10: Edge Cases & Error Recovery

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 10.1 | **Duplicate nomination** | Try nominating already-rostered player | Error: player already on roster |
| 10.2 | **$1 lot** | Nominate at $1, no other bids | Player awarded at $1 |
| 10.3 | **Last roster spot** | Team with 22/23 players bids | Allowed; after win, team marked full |
| 10.4 | **Full team skip** | Team at 23 players, nomination turn | Queue auto-skips to next team |
| 10.5 | **Reset** | Admin resets auction | All rosters/lots/bids cleared, fresh start |
| 10.6 | **Force assign** | Commissioner force-assigns player to team | Roster updated, state refreshed |
| 10.7 | **Page refresh** | Refresh mid-auction | State restored from persistence, no data loss |

## Phase 11: Post-Draft Analytics

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 11.1 | **Complete auction** | Fill all team rosters (or reset + test with small roster) | Auction status → completed |
| 11.2 | **Retrospective** | Navigate to auction complete page | League stats, bargains, overpays, position spending visible |
| 11.3 | **Draft grades** | Request AI grades | Grades generated (A+ through F), cached on second request |
| 11.4 | **Bid history** | View bid history | All lots with bid details, team names, amounts |

## Phase 12: Sound & Notifications

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 12.1 | **Nomination sound** | Player nominated | Bright ding (880 Hz) |
| 12.2 | **Outbid sound** | Get outbid | Alert pattern (440→550 Hz) |
| 12.3 | **Win sound** | Win a player | C major arpeggio |
| 12.4 | **Mute toggle** | Click mute button | All sounds silenced; persists on refresh |
| 12.5 | **Browser notification** | Get outbid with tab in background | Desktop notification appears |

---

## Quick Smoke Test (10 minutes)

If time is limited, run just these critical-path tests:

1. **1.3** — Init auction
2. **1.4** — WebSocket connects
3. **2.1** — Nominate a player
4. **3.1** — Place a bid
5. **5.3** — Let timer auto-finish
6. **7.2** — Verify budget deducted
7. **7.3** — Verify player on roster
8. **6.1 + 6.3** — Pause and resume
9. **9.2** — Bid controls on mobile
10. **10.5** — Reset (cleanup)

---

## Cleanup After Testing

- [ ] Reset auction via Admin (`POST /api/auction/reset`)
- [ ] Verify season status is appropriate for pre-draft state
- [ ] Confirm no test roster entries remain

## Files Reference

| Area | Key Files |
|------|-----------|
| Server routes | `server/src/features/auction/routes.ts` |
| WebSocket | `server/src/features/auction/services/auctionWsService.ts` |
| Client layout | `client/src/features/auction/components/AuctionLayout.tsx` |
| Bid controls | `client/src/features/auction/components/AuctionStage.tsx` |
| Player pool | `client/src/features/auction/components/PlayerPoolTab.tsx` |
| State hook | `client/src/features/auction/hooks/useAuctionState.ts` |
| Sounds | `client/src/features/auction/hooks/useAuctionSounds.ts` |
| Notifications | `client/src/features/auction/hooks/useAuctionNotifications.ts` |
| Existing tests | 93 tests across 7 test files |
