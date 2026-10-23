import { describe, expect, test } from 'vitest';
import { EngineAdapter } from './adapter';
import { ACES_BOARD, THREE_HANDS, riggedRandom, seededRandom } from './test-fixtures';

const players = (stacks: number[]) => stacks.map((stack, seat) => ({ id: `p${seat}`, name: `Player ${seat}`, seat, stack }));
const fixture = (stacks = [1000, 1000], randomProvider = seededRandom()) =>
  new EngineAdapter(players(stacks), { randomProvider });
const finish = (engine: EngineAdapter) => {
  for (let step = 0; engine.view(null).handStatus === 'playing'; step++) {
    expect(step).toBeLessThan(100);
    const seat = engine.view(null).turn!.seat;
    const legal = engine.view(seat).legalActions!;
    engine.act(seat, { kind: legal.canCheck ? 'check' : 'call' });
  }
};

describe('EngineAdapter', () => {
  test('waiting view has no actor, cards, or legal actions', () => {
    const view = fixture().view(0);
    expect(view.handStatus).toBe('waiting');
    expect(view.turn).toBeNull();
    expect(view.legalActions).toBeNull();
    expect(view.seats[0]?.player).toMatchObject({ stack: 1000, cards: { kind: 'none' } });
  });

  test('starts an untimed heads-up hand and advances through real actions', () => {
    const engine = fixture();
    engine.deal();
    expect(engine.view(0)).toMatchObject({
      handStatus: 'playing', buttonSeat: 0, smallBlindSeat: 0, bigBlindSeat: 1,
      street: 'preflop', turn: { seat: 0, clock: null },
      legalActions: { canFold: true, canCheck: false, callAmount: 5, minRaiseTo: 20, maxRaiseTo: 1000 },
    });
    expect(engine.view(1).legalActions).toBeNull();
    engine.act(0, { kind: 'call' });
    expect(engine.view(1).legalActions?.canCheck).toBe(true);
    engine.act(1, { kind: 'check' });
    expect(engine.view(0)).toMatchObject({ street: 'flop', turn: { seat: 1, clock: null } });
    expect(engine.view(0).board).toHaveLength(3);
  });

  test('chip amounts are street totals and rejected requests do not mutate the view', () => {
    const engine = fixture();
    engine.deal();
    engine.act(0, { kind: 'raise', to: 60 });
    expect(engine.view(0).seats[0]?.player).toMatchObject({ stack: 940, bet: 60 });
    expect(engine.view(1).legalActions?.callAmount).toBe(50);
    const before = engine.view(0);
    expect(() => engine.act(0, { kind: 'call' })).toThrow();
    expect(() => engine.act(1, { kind: 'check' })).toThrow();
    expect(() => engine.act(1, { kind: 'raise', to: 61 })).toThrow();
    expect(() => engine.act(1, { kind: 'raise', to: 100.5 })).toThrow();
    expect(engine.view(0)).toEqual(before);
  });

  test('caps a short call by the remaining stack and runs out all-ins', () => {
    const engine = fixture([100, 30]);
    engine.deal();
    engine.act(0, { kind: 'raise', to: 100 });
    expect(engine.view(1).legalActions).toMatchObject({ callAmount: 20, minRaiseTo: null, maxRaiseTo: null });
    engine.act(1, { kind: 'call' });
    expect(engine.view(0)).toMatchObject({ handStatus: 'complete', turn: null, legalActions: null, pots: [] });
    expect(engine.view(0).board).toHaveLength(5);
    expect(engine.view(0).seats.reduce((sum, seat) => sum + (seat.player?.stack ?? 0), 0)).toBe(130);
  });

  test('represents a short all-in as the sole legal raise amount', () => {
    const engine = fixture([1000, 15]);
    engine.deal();
    expect(engine.view(0).legalActions?.callAmount).toBe(5);
    engine.act(0, { kind: 'call' });
    expect(engine.view(1).legalActions).toMatchObject({ minRaiseTo: 15, maxRaiseTo: 15 });
  });

  test('a short all-in cannot reopen raising in the normalized legal actions', () => {
    const engine = fixture([1000, 1000, 150]);
    engine.deal();
    engine.act(0, { kind: 'raise', to: 100 });
    engine.act(1, { kind: 'call' });
    engine.act(2, { kind: 'raise', to: 150 });
    expect(engine.view(0).legalActions).toMatchObject({ callAmount: 50, minRaiseTo: null, maxRaiseTo: null });
  });

  test('private views are fresh allowlisted data, not masked copies of engine state', () => {
    const engine = fixture([1000, 1000], riggedRandom([['As', 'Ah'], ['Kc', 'Kd']], ACES_BOARD));
    engine.deal();
    const view = engine.view(0);
    expect(view.seats[0]?.player?.cards).toEqual({ kind: 'shown', cards: [{ rank: 'A', suit: 's' }, { rank: 'A', suit: 'h' }] });
    expect(view.seats[1]?.player?.cards).toEqual({ kind: 'hidden' });
    expect(engine.view(null).seats.every((seat) => seat.player?.cards.kind !== 'shown')).toBe(true);
    expect(view).not.toHaveProperty('deck');
    expect(view).not.toHaveProperty('previousStates');
    expect(view).not.toHaveProperty('config');
    expect(view).not.toHaveProperty('actionHistory');
    if (view.seats[0]?.player) view.seats[0].player.stack = 0;
    expect(engine.view(0).seats[0]?.player?.stack).toBe(995);
  });

  test('fold settlement preserves street/privacy, returns uncalled chips, and clears live pots', () => {
    const engine = fixture();
    engine.deal();
    engine.act(0, { kind: 'raise', to: 100 });
    engine.act(1, { kind: 'fold' });
    expect(engine.view(1)).toMatchObject({ handStatus: 'complete', street: 'preflop', pots: [], currentBet: 0, turn: null });
    expect(engine.view(1).seats[0]?.player?.cards).toEqual({ kind: 'hidden' });
    expect(engine.view(0).seats[1]?.player?.cards).toEqual({ kind: 'none' });
    expect(engine.view(0).seats.map((seat) => seat.player?.stack)).toEqual([1010, 990]);
    expect(engine.view(0).winners).toEqual([{ seat: 0, amount: 20, handLabel: '', bestCards: [] }]);
  });

  test('contested showdown reveals contenders and aggregates winnings without double-counting pots', () => {
    const engine = fixture([100, 1000, 1000], riggedRandom(THREE_HANDS, ACES_BOARD));
    engine.deal();
    engine.act(0, { kind: 'raise', to: 100 }); engine.act(1, { kind: 'call' }); engine.act(2, { kind: 'call' });
    engine.act(1, { kind: 'raise', to: 200 }); engine.act(2, { kind: 'call' });
    expect(engine.view(0).pots.map((pot) => [pot.amount, [...pot.eligibleSeats].sort()]))
      .toEqual([[300, [0, 1, 2]], [400, [1, 2]]]);
    finish(engine);
    const view = engine.view(0);
    expect(view.street).toBe('showdown');
    expect(view.seats.every((seat) => seat.player?.cards.kind === 'shown')).toBe(true);
    expect(view.winners.map((winner) => [winner.seat, winner.amount])).toEqual([[0, 300], [1, 400]]);
    expect(view.pots).toEqual([]);
    expect(view.seats.map((seat) => seat.player?.bet)).toEqual([0, 0, 0]);
  });

  test('dealing again carries stacks and rotates the button', () => {
    const engine = fixture();
    engine.deal(); engine.act(0, { kind: 'fold' }); engine.deal();
    expect(engine.view(0)).toMatchObject({ handStatus: 'playing', buttonSeat: 1, smallBlindSeat: 1, bigBlindSeat: 0, winners: [] });
    expect(engine.view(0).seats.map((seat) => seat.player?.stack)).toEqual([985, 1000]);
  });

  test('an odd chip in a tied pot goes to the first eligible seat left of the button', () => {
    const engine = fixture([100, 100, 100], riggedRandom(
      [['2h', '3h'], ['4h', '5h'], ['6h', '7h']], ['Ts', 'Js', 'Qs', 'Ks', 'As'],
    ));
    engine.deal();
    engine.act(0, { kind: 'raise', to: 25 }); engine.act(1, { kind: 'call' }); engine.act(2, { kind: 'call' });
    engine.act(1, { kind: 'check' }); engine.act(2, { kind: 'fold' }); engine.act(0, { kind: 'check' });
    finish(engine);
    expect(engine.view(0).winners.map((winner) => [winner.seat, winner.amount])).toEqual([[0, 37], [1, 38]]);
    expect(engine.view(0).seats.map((seat) => seat.player?.stack)).toEqual([112, 113, 75]);
    expect(engine.view(0).seats[2]?.player?.cards.kind).toBe('none');
  });

  test('folding forfeits every earlier pot and one winner gets one aggregate award', () => {
    const engine = fixture([100, 1000, 1000], riggedRandom(
      [['2h', '2d'], ['As', 'Ah'], ['Kc', 'Kd']], ['3c', '4c', '7s', '9h', 'Jd'],
    ));
    engine.deal();
    engine.act(0, { kind: 'raise', to: 100 }); engine.act(1, { kind: 'call' }); engine.act(2, { kind: 'call' });
    engine.act(1, { kind: 'raise', to: 200 }); engine.act(2, { kind: 'call' });
    engine.act(1, { kind: 'check' }); engine.act(2, { kind: 'raise', to: 100 }); engine.act(1, { kind: 'fold' });
    finish(engine);
    expect(engine.view(0).seats.map((seat) => seat.player?.stack)).toEqual([0, 700, 1400]);
    expect(engine.view(0).winners).toHaveLength(1);
    expect(engine.view(0).winners[0]).toMatchObject({ seat: 2, amount: 700 });
  });

  test('a short posted big blind does not lower the engine bring-in', () => {
    const engine = fixture([1000, 1000, 7]);
    engine.deal();
    expect(engine.view(0).currentBet).toBe(10);
    expect(engine.view(0).legalActions?.callAmount).toBe(10);
    engine.act(0, { kind: 'call' }); engine.act(1, { kind: 'call' });
    expect(engine.view(0).pots.map((pot) => pot.amount)).toEqual([21, 6]);
    finish(engine);
  });
});
