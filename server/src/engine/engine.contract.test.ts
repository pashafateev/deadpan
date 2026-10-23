import { describe, expect, test } from 'vitest';
import { ActionType as A, PokerEngine, Street } from '@pokertools/engine';
import { ACES_BOARD, THREE_HANDS, assertConserved, finishRaw, rawEngine, riggedRandom, seededRandom } from './test-fixtures';

const pots = (engine: PokerEngine) => engine.state.pots.map((pot) => [pot.amount, [...pot.eligibleSeats].sort()]);
const stacks = (engine: PokerEngine) => engine.state.players.map((player) => player?.stack);
const act = (engine: PokerEngine, seat: number, type: A.CALL | A.CHECK | A.FOLD) =>
  engine.act({ type, playerId: `p${seat}` });
const raise = (engine: PokerEngine, seat: number, amount: number) =>
  engine.act({ type: A.RAISE, playerId: `p${seat}`, amount });

describe('@pokertools/engine 2.1.0 rules and recovery contract', () => {
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
