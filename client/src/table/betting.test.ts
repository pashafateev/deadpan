import { describe, expect, test } from 'vitest';
import { betPresets, potTotal, snapBet } from './betting';

describe('potTotal', () => {
  test("adds the collected pots and this street's bets", () => {
    const pots = [{ amount: 40, eligibleSeats: [0, 1, 2] }, { amount: 10, eligibleSeats: [1, 2] }];
    expect(potTotal(pots, [5, 0, 15])).toBe(70);
  });
});

describe('betPresets', () => {
  test('opening bets are fractions of the pot', () => {
    const presets = betPresets({ potTotal: 10, currentBet: 0, callAmount: 0, minRaiseTo: 2, maxRaiseTo: 100 });
    expect(presets).toEqual([
      { label: '½ pot', amount: 5 },
      { label: 'Pot', amount: 10 },
      { label: 'All-in', amount: 100 },
    ]);
  });

  test('raises count the call first, like a pot-sized raise at a real table', () => {
    // Pot of 10 on the flop, opponent bets 5: calling makes it 20, so a pot raise is to 25.
    const presets = betPresets({ potTotal: 15, currentBet: 5, callAmount: 5, minRaiseTo: 10, maxRaiseTo: 200 });
    expect(presets).toEqual([
      { label: '½ pot', amount: 15 },
      { label: 'Pot', amount: 25 },
      { label: 'All-in', amount: 200 },
    ]);
  });

  test('never goes below the minimum raise', () => {
    const presets = betPresets({ potTotal: 3, currentBet: 2, callAmount: 2, minRaiseTo: 4, maxRaiseTo: 200 });
    expect(presets[0]).toEqual({ label: '½ pot', amount: 4 });
  });

  test('drops presets that would be all-in anyway', () => {
    const presets = betPresets({ potTotal: 100, currentBet: 0, callAmount: 0, minRaiseTo: 2, maxRaiseTo: 30 });
    expect(presets).toEqual([{ label: 'All-in', amount: 30 }]);
  });
});

describe('snapBet', () => {
  const range = { step: 10, min: 20, max: 500 };

  test('rounds to the nearest big blind', () => {
    expect(snapBet(23, range)).toBe(20);
    expect(snapBet(26, range)).toBe(30);
  });

  test('never goes below the minimum', () => {
    expect(snapBet(5, range)).toBe(20);
    expect(snapBet(14, { step: 10, min: 15, max: 500 })).toBe(15);
  });

  test('can always reach an all-in that is not a multiple of the big blind', () => {
    expect(snapBet(497, { step: 10, min: 20, max: 497 })).toBe(497);
  });
});
