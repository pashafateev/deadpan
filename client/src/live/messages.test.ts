import { describe, expect, test } from 'vitest';
import { makeSnapshot } from '../playground/mocks';
import { readServerMessage } from './messages';

describe('readServerMessage', () => {
  test('accepts timed, untimed, and terminal snapshot shapes without deriving game state', () => {
    for (const scenario of ['my-turn', 'waiting', 'all-in', 'showdown', 'not-seated'] as const) {
      const snapshot = makeSnapshot(scenario, 9, 1, 1000);
      const message = { kind: 'snapshot', snapshot };
      expect(readServerMessage(JSON.stringify(message))).toEqual(message);
      if (snapshot.turn) snapshot.turn.clock = null;
      expect(readServerMessage(JSON.stringify(message))).toEqual(message);
    }
  });

  test('accepts bounded server errors as text, not executable markup', () => {
    const message = { kind: 'error', code: 'illegal-action', message: 'Cannot raise < 20 & keep the same turn.' };
    expect(readServerMessage(JSON.stringify(message))).toEqual(message);
  });

  test.each([
    { seats: [null] },
    { seats: [{ index: 0, player: { id: 'bad' } }] },
    { maxSeats: 0 },
    { mySeat: 10 },
    { handStatus: 'unknown' },
    { board: [{ rank: 'X', suit: 'h' }] },
    { pots: [{ amount: -1, eligibleSeats: [0] }] },
    { currentBet: 1.5 },
    { turn: { seat: 15, clock: null } },
    { legalActions: { canFold: true } },
    { preActionsEnabled: 'false' },
    { preAction: { kind: 'call', amount: -1 } },
    { winners: [{ seat: 0, amount: 50, handLabel: 'Winner', bestCards: [null] }] },
  ])('rejects malformed snapshot fields before rendering: %j', (patch) => {
    const message = { kind: 'snapshot', snapshot: { ...makeSnapshot('my-turn', 2, 1, 1000), ...patch } };
    expect(readServerMessage(JSON.stringify(message))).toBeNull();
  });

  test('rejects nontext frames and unbounded or nontext errors', () => {
    expect(readServerMessage(new Uint8Array([1, 2]))).toBeNull();
    expect(readServerMessage(JSON.stringify({ kind: 'error', code: 'internal-error', message: 'x'.repeat(513) }))).toBeNull();
    expect(readServerMessage(JSON.stringify({ kind: 'error', code: 'internal-error', message: null }))).toBeNull();
  });
});
