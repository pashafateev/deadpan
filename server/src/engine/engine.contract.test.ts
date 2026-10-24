import { describe, expect, test } from 'vitest';
import { ActionType as A, PokerEngine, Street } from '@pokertools/engine';
import type { Action, Snapshot } from '@pokertools/engine';
import type { PlayerAction } from '@deadpan/shared';
import { EngineAdapter } from './adapter';
import { ACES_BOARD, THREE_HANDS, assertConserved, finishRaw, rawEngine, reachableStates, riggedRandom, seededRandom } from './test-fixtures';

const pots = (engine: PokerEngine) => engine.state.pots.map((pot) => [pot.amount, [...pot.eligibleSeats].sort()]);
const stacks = (engine: PokerEngine) => engine.state.players.map((player) => player?.stack);
const act = (engine: PokerEngine, seat: number, type: A.CALL | A.CHECK | A.FOLD) =>
  engine.act({ type, playerId: `p${seat}` });
const raise = (engine: PokerEngine, seat: number, amount: number) =>
  engine.act({ type: A.RAISE, playerId: `p${seat}`, amount });

/** Exercise the adapter against a separate engine using only public APIs. */
function contractTable(stacks: number[], seats = stacks.map((_, seat) => seat)) {
  const config = { smallBlind: 5, bigBlind: 10, maxPlayers: Math.max(2, ...seats.map((seat) => seat + 1)), validateIntegrity: true, rakePercent: 0 };
  const engine = new PokerEngine({ ...config, randomProvider: seededRandom() });
  const players = stacks.map((stack, index) => ({ seat: seats[index]!, id: `p${seats[index]}`, name: `Player ${seats[index]}`, stack }));
  players.forEach((player) => engine.sit(player.seat, player.id, player.name, player.stack));
  const adapter = new EngineAdapter(players, { maxSeats: config.maxPlayers, randomProvider: seededRandom() });
  expect(engine.validate({ type: A.DEAL }).valid).toBe(true);
  const dealPreview = engine.optimisticAct({ type: A.DEAL });
  engine.deal();
  adapter.deal();
  return {
    engine, adapter, dealPreview,
    act(seat: number, action: PlayerAction, raiseType: A.BET | A.RAISE = A.RAISE) {
      const request: Action = action.kind === 'raise'
        ? { type: raiseType, playerId: `p${seat}`, amount: action.to }
        : { type: action.kind === 'call' ? A.CALL : action.kind === 'check' ? A.CHECK : A.FOLD, playerId: `p${seat}` };
      expect(engine.validate(request).valid).toBe(true);
      engine.act(request);
      adapter.act(seat, action);
    },
  };
}

function expectWager(table: ReturnType<typeof contractTable>, currentBet: number, callAmount: number) {
  const { engine, adapter } = table;
  const state = engine.state;
  const seat = state.actionTo!;
  const player = state.players[seat]!;
  const view = adapter.view(seat);
  const legal = view.legalActions!;
  expect(view.currentBet).toBe(currentBet);
  expect(view.turn?.seat).toBe(seat);
  expect(legal.callAmount).toBe(callAmount);
  expect(legal.canCheck).toBe(engine.validate({ type: A.CHECK, playerId: player.id }).valid);
  const call = { type: A.CALL, playerId: player.id } as const;
  expect(engine.validate(call).valid).toBe(callAmount > 0);
  if (callAmount > 0) {
    const preview = engine.optimisticAct({ ...call, timestamp: state.timestamp });
    const record = preview.actionHistory.findLast((entry) => entry.seat === seat && entry.action.type === A.CALL);
    expect(record?.action).toMatchObject({ type: A.CALL, amount: callAmount });
    // Uncapped calls directly establish the public street total to match.
    if (callAmount < player.stack) expect(player.betThisStreet + callAmount).toBe(currentBet);
  }
  if (legal.minRaiseTo !== null) {
    const type = currentBet === 0 ? A.BET : A.RAISE;
    expect(engine.validate({ type, playerId: player.id, amount: legal.minRaiseTo }).valid).toBe(true);
    expect(engine.validate({ type, playerId: player.id, amount: legal.minRaiseTo - 1 }).valid).toBe(false);
    expect(legal.maxRaiseTo).toBe(player.stack + player.betThisStreet);
    expect(engine.validate({ type, playerId: player.id, amount: legal.maxRaiseTo! }).valid).toBe(true);
  } else {
    expect(engine.validate({ type: A.RAISE, playerId: player.id, amount: player.stack + player.betThisStreet }).valid).toBe(false);
  }
}

