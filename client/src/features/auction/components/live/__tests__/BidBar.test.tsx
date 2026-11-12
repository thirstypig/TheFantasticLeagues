import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BidBar, { type BidBarProps } from '../BidBar';
import type { AuctionTeam, NominationState } from '../../../hooks/useAuctionState';

const nomination: NominationState = {
  playerId: '682829', playerName: 'Elly De La Cruz', playerTeam: 'CIN', positions: 'SS', isPitcher: false,
  nominatorTeamId: 3, currentBid: 34, highBidderTeamId: 2,
  endTime: new Date(Date.now() + 9000).toISOString(), timerDuration: 15, status: 'running',
};
const me: AuctionTeam = { id: 1, name: 'Los Doyers', code: 'DOY', budget: 69, maxBid: 61, rosterCount: 14, spotsLeft: 9, roster: [] };

function setup(over: Partial<BidBarProps> = {}) {
  const props: BidBarProps = {
    nomination, myTeam: me, bidding: true, paused: false, myMaxBid: null,
    onBid: vi.fn().mockResolvedValue(undefined),
    onSetMaxBid: vi.fn().mockResolvedValue(undefined),
    onClearMaxBid: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  render(<BidBar {...props} />);
  return props;
}

describe('BidBar', () => {
  it('shows +1, +5 and Type an amount, plus the spend line', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Bid $35' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '$39' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Type an amount' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Set a max bid' })).toBeTruthy();
    expect(screen.getByText(/You can spend up to/).textContent).toBe('You can spend up to $61');
  });

  it('uses the phone label Type', () => {
    setup({ compact: true });
    expect(screen.getByRole('button', { name: 'Type' })).toBeTruthy();
  });

  it('+1 and +5 bid those amounts', async () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Bid $35' }));
    await waitFor(() => expect(p.onBid).toHaveBeenCalledWith(35));
    fireEvent.click(screen.getByRole('button', { name: '$39' }));
    await waitFor(() => expect(p.onBid).toHaveBeenCalledWith(39));
  });

  it('disables a button above my max bid', () => {
    setup({ myTeam: { ...me, maxBid: 37 } });
    expect((screen.getByRole('button', { name: 'Bid $35' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: '$39' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    ['', 'Enter a whole number'],
    ['35.5', 'Enter a whole number'],
    ['34', 'Bid must be more than $34'],
    ['62', 'Your max bid is $61'],
  ])('rejects typed %j client-side with %j', (value, message) => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Type an amount' }));
    fireEvent.change(screen.getByLabelText('Bid amount'), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Bid' }));
    expect(screen.getByRole('alert').textContent).toBe(message);
    expect(p.onBid).not.toHaveBeenCalled();
  });

  it('sends a valid typed bid inline (no modal) and closes the field', async () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Type an amount' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.change(screen.getByLabelText('Bid amount'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bid' }));
    await waitFor(() => expect(p.onBid).toHaveBeenCalledWith(50));
    await waitFor(() => expect(screen.queryByLabelText('Bid amount')).toBeNull());
  });

  it("shows the server's error inline when the bid is rejected", async () => {
    setup({ onBid: vi.fn().mockRejectedValue(new Error('Auction is paused')) });
    fireEvent.click(screen.getByRole('button', { name: 'Bid $35' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Auction is paused');
  });

  it("shows You're winning instead of bid buttons when I'm the high bidder", () => {
    setup({ nomination: { ...nomination, highBidderTeamId: 1 } });
    expect(screen.getByText("You're winning")).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Bid \$/ })).toBeNull();
  });

  it('shows Paused instead of bid buttons while paused', () => {
    setup({ paused: true });
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Bid \$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set a max bid' })).toBeNull();
  });

  it('renders no bid buttons without a team or outside bidding', () => {
    setup({ myTeam: null });
    expect(screen.queryByRole('button', { name: /^Bid \$/ })).toBeNull();
    expect(screen.getByText("You don't have a team in this league")).toBeTruthy();
  });

  it('renders nothing when the status is not bidding', () => {
    const { container } = render(
      <BidBar nomination={nomination} myTeam={me} bidding={false} paused={false} myMaxBid={null}
        onBid={vi.fn()} onSetMaxBid={vi.fn()} onClearMaxBid={vi.fn()} />,
    );
    expect(container.textContent).toBe('');
  });

  it('Set a max bid opens the editor and sets the typed amount', async () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Set a max bid' }));
    fireEvent.change(screen.getByLabelText('Max bid'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    await waitFor(() => expect(p.onSetMaxBid).toHaveBeenCalledWith(40));
  });

  it('validates the max bid and shows the existing one with Clear', async () => {
    const p = setup({ myMaxBid: 40 });
    fireEvent.click(screen.getByRole('button', { name: 'Your max bid: $40 (auto)' }));
    fireEvent.change(screen.getByLabelText('Max bid'), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    expect(screen.getByRole('alert').textContent).toBe('Your max bid is $61');
    expect(p.onSetMaxBid).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(p.onClearMaxBid).toHaveBeenCalled());
  });
});
