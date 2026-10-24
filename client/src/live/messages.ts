import {
  HAND_STATUSES, PLAYER_STATUSES, RANKS, REQUEST_ERROR_CODES, STREETS, SUITS,
  type Card, type PlayerView, type ServerMessage, type TableSnapshot,
} from '@deadpan/shared';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const oneOf = <T extends string>(value: unknown, choices: readonly T[]): value is T =>
  choices.some((choice) => value === choice);
const chips = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const card = (value: unknown) =>
  record(value) && oneOf(value.rank, RANKS) && oneOf(value.suit, SUITS);
const cards = (value: unknown) => Array.isArray(value) && value.every(card);
const nullableChips = (value: unknown) => value === null || chips(value);

function player(value: unknown): value is PlayerView {
  if (!record(value) || typeof value.id !== 'string' || typeof value.name !== 'string' ||
      typeof value.avatar !== 'string' || !chips(value.stack) || !chips(value.bet) ||
      !oneOf(value.status, PLAYER_STATUSES) ||
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

  return oneOf(value.handStatus, HAND_STATUSES) &&
    value.seats.every((entry, index) => record(entry) && entry.index === index &&
      (entry.player === null || player(entry.player))) &&
    nullableSeat(value.mySeat) && nullableSeat(value.buttonSeat) &&
    nullableSeat(value.smallBlindSeat) && nullableSeat(value.bigBlindSeat) &&
    record(value.blinds) && chips(value.blinds.small) && chips(value.blinds.big) && value.blinds.big > 0 &&
    (value.street === null || oneOf(value.street, STREETS)) &&
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

const copyCard = (value: Card): Card => ({ rank: value.rank, suit: value.suit });

function copyPlayer(value: PlayerView): PlayerView {
  return {
    id: value.id,
    name: value.name,
    avatar: value.avatar,
    stack: value.stack,
    bet: value.bet,
    status: value.status,
    cards: value.cards.kind === 'shown'
      ? { kind: 'shown', cards: [copyCard(value.cards.cards[0]), copyCard(value.cards.cards[1])] }
      : { kind: value.cards.kind },
  };
}

/** Validation permits extra wire fields; none may cross this allowlist into the UI. */
function copySnapshot(value: TableSnapshot): TableSnapshot {
  return {
    seq: value.seq,
    handStatus: value.handStatus,
    maxSeats: value.maxSeats,
    seats: value.seats.map((seat) => ({
      index: seat.index,
      player: seat.player === null ? null : copyPlayer(seat.player),
    })),
    mySeat: value.mySeat,
    buttonSeat: value.buttonSeat,
    smallBlindSeat: value.smallBlindSeat,
    bigBlindSeat: value.bigBlindSeat,
    blinds: { small: value.blinds.small, big: value.blinds.big },
    street: value.street,
    board: value.board.map(copyCard),
    pots: value.pots.map((pot) => ({ amount: pot.amount, eligibleSeats: [...pot.eligibleSeats] })),
    currentBet: value.currentBet,
    turn: value.turn === null ? null : {
      seat: value.turn.seat,
      clock: value.turn.clock === null ? null : {
        startedAt: value.turn.clock.startedAt,
        durationMs: value.turn.clock.durationMs,
        timeBankMs: value.turn.clock.timeBankMs,
      },
    },
    legalActions: value.legalActions === null ? null : {
      canFold: value.legalActions.canFold,
      canCheck: value.legalActions.canCheck,
      callAmount: value.legalActions.callAmount,
      minRaiseTo: value.legalActions.minRaiseTo,
      maxRaiseTo: value.legalActions.maxRaiseTo,
    },
    preActionsEnabled: value.preActionsEnabled,
    preAction: value.preAction === null ? null : value.preAction.kind === 'call'
      ? { kind: 'call', amount: value.preAction.amount }
      : { kind: value.preAction.kind },
    winners: value.winners.map((winner) => ({
      seat: winner.seat,
      amount: winner.amount,
      handLabel: winner.handLabel,
      bestCards: winner.bestCards.map(copyCard),
    })),
  };
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
  if (value.replyTo !== undefined && (!chips(value.replyTo) || value.replyTo === 0)) return null;
  const reply = value.replyTo === undefined ? {} : { replyTo: value.replyTo };
  if (value.kind === 'snapshot' && snapshot(value.snapshot)) {
    return { kind: 'snapshot', snapshot: copySnapshot(value.snapshot), ...reply };
  }
  if (value.kind === 'error' && oneOf(value.code, REQUEST_ERROR_CODES) &&
      typeof value.message === 'string' && value.message.length <= 512) {
    return { kind: 'error', code: value.code, message: value.message, ...reply };
  }
  return null;
}
