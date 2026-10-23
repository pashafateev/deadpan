import assert from 'node:assert/strict';
import { ActionType, PokerEngine, calculateTotalChips } from '@pokertools/engine';

export const CARDS = Array.from({ length: 52 }, (_, code) => '23456789TJQKA'[code >> 2]! + 'shdc'[code & 3]!);
export const ACES_BOARD = ['Ac', '2h', '7d', '9s', 'Js'];
export const THREE_HANDS = [['As', 'Ah'], ['Kc', 'Kd'], ['Qc', 'Qd']];

export function seededRandom(seed = 1): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}

/** Test-only shuffle control through the engine's supported RNG, never private fields. */
export function riggedRandom(hands: readonly (readonly string[])[], board: readonly string[]): () => number {
  const known = [...hands.flat(), ...board];
  assert.equal(board.length, 5);
  assert.equal(new Set(known).size, known.length);
  assert.ok(known.every((card) => CARDS.includes(card)));
  const burns = CARDS.filter((card) => !known.includes(card)).slice(0, 3);
  const prefix = [
    ...hands.map((hand) => hand[0]!), ...hands.map((hand) => hand[1]!),
    burns[0]!, ...board.slice(0, 3), burns[1]!, board[3]!, burns[2]!, board[4]!,
  ];
  const target = [...prefix, ...CARDS.filter((card) => !prefix.includes(card))].map((card) => CARDS.indexOf(card));
  const deck = Array.from({ length: 52 }, (_, index) => index);
  const values: number[] = [];
  for (let index = 51; index > 0; index--) {
    const swap = deck.indexOf(target[index]!);
    assert.ok(swap <= index);
    values.push((swap + 0.5) / (index + 1));
    [deck[index], deck[swap]] = [deck[swap]!, deck[index]!];
  }
  values.push(0.5); // The engine generates a hand ID after shuffling.
  let cursor = 0;
  return () => values[cursor++ % values.length]!;
}

export function rawEngine(stacks: number[], randomProvider = seededRandom()): PokerEngine {
  let time = 1_700_000_000_000;
  const engine = new PokerEngine({
    smallBlind: 5, bigBlind: 10, maxPlayers: Math.max(2, stacks.length),
    randomProvider, validateIntegrity: true, rakePercent: 0,
  }, () => ++time);
  stacks.forEach((stack, seat) => engine.sit(seat, `p${seat}`, `Player ${seat}`, stack));
  engine.deal();
  return engine;
}

export function assertConserved(engine: PokerEngine): void {
  const state = engine.state;
  const total = state.players.reduce((sum, player) => sum + (player?.stack ?? 0), 0)
    + state.pots.reduce((sum, pot) => sum + pot.amount, 0)
    + [...state.currentBets.values()].reduce((sum, bet) => sum + bet, 0)
    + state.rakeThisHand;
  assert.equal(total, state.initialChips);
  assert.equal(calculateTotalChips(state), state.initialChips);
}

export function finishRaw(engine: PokerEngine): void {
  for (let step = 0; engine.state.winners === null; step++) {
    assert.ok(step < 100, 'Hand must reach settlement');
    const seat = engine.state.actionTo;
    assert.notEqual(seat, null, 'A pending hand needs an actor');
    const playerId = engine.state.players[seat!]!.id;
    const check = { type: ActionType.CHECK, playerId } as const;
    engine.act(engine.validate(check).valid ? check : { type: ActionType.CALL, playerId });
    assertConserved(engine);
  }
}