describe('@pokertools/engine 2.1.0 rules and recovery contract', () => {
  test.each([A.RAISE, A.BET] as const)('the library accepts and clamps an over-stack %s; the adapter must reject instead', (type) => {
    const engine = rawEngine([1000, 1000]);
    if (type === A.BET) { act(engine, 0, A.CALL); act(engine, 1, A.CHECK); }
    const seat = engine.state.actionTo!;
    const player = engine.state.players[seat]!;
    const request = { type, playerId: player.id, amount: player.stack + player.betThisStreet + 1 } as const;
    expect(engine.validate(request).valid).toBe(true);
    const preview = engine.optimisticAct(request);
    expect(preview.players[seat]).toMatchObject({ stack: 0, betThisStreet: player.stack + player.betThisStreet });
    expect(engine.state.players[seat]?.stack).toBe(player.stack);
  });

  test.each([
    { stacks: [1000, 1000, 1000], bets: [[1, 5], [2, 10]] },
    { stacks: [1000, 3, 1000], bets: [[1, 3], [2, 10]] },
    { stacks: [1000, 1000, 7], bets: [[1, 5], [2, 7]] },
    { stacks: [1000, 3, 7], bets: [[1, 3], [2, 7]] },
  ])('pins full bring-in and posted positions with full/short blinds: $stacks', ({ stacks, bets }) => {
    const table = contractTable(stacks);
    expect([...table.dealPreview.currentBets]).toEqual(bets);
    expect([...table.engine.state.currentBets]).toEqual(bets);
    expect(table.adapter.view(null)).toMatchObject({ buttonSeat: 0, smallBlindSeat: 1, bigBlindSeat: 2 });
    expect(table.engine.state).toMatchObject({ minRaise: 20, lastRaiseAmount: 10 });
    expectWager(table, 10, 10);
  });

  test('pins heads-up blind totals and full raise-to semantics', () => {
    const table = contractTable([1000, 1000]);
    expect([...table.dealPreview.currentBets]).toEqual([[0, 5], [1, 10]]);
    expect(table.adapter.view(null)).toMatchObject({ buttonSeat: 0, smallBlindSeat: 0, bigBlindSeat: 1 });
    expectWager(table, 10, 5);
    table.act(0, { kind: 'raise', to: 60 });
    expect(table.engine.state).toMatchObject({ minRaise: 110, lastRaiseAmount: 50 });
    expectWager(table, 60, 50);
    table.act(1, { kind: 'raise', to: 160 });
    expect(table.engine.state).toMatchObject({ minRaise: 260, lastRaiseAmount: 100 });
    expectWager(table, 160, 100);
    table.act(0, { kind: 'call' });
    expect(table.engine.state.street).toBe(Street.FLOP);
    expectWager(table, 0, 0);
  });

  test('pins opening bets, subsequent raises, and empty-bet resets on every street', () => {
    const table = contractTable([1000, 1000]);
    table.act(0, { kind: 'call' }); table.act(1, { kind: 'check' });
    for (const street of [Street.FLOP, Street.TURN, Street.RIVER]) {
      expect(table.engine.state).toMatchObject({ street, minRaise: 10, lastRaiseAmount: 10 });
      expect(table.engine.state.currentBets.size).toBe(0);
      expectWager(table, 0, 0);
      expect(table.engine.validate({ type: A.RAISE, playerId: 'p1', amount: 10 }).valid).toBe(false);
      table.act(1, { kind: 'raise', to: 30 }, A.BET);
      expect(table.engine.state).toMatchObject({ minRaise: 60, lastRaiseAmount: 30 });
      expectWager(table, 30, 30);
      table.act(0, { kind: 'raise', to: 80 });
      expect(table.engine.state).toMatchObject({ minRaise: 130, lastRaiseAmount: 50 });
      expectWager(table, 80, 50);
      table.act(1, { kind: 'call' });
    }
    expect(table.adapter.view(null)).toMatchObject({ handStatus: 'complete', currentBet: 0, turn: null });
  });

  test('pins a short opening bet below the big blind against a public call preview', () => {
    const table = contractTable([100, 15]);
    table.act(0, { kind: 'call' }); table.act(1, { kind: 'check' });
    expectWager(table, 0, 0);
    expect(table.adapter.view(1).legalActions).toMatchObject({ minRaiseTo: 5, maxRaiseTo: 5 });
    table.act(1, { kind: 'raise', to: 5 }, A.BET);
    expect(table.engine.state).toMatchObject({ minRaise: 15, lastRaiseAmount: 10 });
    expectWager(table, 5, 5);
    table.act(0, { kind: 'call' });
    expect(table.adapter.view(null)).toMatchObject({ handStatus: 'complete', currentBet: 0 });
  });

  test('pins a single short raise without reopening and the unacted player exception', () => {
    const table = contractTable([1000, 1000, 150]);
    table.act(0, { kind: 'raise', to: 100 }); table.act(1, { kind: 'call' }); table.act(2, { kind: 'raise', to: 150 });
    expect(table.engine.state).toMatchObject({ minRaise: 240, lastRaiseAmount: 90 });
    expectWager(table, 150, 50);
    expect(table.adapter.view(0).legalActions?.minRaiseTo).toBeNull();

    const unacted = contractTable([150, 1000, 1000, 1000]);
    unacted.act(3, { kind: 'raise', to: 100 }); unacted.act(0, { kind: 'raise', to: 150 });
    expect(unacted.engine.state).toMatchObject({ minRaise: 240, lastRaiseAmount: 90 });
    expectWager(unacted, 150, 145);
    expect(unacted.adapter.view(1).legalActions?.minRaiseTo).toBe(240);
  });

  test('pins cumulative short raises reopening a prior actor without changing the increment', () => {
    const table = contractTable([180, 190, 1000, 1000, 150]);
    table.act(3, { kind: 'raise', to: 100 }); table.act(4, { kind: 'raise', to: 150 });
    table.act(0, { kind: 'raise', to: 180 }); table.act(1, { kind: 'raise', to: 190 }); table.act(2, { kind: 'call' });
    expect(table.engine.state).toMatchObject({ actionTo: 3, minRaise: 280, lastRaiseAmount: 90 });
    expectWager(table, 190, 90);
    expect(table.adapter.view(3).legalActions?.minRaiseTo).toBe(280);
  });

  test.each([
    { stacks: [1000, 1000], seats: [2, 7], bets: [[2, 5], [7, 10]], smallBlindSeat: 2, bigBlindSeat: 7, call: 5 },
    { stacks: [1000, 1000, 1000], seats: [0, 1, 5], bets: [[1, 5], [5, 10]], smallBlindSeat: 1, bigBlindSeat: 5, call: 10 },
    { stacks: [1000, 1000, 1000], seats: [0, 2, 5], bets: [[2, 10]], smallBlindSeat: null, bigBlindSeat: 2, call: 10 },
  ])('pins sparse-seat posted blinds (including a dead small blind): $seats', ({ stacks, seats, bets, smallBlindSeat, bigBlindSeat, call }) => {
    const table = contractTable(stacks, seats);
    expect([...table.dealPreview.currentBets]).toEqual(bets);
    expect(table.adapter.view(null)).toMatchObject({ smallBlindSeat, bigBlindSeat });
    expectWager(table, 10, call);
  });

  test.each([
    { stacks: [5, 10], seats: [0, 1] },
    { stacks: [3, 7], seats: [0, 1] },
    { stacks: [3, 7], seats: [2, 7] },
  ])('pins blind positions after an immediate all-in runout has cleared bets: $stacks at $seats', ({ stacks, seats }) => {
    const table = contractTable(stacks, seats);
    expect(table.dealPreview).toMatchObject({ street: Street.SHOWDOWN, actionTo: null });
    expect(table.dealPreview.currentBets.size).toBe(0);
    expect(table.dealPreview.board).toHaveLength(5);
    expect(table.adapter.view(null)).toMatchObject({
      handStatus: 'complete', street: 'showdown', currentBet: 0, buttonSeat: seats[0], smallBlindSeat: seats[0], bigBlindSeat: seats[1],
    });
  });

  test('snapshot/restore drops the reachable old graph while retaining RNG, current hand, and future deals', () => {
    const randomProvider = seededRandom(91);
    let engine = rawEngine([10000, 10000], randomProvider);
    const control = rawEngine([10000, 10000], seededRandom(91));
    const comparable = (snapshot: Snapshot) => JSON.parse(JSON.stringify({ ...snapshot, previousStates: [] }));
    for (let hand = 1; hand <= 30; hand++) {
      const snapshot = engine.snapshot;
      engine = PokerEngine.restore({ ...snapshot, previousStates: [] });
      expect(engine.snapshot).toEqual({ ...snapshot, previousStates: [] });
      expect(engine.state.config.randomProvider).toBe(randomProvider);
      expect(reachableStates(engine.state)).toHaveLength(1);
      expect(comparable(engine.snapshot)).toEqual(comparable(control.snapshot));
      for (let step = 0; engine.state.winners === null; step++) {
        expect(step).toBeLessThan(20);
        const playerId = engine.state.players[engine.state.actionTo!]!.id;
        const check = { type: A.CHECK, playerId } as const;
        const request = engine.validate(check).valid ? check : { type: A.CALL, playerId } as const;
        const timestamp = engine.state.timestamp + 1;
        engine.act({ ...request, timestamp }); control.act({ ...request, timestamp });
        expect(comparable(engine.snapshot)).toEqual(comparable(control.snapshot));
        assertConserved(engine);
      }
      const timestamp = engine.state.timestamp + 1;
      engine.act({ type: A.DEAL, timestamp }); control.act({ type: A.DEAL, timestamp });
    }
    // The raw root cap does not bound its recursively retained history.
    expect(control.state.previousStates.length).toBeLessThanOrEqual(50);
    expect(reachableStates(control.state).length).toBeGreaterThan(200);
    expect(reachableStates(engine.state).length).toBeLessThan(20);
  });

  test('short all-ins do not reopen raising and preserve the full-raise increment', () => {
    const engine = rawEngine([1000, 1000, 150]);
    raise(engine, 0, 100); act(engine, 1, A.CALL); raise(engine, 2, 150);
    expect(engine.state.actionTo).toBe(0);
    expect(engine.state.minRaise).toBe(240);
    const request = { type: A.RAISE, playerId: 'p0', amount: 240 } as const;
    const before = JSON.stringify(engine.snapshot);
    expect(engine.validate(request).valid).toBe(false);
    expect(() => engine.act(request)).toThrow();
    expect(JSON.stringify(engine.snapshot)).toBe(before);
    finishRaw(engine);
  });

  test('an unacted player can raise over a short all-in', () => {
    const engine = rawEngine([150, 1000, 1000, 1000]);
    raise(engine, 3, 100); raise(engine, 0, 150);
    expect(engine.validate({ type: A.RAISE, playerId: 'p1', amount: 240 }).valid).toBe(true);
    raise(engine, 1, 240);
    finishRaw(engine);
  });

  test('multiple short all-ins totaling a full raise reopen the prior actor', () => {
    const engine = rawEngine([180, 190, 1000, 1000, 150]);
    raise(engine, 3, 100); raise(engine, 4, 150); raise(engine, 0, 180);
    raise(engine, 1, 190); act(engine, 2, A.CALL);
    expect(engine.state.actionTo).toBe(3);
    expect(engine.validate({ type: A.RAISE, playerId: 'p3', amount: 280 }).valid).toBe(true);
    raise(engine, 3, 280);
    finishRaw(engine);
  });

  test('later wagers form a side pot without excluding the all-in main-pot winner', () => {
    const engine = rawEngine([100, 1000, 1000], riggedRandom(THREE_HANDS, ACES_BOARD));
    raise(engine, 0, 100); act(engine, 1, A.CALL); act(engine, 2, A.CALL);
    expect(pots(engine)).toEqual([[300, [0, 1, 2]]]);
    engine.act({ type: A.BET, playerId: 'p1', amount: 200 }); act(engine, 2, A.CALL);
    expect(pots(engine)).toEqual([[300, [0, 1, 2]], [400, [1, 2]]]);
    finishRaw(engine);
    expect(stacks(engine)).toEqual([300, 1100, 700]);
    expect(engine.state.winners?.map((winner) => [winner.seat, winner.amount]).sort((a, b) => a[0]! - b[0]!))
      .toEqual([[0, 300], [1, 400]]);
  });

  test('three unequal all-ins return unmatched chips and pay each eligible pot', () => {
    const engine = rawEngine([500, 100, 300], riggedRandom([THREE_HANDS[2]!, THREE_HANDS[0]!, THREE_HANDS[1]!], ACES_BOARD));
    raise(engine, 0, 500); act(engine, 1, A.CALL); act(engine, 2, A.CALL);
    finishRaw(engine);
    expect(stacks(engine)).toEqual([200, 300, 400]);
    expect(engine.state.board).toEqual(ACES_BOARD);
    expect(engine.state.winners?.reduce((sum, winner) => sum + winner.amount, 0)).toBe(700);
  });

  test('JSON restore preserves active unequal pots and subsequent cards/actions/payouts', () => {
    const engine = rawEngine([50, 100, 300, 300]);
    raise(engine, 3, 100); act(engine, 0, A.CALL); act(engine, 1, A.CALL); act(engine, 2, A.CALL);
    expect(engine.state.street).toBe(Street.FLOP);
    expect(pots(engine)).toEqual([[200, [0, 1, 2, 3]], [150, [1, 2, 3]]]);
    const restored = PokerEngine.restore(JSON.parse(JSON.stringify(engine.snapshot)));
    // JSON intentionally omits the test-only RNG function; undo history is not
    // part of the active-hand recovery contract.
    const comparable = (value: PokerEngine) => JSON.parse(JSON.stringify({ ...value.snapshot, previousStates: [] }));
    expect(comparable(restored)).toEqual(comparable(engine));
    for (let step = 0; engine.state.winners === null; step++) {
      expect(step).toBeLessThan(20);
      const seat = engine.state.actionTo!;
      const playerId = `p${seat}`;
      const check = { type: A.CHECK, playerId } as const;
      const request = step === 0 ? { type: A.BET, playerId, amount: 50 } as const
        : engine.validate(check).valid ? check : { type: A.CALL, playerId } as const;
      const timestamp = engine.state.timestamp + 1;
      engine.act({ ...request, timestamp }); restored.act({ ...request, timestamp });
      expect(comparable(restored)).toEqual(comparable(engine));
      assertConserved(engine); assertConserved(restored);
    }
  });

  test('repeatable generated hands finish and conserve integer chips across table sizes', () => {
    for (const count of [2, 3, 6, 9]) for (let seed = 1; seed <= 50; seed++) {
      const random = seededRandom(seed * 37 + count);
      const engine = rawEngine(Array.from({ length: count }, () => 20 + Math.floor(random() * 480)), seededRandom(seed));
      for (let step = 0; engine.state.winners === null; step++) {
        expect(step).toBeLessThan(300);
        const player = engine.state.players[engine.state.actionTo!]!;
        const candidates = [
          { type: A.CHECK, playerId: player.id } as const,
          { type: A.CALL, playerId: player.id } as const,
          { type: A.FOLD, playerId: player.id } as const,
          { type: A.RAISE, playerId: player.id, amount: engine.state.minRaise } as const,
          { type: A.BET, playerId: player.id, amount: player.stack } as const,
          { type: A.RAISE, playerId: player.id, amount: player.stack + player.betThisStreet } as const,
        ].filter((action) => engine.validate(action).valid);
        expect(candidates.length).toBeGreaterThan(0);
        engine.act(candidates[Math.floor(random() * candidates.length)]!);
        assertConserved(engine);
      }
    }
  });
});
