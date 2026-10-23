import { RANKS, SUITS, type PlayerView, type ServerMessage, type TableSnapshot } from '@deadpan/shared';

const ERROR_CODES = [
  'invalid-message', 'not-identified', 'player-in-use', 'stale-state',
  'not-your-turn', 'illegal-action', 'cannot-deal', 'internal-error',
];

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const chips = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const card = (value: unknown) =>
  record(value) && RANKS.some((rank) => value.rank === rank) && SUITS.some((suit) => value.suit === suit);
const cards = (value: unknown) => Array.isArray(value) && value.every(card);
const nullableChips = (value: unknown) => value === null || chips(value);

function player(value: unknown): value is PlayerView {
  if (!record(value) || typeof value.id !== 'string' || typeof value.name !== 'string' ||
      typeof value.avatar !== 'string' || !chips(value.stack) || !chips(value.bet) ||
      !['active', 'folded', 'all-in', 'sitting-out', 'disconnected'].includes(value.status as string) ||
      !record(value.cards)) return false;
  const hand = value.cards;
  return hand.kind === 'none' || hand.kind === 'hidden' ||
    (hand.kind === 'shown' && Array.isArray(hand.cards) && hand.cards.length === 2 && cards(hand.cards));
}

function clock(value: unknown) {
  return value === null || (record(value) && finite(value.startedAt) &&
    finite(value.durationMs) && value.durationMs > 0 && finite(value.timeBankMs));
}

function legalActions(value: unknown) {
  return value === null || (record(value) && typeof value.canFold === 'boolean' &&
    typeof value.canCheck === 'boolean' && chips(value.callAmount) &&
    nullableChips(value.minRaiseTo) && nullableChips(value.maxRaiseTo));
}

function preAction(value: unknown) {
  return value === null || (record(value) &&
    (['check-fold', 'check', 'call-any'].includes(value.kind as string) ||
      (value.kind === 'call' && chips(value.amount))));
}

/** Validate the wire shape only; poker legality belongs to the server. */
function snapshot(value: unknown): value is TableSnapshot {
  if (!record(value) || !chips(value.seq) || !chips(value.maxSeats) ||
      value.maxSeats < 1 || value.maxSeats > 9 || !Array.isArray(value.seats) ||
      value.seats.length !== value.maxSeats) return false;
  const maxSeats = value.maxSeats;
  const seat = (index: unknown) => chips(index) && index < maxSeats;
  const nullableSeat = (index: unknown) => index === null || seat(index);

  return ['waiting', 'playing', 'complete'].includes(value.handStatus as string) &&
    value.seats.every((entry, index) => record(entry) && entry.index === index &&
      (entry.player === null || player(entry.player))) &&
    nullableSeat(value.mySeat) && nullableSeat(value.buttonSeat) &&
    nullableSeat(value.smallBlindSeat) && nullableSeat(value.bigBlindSeat) &&
    record(value.blinds) && chips(value.blinds.small) && chips(value.blinds.big) && value.blinds.big > 0 &&
    (value.street === null || ['preflop', 'flop', 'turn', 'river', 'showdown'].includes(value.street as string)) &&
    cards(value.board) && Array.isArray(value.pots) &&
    value.pots.every((pot) => record(pot) && chips(pot.amount) &&
      Array.isArray(pot.eligibleSeats) && pot.eligibleSeats.every(seat)) &&
    chips(value.currentBet) &&
    (value.turn === null || (record(value.turn) && seat(value.turn.seat) && clock(value.turn.clock))) &&
    legalActions(value.legalActions) && typeof value.preActionsEnabled === 'boolean' &&
    preAction(value.preAction) && Array.isArray(value.winners) &&
    value.winners.every((winner) => record(winner) && seat(winner.seat) && chips(winner.amount) &&
      typeof winner.handLabel === 'string' && cards(winner.bestCards));
}

/** Never pass arbitrary network objects (or thrown exceptions) to the UI. */
export function readServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== 'string') return null;
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (!record(value)) return null;
  if (value.kind === 'snapshot' && snapshot(value.snapshot)) {
    return { kind: 'snapshot', snapshot: value.snapshot };
  }
  if (value.kind === 'error' && ERROR_CODES.includes(value.code as string) &&
      typeof value.message === 'string' && value.message.length <= 512) {
    return { kind: 'error', code: value.code as Extract<ServerMessage, { kind: 'error' }>['code'], message: value.message };
  }
  return null;
}
