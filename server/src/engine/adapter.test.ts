import { describe, expect, test, vi } from 'vitest';
import { ActionType as A, PokerEngine } from '@pokertools/engine';
import type { GameState } from '@pokertools/engine';
import { EngineAdapter } from './adapter';
import { ACES_BOARD, THREE_HANDS, reachableStates, riggedRandom, seededRandom } from './test-fixtures';

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
const jsonView = (engine: EngineAdapter, viewer: number | null) =>
  JSON.parse(JSON.stringify(engine.view(viewer))) as ReturnType<EngineAdapter['view']>;

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

  test.each(['preflop raise', 'postflop opening bet'])('rejects over-stack and unsafe totals before a %s mutates state', (stage) => {
    const engine = fixture();
    engine.deal();
    if (stage === 'postflop opening bet') {
      engine.act(0, { kind: 'call' });
      engine.act(1, { kind: 'check' });
    }
    const seat = engine.view(null).turn!.seat;
    const max = engine.view(seat).legalActions!.maxRaiseTo!;
    const before = [0, 1, null].map((viewer) => jsonView(engine, viewer));
    for (const to of [max + 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -1, 1.5]) {
      expect(() => engine.act(seat, { kind: 'raise', to })).toThrowError(
        expect.objectContaining({ code: 'illegal-action' }),
      );
      expect([0, 1, null].map((viewer) => jsonView(engine, viewer))).toEqual(before);
    }
    // The maximum includes previously posted chips, not just the remaining stack.
    engine.act(seat, { kind: 'raise', to: max });
    expect(engine.view(seat).seats[seat]?.player).toMatchObject({ stack: 0, bet: max, status: 'all-in' });
  });

  test.each(['preflop raise', 'postflop opening bet'])('still accepts a short all-in %s', (stage) => {
    const engine = fixture([100, 15]);
    engine.deal();
    engine.act(0, { kind: 'call' });
    if (stage === 'postflop opening bet') engine.act(1, { kind: 'check' });
    const to = stage === 'preflop raise' ? 15 : 5;
    expect(engine.view(1).legalActions).toMatchObject({ minRaiseTo: to, maxRaiseTo: to });
    engine.act(1, { kind: 'raise', to });
    expect(engine.view(1).seats[1]?.player).toMatchObject({ stack: 0, status: 'all-in' });
    engine.act(0, { kind: 'call' });
    expect(engine.view(null).handStatus).toBe('complete');
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

  test.each([
    { hands: [['As', 'Ah'], ['Kc', 'Kd']], stacks: [130, 0], statuses: ['active', 'sitting-out'] },
    { hands: [['Kc', 'Kd'], ['As', 'Ah']], stacks: [70, 60], statuses: ['active', 'active'] },
  ])('settled covered/short all-ins use chip-based statuses: $stacks', ({ hands, stacks, statuses }) => {
    const engine = fixture([100, 30], riggedRandom(hands, ACES_BOARD));
    engine.deal();
    engine.act(0, { kind: 'raise', to: 100 });
    expect(engine.view(0).seats[0]?.player?.status).toBe('all-in');
    engine.act(1, { kind: 'call' });
    const view = jsonView(engine, null);
    expect(view.handStatus).toBe('complete');
    expect(view.seats.map((seat) => seat.player?.stack)).toEqual(stacks);
    expect(view.seats.map((seat) => seat.player?.status)).toEqual(statuses);
    expect(view.seats.map((seat) => seat.player?.bet)).toEqual([0, 0]);
  });

  test('an all-in fold winner becomes active while a funded folder stays folded', () => {
    const engine = fixture();
    engine.deal();
    engine.act(0, { kind: 'raise', to: 1000 });
    engine.act(1, { kind: 'fold' });
    expect(engine.view(null).seats.map((seat) => [seat.player?.stack, seat.player?.status]))
      .toEqual([[1010, 'active'], [990, 'folded']]);
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

  test('JSON views retain only the folder’s own cards after a fold win', () => {
    const engine = fixture([1000, 1000], riggedRandom([['As', 'Ah'], ['Kc', 'Kd']], ACES_BOARD));
    engine.deal();
    const ownCards = jsonView(engine, 1).seats[1]?.player?.cards;
    engine.act(0, { kind: 'raise', to: 100 });
    engine.act(1, { kind: 'fold' });
    expect(jsonView(engine, 1).seats[1]?.player).toMatchObject({ status: 'folded', cards: ownCards });
    for (const viewer of [0, null]) {
      const view = jsonView(engine, viewer);
      expect(view.seats[1]?.player?.cards).toEqual({ kind: 'none' });
      expect(JSON.stringify(view)).not.toContain('"rank":"K"');
    }
    expect(jsonView(engine, 1).seats[0]?.player?.cards).toEqual({ kind: 'hidden' });
    expect(jsonView(engine, null).seats[0]?.player?.cards).toEqual({ kind: 'hidden' });
    expect(jsonView(engine, null).winners[0]?.bestCards).toEqual([]);
  });

  test('JSON views keep own folded cards private during play and a later contested showdown', () => {
    const engine = fixture([1000, 1000, 1000], riggedRandom(THREE_HANDS, ACES_BOARD));
    engine.deal();
    const ownCards = jsonView(engine, 0).seats[0]?.player?.cards;
    engine.act(0, { kind: 'fold' });
    const assertFoldPrivacy = () => {
      expect(jsonView(engine, 0).seats[0]?.player).toMatchObject({ status: 'folded', cards: ownCards });
      for (const viewer of [1, 2, null]) {
        const view = jsonView(engine, viewer);
        expect(view.seats[0]?.player?.cards).toEqual({ kind: 'none' });
        for (const suit of ['s', 'h']) expect(JSON.stringify(view)).not.toContain(`"rank":"A","suit":"${suit}"`);
      }
    };
    assertFoldPrivacy();
    expect(jsonView(engine, 0).seats[1]?.player?.cards).toEqual({ kind: 'hidden' });
    finish(engine);
    assertFoldPrivacy();
    expect(jsonView(engine, null).street).toBe('showdown');
    expect(jsonView(engine, null).seats.slice(1).every((seat) => seat.player?.cards.kind === 'shown')).toBe(true);
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

  test('60 deterministic hands retain only the current hand graph and preserve engine behavior', () => {
    const engine = fixture([10000, 10000], seededRandom(73));
    const control = new PokerEngine({
      smallBlind: 5, bigBlind: 10, maxPlayers: 2, randomProvider: seededRandom(73), validateIntegrity: true, rakePercent: 0,
    });
    players([10000, 10000]).forEach((player) => control.sit(player.seat, player.id, player.name, player.stack));
    // Observe only the public getter; the adapter does not expose private state.
    const reads = vi.spyOn(PokerEngine.prototype, 'state', 'get');
    const dealtCards = new Set<string>();
    try {
      for (let hand = 1; hand <= 60; hand++) {
        expect(control.validate({ type: A.DEAL }).valid).toBe(true);
        control.deal();
        engine.deal();
        let actions = 0;
        const assertCurrentHand = () => {
          const reference = control.state;
          const view = engine.view(null);
          const state = reads.mock.results.at(-1)!.value as GameState;
          reads.mockClear(); // Do not let the observation itself retain old graphs.
          const reachable = reachableStates(state);
          expect(reachable).toHaveLength(actions + 1);
          expect([...new Set(reachable.map((past) => past.handNumber))]).toEqual([hand]);
          expect(view.buttonSeat).toBe((hand - 1) % 2);
          expect(view.buttonSeat).toBe(reference.buttonSeat);
          expect(view.turn?.seat ?? null).toBe(reference.actionTo);
          expect(view.seats.map((seat) => seat.player?.stack)).toEqual(reference.players.map((player) => player?.stack));
          expect(view.board.map((card) => card.rank + card.suit)).toEqual(reference.board);
          for (const seat of [0, 1]) {
            const cards = engine.view(seat).seats[seat]?.player?.cards;
            expect(cards?.kind).toBe('shown');
            if (cards?.kind === 'shown') expect(cards.cards.map((card) => card.rank + card.suit)).toEqual(reference.players[seat]?.hand);
          }
          reads.mockClear();
          return view;
        };
        let view = assertCurrentHand();
        dealtCards.add(JSON.stringify(engine.view(0).seats[0]?.player?.cards));
        while (view.handStatus === 'playing') {
          expect(actions).toBeLessThan(20);
          const seat = view.turn!.seat;
          const legal = engine.view(seat).legalActions!;
          const kind = hand % 2 === 0 ? 'fold' : legal.canCheck ? 'check' : 'call';
          control.act({ type: kind === 'fold' ? A.FOLD : kind === 'check' ? A.CHECK : A.CALL, playerId: `p${seat}` });
          engine.act(seat, { kind });
          actions++;
          view = assertCurrentHand();
        }
      }
      expect(dealtCards.size).toBeGreaterThan(1);
    } finally {
      reads.mockRestore();
    }
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
