import type { TableSnapshot, TableTurn } from '@deadpan/shared';
import { describe, expect, test } from 'vitest';
import { makeSnapshot, SCENARIOS } from '../playground/mocks';
import { seatStatusLabel, tableControls, turnForSeat } from './display';

const myTurn = () => makeSnapshot('my-turn', 6, 1, 1000);

describe('seat status labels', () => {
  test('an offline acting seat shows its connection status without losing the turn highlight', () => {
    expect(seatStatusLabel('disconnected', true)).toBe('Offline');
  });

  test.each([
    ['active', true, 'To act'],
    ['active', false, null],
    ['folded', false, null],
    ['all-in', false, 'All in'],
    ['sitting-out', false, 'Sitting out'],
    ['disconnected', false, 'Offline'],
  ] as const)('labels %s (acting=%s) as %s', (status, acting, label) => {
    expect(seatStatusLabel(status, acting)).toBe(label);
  });
});

describe('turnForSeat', () => {
  test('identifies an untimed acting seat without inventing a clock', () => {
    const snapshot = myTurn();
    snapshot.turn = { seat: snapshot.mySeat!, clock: null };
    expect(turnForSeat(snapshot, snapshot.mySeat!)).toEqual({ seat: snapshot.mySeat, clock: null });
    expect(turnForSeat(snapshot, 0)).toBeNull();
  });

  test('keeps the playground countdown attached to the acting seat', () => {
    const snapshot = myTurn();
    expect(turnForSeat(snapshot, snapshot.mySeat!)).toEqual({
      seat: snapshot.mySeat,
      clock: { startedAt: 1000, durationMs: 20_000, timeBankMs: 30_000 },
    });
  });

  test.each(['waiting', 'complete'] as const)('does not highlight a turn in a %s hand', (handStatus) => {
    const snapshot = { ...myTurn(), handStatus };
    expect(turnForSeat(snapshot, snapshot.mySeat!)).toBeNull();
  });
});

describe('tableControls', () => {
  test('offers actions only for the acting viewer in an active hand, timed or untimed', () => {
    const snapshot = myTurn();
    expect(tableControls(snapshot)).toBe('actions');
    snapshot.turn = { seat: snapshot.mySeat!, clock: null };
    expect(tableControls(snapshot)).toBe('actions');
    snapshot.turn = { seat: 0, clock: null };
    expect(tableControls(snapshot)).toBe('pre-actions');
    snapshot.turn = null;
    expect(tableControls(snapshot)).toBeNull();
  });

  test.each(['waiting', 'complete'] as const)('never offers betting or pre-actions in a %s hand', (handStatus) => {
    const snapshot: TableSnapshot = { ...myTurn(), handStatus };
    expect(tableControls(snapshot)).toBeNull();
    snapshot.legalActions = null;
    expect(tableControls(snapshot)).toBeNull();
  });

  test('keeps pre-actions in timed playground waiting views, but not live waiting views', () => {
    const snapshot = makeSnapshot('waiting', 2, 1, 1000);
    expect(tableControls(snapshot)).toBe('pre-actions');
    snapshot.preActionsEnabled = false;
    expect(tableControls(snapshot)).toBeNull();
  });

  test('does not offer pre-actions to the actor when legal actions are absent', () => {
    const snapshot = { ...myTurn(), legalActions: null };
    expect(tableControls(snapshot)).toBeNull();
  });

  test('does not offer controls to spectators, folded players, or all-in players', () => {
    const snapshot = myTurn();
    expect(tableControls({ ...snapshot, mySeat: null })).toBeNull();
    for (const status of ['folded', 'all-in', 'sitting-out', 'disconnected'] as const) {
      snapshot.seats[snapshot.mySeat!]!.player!.status = status;
      expect(tableControls(snapshot)).toBeNull();
    }
    snapshot.seats[snapshot.mySeat!]!.player = null;
    expect(tableControls(snapshot)).toBeNull();
  });

  test('pre-actions are absent outside betting streets', () => {
    const snapshot = makeSnapshot('waiting', 2, 1, 1000);
    expect(tableControls({ ...snapshot, street: null })).toBeNull();
    expect(tableControls({ ...snapshot, street: 'showdown' })).toBeNull();
  });
});

describe('playground snapshot migration', () => {
  test.each([2, 6, 9])('preserves all scenarios with %i players', (count) => {
    for (const scenario of Object.keys(SCENARIOS) as (keyof typeof SCENARIOS)[]) {
      const snapshot = makeSnapshot(scenario, count, 7, 2000);
      expect(snapshot.handStatus).toBe(scenario === 'showdown' ? 'complete' : 'playing');
      expect(snapshot.preActionsEnabled).toBe(true);
      expect(snapshot.seq).toBe(7);
      if (snapshot.turn) {
        expect(snapshot.turn).toEqual({
          seat: expect.any(Number),
          clock: { startedAt: 2000, durationMs: 20_000, timeBankMs: 30_000 },
        } satisfies TableTurn);
      }
      const expected = scenario === 'my-turn' ? 'actions' : scenario === 'waiting' ? 'pre-actions' : null;
      expect(tableControls(snapshot)).toBe(expected);
    }
  });
});
