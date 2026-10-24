import {
  HAND_STATUSES, PLAYER_STATUSES, REQUEST_ERROR_CODES, STREETS, type HoleCards, type PreAction,
} from '@deadpan/shared';
import { describe, expect, test } from 'vitest';
import { makeSnapshot } from '../playground/mocks';
import { readServerMessage } from './messages';

describe('readServerMessage', () => {
  test('accepts timed, untimed, and terminal snapshot shapes without deriving game state', () => {
    for (const scenario of ['my-turn', 'waiting', 'all-in', 'showdown', 'not-seated'] as const) {
      const snapshot = makeSnapshot(scenario, 9, 1, 1000);
      const message = { kind: 'snapshot', snapshot };
      expect(readServerMessage(JSON.stringify(message))).toStrictEqual(message);
      if (snapshot.turn) snapshot.turn.clock = null;
      expect(readServerMessage(JSON.stringify(message))).toStrictEqual(message);
    }
  });

  test.each(HAND_STATUSES)('accepts the shared hand status %s', (handStatus) => {
    const snapshot = { ...makeSnapshot('my-turn', 2, 1, 1000), handStatus };
    const message = { kind: 'snapshot', snapshot };
    expect(readServerMessage(JSON.stringify(message))).toStrictEqual(message);
  });

  test.each([null, ...STREETS])('accepts the shared street %s', (street) => {
    const snapshot = { ...makeSnapshot('my-turn', 2, 1, 1000), street };
    const message = { kind: 'snapshot', snapshot };
    expect(readServerMessage(JSON.stringify(message))).toStrictEqual(message);
  });

  test.each(PLAYER_STATUSES)('accepts the shared player status %s', (status) => {
    const snapshot = makeSnapshot('my-turn', 2, 1, 1000);
    snapshot.seats[snapshot.mySeat!]!.player!.status = status;
    const message = { kind: 'snapshot', snapshot };
    expect(readServerMessage(JSON.stringify(message))).toStrictEqual(message);
  });

  test('strips unknown fields from every nested object without losing supported snapshot fields', () => {
    const snapshot = makeSnapshot('my-turn', 6, 1, 1000);
    snapshot.preAction = { kind: 'call', amount: 60 };
    snapshot.winners = [{ seat: 4, amount: 180, handLabel: 'A hand', bestCards: snapshot.board }];
    const message = { kind: 'snapshot', snapshot, replyTo: 7 };
    const wire = JSON.stringify(message, (_key, value: unknown) =>
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? { ...value, privateEngineState: 'not for the UI' }
        : value,
    );
    expect(readServerMessage(wire)).toStrictEqual(message);
  });

  test.each([
    { kind: 'none' },
    { kind: 'hidden' },
    { kind: 'shown', cards: [{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 'd' }] },
  ] satisfies HoleCards[])('copies only the fields allowed by hole card variant %j', (cards) => {
    const snapshot = makeSnapshot('my-turn', 2, 1, 1000);
    snapshot.seats[snapshot.mySeat!]!.player!.cards = cards;
    const message = { kind: 'snapshot', snapshot };
    const wire = JSON.stringify(message, (_key, value: unknown) =>
      typeof value === 'object' && value !== null && 'kind' in value &&
        (value.kind === 'none' || value.kind === 'hidden')
        ? { ...value, cards: [{ rank: 'Q', suit: 's' }, { rank: 'J', suit: 's' }] }
        : value,
    );
    expect(readServerMessage(wire)).toStrictEqual(message);
  });

  test.each([
    null, { kind: 'check-fold' }, { kind: 'check' }, { kind: 'call-any' }, { kind: 'call', amount: 60 },
  ] satisfies (PreAction | null)[])('copies only the fields allowed by pre-action variant %j', (preAction) => {
    const snapshot = { ...makeSnapshot('my-turn', 2, 1, 1000), preAction };
    const message = { kind: 'snapshot', snapshot };
    const wire = JSON.stringify({
      ...message,
      snapshot: {
        ...snapshot,
        preAction: preAction === null ? null : { amount: 999, ...preAction, privateEngineState: 'secret' },
      },
    });
    expect(readServerMessage(wire)).toStrictEqual(message);
  });

  test('preserves a between-hands view and nullable raise limits', () => {
    const snapshot = makeSnapshot('my-turn', 2, 1, 1000);
    snapshot.legalActions!.minRaiseTo = null;
    snapshot.legalActions!.maxRaiseTo = null;
    const message = { kind: 'snapshot', snapshot };
    expect(readServerMessage(JSON.stringify(message))).toStrictEqual(message);
    snapshot.handStatus = 'waiting';
    snapshot.street = null;
    snapshot.turn = null;
    snapshot.legalActions = null;
    snapshot.buttonSeat = snapshot.smallBlindSeat = snapshot.bigBlindSeat = null;
    expect(readServerMessage(JSON.stringify(message))).toStrictEqual(message);
  });

  test('accepts bounded server errors as text, not executable markup', () => {
    const message = { kind: 'error', code: 'illegal-action', message: 'Cannot raise < 20 & keep the same turn.' };
    expect(readServerMessage(JSON.stringify(message))).toEqual(message);
  });

  test.each(REQUEST_ERROR_CODES)('accepts the shared request error %s', (code) => {
    const message = { kind: 'error', code, message: 'Request rejected' };
    expect(readServerMessage(JSON.stringify(message))).toStrictEqual(message);
  });

  test.each([1, 2, Number.MAX_SAFE_INTEGER])('copies the optional replyTo %s for both response kinds', (replyTo) => {
    for (const message of [
      { kind: 'snapshot', snapshot: makeSnapshot('my-turn', 2, 1, 1000), replyTo },
      { kind: 'error', code: 'stale-state', message: 'Try again', replyTo },
    ]) {
      expect(readServerMessage(JSON.stringify(message))).toStrictEqual(message);
    }
  });

  test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, null, '1', true, {}, []].map((replyTo) => ({ replyTo })))(
    'rejects an invalid replyTo $replyTo for both response kinds',
    ({ replyTo }) => {
      for (const message of [
        { kind: 'snapshot', snapshot: makeSnapshot('my-turn', 2, 1, 1000), replyTo },
        { kind: 'error', code: 'stale-state', message: 'Try again', replyTo },
      ]) {
        expect(readServerMessage(JSON.stringify(message))).toBeNull();
      }
    },
  );

  test.each(['unknown-error', '', '__proto__'])('rejects the unknown request error %j', (code) => {
    expect(readServerMessage(JSON.stringify({ kind: 'error', code, message: 'Unknown' }))).toBeNull();
  });

  test.each([
    { seats: [null] },
    { seats: [{ index: 0, player: { id: 'bad' } }] },
    { maxSeats: 0 },
    { mySeat: 10 },
    { handStatus: 'unknown' },
    { street: 'unknown' },
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
