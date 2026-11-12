/**
 * C4 + C5 (UX step F final fix wave): desktop live layout.
 *
 * jsdom does no layout, so this pins the CSS contract the browser check
 * measured against (live.css read raw) plus the DOM hooks it relies on:
 *  - C4: the Players column is viewport-bounded with its own scroll, and the
 *    center (lot / your turn) column is sticky, so the lot, bid buttons and
 *    clock never scroll off and the page doesn't grow to ~7,100px.
 *  - C5: the Your-turn search table and list never break inside a word:
 *    name cells use `overflow-wrap: normal` + ellipsis; the table is fixed
 *    layout so the Player column takes the free width.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Read from disk (vitest stubs CSS imports, ?raw included).
const css = readFileSync(resolve(__dirname, '../live.css'), 'utf8');

vi.mock('../../../../../components/shared/playerCard/PlayerCardProvider', () => ({
  PlayerLink: ({ name }: { name: string }) => <span className="pc-link">{name}</span>,
}));

import { PutUpPanel } from '../YourTurn';
import type { AuctionTeam } from '../../../hooks/useAuctionState';
import type { PlayerSeasonStat } from '../../../../../api';

/** Declarations of the first rule whose selector list matches exactly, within an optional @media block. */
function rule(selector: string, media?: string): string {
  let src = css;
  if (media) {
    const at = css.indexOf(`@media ${media}`);
    expect(at, `@media ${media} block`).toBeGreaterThan(-1);
    src = css.slice(at);
    // the block ends at the first "\n}" at column 0
    src = src.slice(0, src.indexOf('\n}') + 2);
  }
  const esc = selector.replace(/[.*+?^${}()|[\]\\>]/g, (c) => `\\${c}`);
  const m = new RegExp(`(^|[\\n}])\\s*${esc}\\s*\\{([^}]*)\\}`).exec(src);
  expect(m, `rule for "${selector}"${media ? ` in ${media}` : ''}`).not.toBeNull();
  return m![2].replace(/\s+/g, ' ');
}

describe('C4: desktop columns are bounded and the lot is pinned', () => {
  const wide = '(min-width: 1200px)';

  it('Players column: sticky, max-height under the viewport, scrolls itself', () => {
    const r = rule('.la-cols3 > .la-players', wide);
    expect(r).toMatch(/position: sticky/);
    expect(r).toMatch(/max-height: calc\(100vh - /);
    expect(r).toMatch(/overflow-y: auto/);
  });

  it('center (lot / your turn) column: sticky and viewport-bounded', () => {
    const r = rule('.la-cols3 > .la-center', wide);
    expect(r).toMatch(/position: sticky/);
    expect(r).toMatch(/top: /);
    expect(r).toMatch(/max-height: calc\(100vh - /);
    expect(r).toMatch(/overflow-y: auto/);
  });

  it('inside the scrolling center, the lot card / turn box (with its clock) stays at the top', () => {
    expect(rule('.la-cols3 > .la-center > .la-oc', wide)).toMatch(/position: sticky; top: 0/);
  });

  it('below 1200px the Players column (under the lot) is height-bounded with its own scroll', () => {
    const r = rule('.la-cols3 > .la-players', '(max-width: 1199px)');
    expect(r).toMatch(/max-height: /);
    expect(r).toMatch(/overflow-y: auto/);
  });
});

describe('C5: Your turn never breaks names mid-word', () => {
  it('list and row names: no overflow-wrap:anywhere; nowrap + ellipsis', () => {
    const r = rule('.la-row .la-t b');
    expect(r).not.toMatch(/anywhere/);
    expect(r).toMatch(/white-space: nowrap/);
    expect(r).toMatch(/text-overflow: ellipsis/);
  });

  it('search table: fixed layout; name cell ellipsis with overflow-wrap normal', () => {
    expect(rule('.yt-table')).toMatch(/table-layout: fixed/);
    expect(rule('.yt-table td')).not.toMatch(/anywhere/);
    const name = rule('.yt-table td.yt-name');
    expect(name).toMatch(/overflow-wrap: normal/);
    expect(name).toMatch(/white-space: nowrap/);
    expect(name).toMatch(/text-overflow: ellipsis/);
  });

  it('desktop put-up panel stacks (list over a full-width table) instead of a 240px side column', () => {
    expect(rule('.yt-grid')).toMatch(/grid-template-columns: minmax\(0, 1fr\);/);
  });

  it('the search table bounds its height so Last sales stays near', () => {
    const r = rule('.yt-tablewrap');
    expect(r).toMatch(/max-height: /);
    expect(r).toMatch(/overflow-y: auto/);
  });

  it('the Player cell carries the yt-name hook and a title with the full name', () => {
    const me: AuctionTeam = { id: 1, name: 'Los Doyers', code: 'LDY', budget: 69, maxBid: 61, rosterCount: 1, spotsLeft: 4, roster: [] };
    const tatis = { mlb_id: '665487', player_name: 'Fernando Tatis Jr.', positions: 'OF', mlb_team: 'SD', dollar_value: 30 } as PlayerSeasonStat;
    render(<PutUpPanel myTeam={me} list={[]} available={[tatis]} paused={false} variant="desktop" onPutUp={vi.fn()} onRemove={vi.fn()} />);
    const cell = within(screen.getByTestId('search-results')).getByText('Fernando Tatis Jr.').closest('td')!;
    expect(cell.className).toContain('yt-name');
    expect(cell.getAttribute('title')).toBe('Fernando Tatis Jr.');
  });
});
