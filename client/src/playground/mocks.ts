import type { Card, HoleCards, PlayerView, Pot, TableSnapshot } from '@deadpan/shared';
import { clockwiseFrom } from '../table/layout';
import { card } from './cards';

// Fake tables for the playground, standing in for what the server will send.

export const SCENARIOS = {
  'my-turn': 'My turn',
  waiting: 'Waiting',
  'all-in': 'All-in run-out',
  showdown: 'Showdown',
  'not-seated': 'Not seated',
} as const;
export type Scenario = keyof typeof SCENARIOS;

const MAX_SEATS = 9;
const ME = 4;
const BLINDS = { small: 10, big: 20 };
const TURN_MS = 20_000;

const FRIENDS = [
  { name: 'You', avatar: '🦊', stack: 1460 },
  { name: 'Sam', avatar: '🐼', stack: 2035 },
  { name: 'Alex', avatar: '🐸', stack: 860 },
  { name: 'Jordan', avatar: '🦉', stack: 12_500 },
  { name: 'Riley', avatar: '🐙', stack: 1200 },
  { name: 'Casey', avatar: '🐯', stack: 3300 },
  { name: 'Morgan', avatar: '🐨', stack: 940 },
  { name: 'Taylor', avatar: '🦄', stack: 1875 },
  { name: 'Jamie', avatar: '🐻', stack: 2210 },
];
/** Seats fill in this order, leaving gaps so empty seats show up. My seat comes first. */
const FILL_ORDER = [ME, 0, 6, 2, 7, 1, 3, 5, 8];

const cards = (...codes: string[]): Card[] => codes.map(card);
const shown = (a: string, b: string): HoleCards => ({ kind: 'shown', cards: [card(a), card(b)] });
const NO_CARDS: HoleCards = { kind: 'none' };

export function makeSnapshot(scenario: Scenario, playerCount: number, seq: number, now: number): TableSnapshot {
  const seated = scenario !== 'not-seated';
  const taken = seated
    ? FILL_ORDER.slice(0, playerCount)
    : FILL_ORDER.slice(1, 1 + Math.min(playerCount, MAX_SEATS - 1));

  const players = new Map<number, PlayerView>();
  for (const seat of taken) {
    const friend = FRIENDS[FILL_ORDER.indexOf(seat)]!;
    players.set(seat, {
      id: `player-${seat}`,
      name: friend.name,
      avatar: friend.avatar,
      stack: friend.stack,
      bet: 0,
      status: 'active',
      cards: seat === ME ? shown('Ah', 'Kd') : { kind: 'hidden' },
    });
  }
  const update = (seat: number, patch: Partial<PlayerView>) => players.set(seat, { ...players.get(seat)!, ...patch });
  const stackOf = (seat: number) => players.get(seat)!.stack;

  // Opponents in the order they act after me. The first one is the aggressor.
  const others = clockwiseFrom(
    taken.filter((seat) => seat !== ME),
    ME,
  );
  const [villain, shorty] = others as [number, number | undefined];
  const sorted = [...taken].sort((a, b) => a - b);
  const headsUp = taken.length === 2;

  let street: TableSnapshot['street'];
  let board: Card[];
  let pots: Pot[];
  let currentBet = 0;
  let turnSeat: number | null = null;
  let legalActions: TableSnapshot['legalActions'] = null;
  let winners: TableSnapshot['winners'] = [];

  if (scenario === 'all-in' || scenario === 'showdown') {
    // I'm all in against the aggressor, plus a short stack when there are three or more.
    const myStack = stackOf(ME);
    for (const seat of others.slice(shorty === undefined ? 1 : 2)) update(seat, { status: 'folded', cards: NO_CARDS });
    update(ME, { stack: 0, status: 'all-in', cards: shown('7c', '7s') });
    // The aggressor covered my all-in and has a little left behind.
    update(villain, { stack: 640, cards: shown('Ah', 'Kd') });
    if (shorty === undefined) {
      pots = [{ amount: myStack * 2, eligibleSeats: [ME, villain] }];
    } else {
      const short = 300;
      update(shorty, { stack: 0, status: 'all-in', cards: shown('Qh', 'Jh') });
      pots = [
        { amount: short * 3, eligibleSeats: [ME, villain, shorty] },
        { amount: (myStack - short) * 2, eligibleSeats: [ME, villain] },
      ];
    }
    board = cards('Kc', '7d', '2h', '9s', 'Ks');
    street = 'river';
    if (scenario === 'showdown') {
      const total = pots.reduce((sum, pot) => sum + pot.amount, 0);
      winners = [
        {
          seat: ME,
          amount: total,
          handLabel: 'Full house, sevens full of kings',
          bestCards: cards('7c', '7s', '7d', 'Kc', 'Ks'),
        },
      ];
      update(ME, { stack: total });
      pots = [];
      street = 'showdown';
    }
  } else {
    // On the flop: some players folded, and the aggressor has bet into the rest.
    others.slice(2).forEach((seat, i) => {
      if (i % 2 === 0) update(seat, { status: 'folded', cards: NO_CARDS });
    });
    if (others.length >= 6) {
      update(others.at(-1)!, { status: 'sitting-out', cards: NO_CARDS });
      update(others.at(-2)!, { status: 'disconnected', cards: { kind: 'hidden' } });
    }
    const villainBets = !(scenario === 'waiting' && headsUp);
    if (villainBets) {
      update(villain, { bet: 60, stack: stackOf(villain) - 60 });
      currentBet = 60;
    }
    const stillIn = taken.filter((seat) => players.get(seat)!.status !== 'folded');
    pots = [{ amount: 180, eligibleSeats: stillIn }];
    board = cards('Kc', '7d', '2h');
    street = 'flop';

    if (scenario === 'my-turn') {
      turnSeat = ME;
      legalActions = { canFold: true, canCheck: false, callAmount: 60, minRaiseTo: 120, maxRaiseTo: stackOf(ME) };
    } else if (!villainBets) {
      turnSeat = villain;
    } else {
      const next = others.slice(1).find((seat) => players.get(seat)!.status === 'active');
      turnSeat = next ?? (seated ? ME : villain);
    }
  }

  return {
    seq,
    handStatus: scenario === 'showdown' ? 'complete' : 'playing',
    maxSeats: MAX_SEATS,
    seats: Array.from({ length: MAX_SEATS }, (_, index) => ({ index, player: players.get(index) ?? null })),
    mySeat: seated ? ME : null,
    buttonSeat: sorted[0]!,
    smallBlindSeat: headsUp ? sorted[0]! : sorted[1]!,
    bigBlindSeat: headsUp ? sorted[1]! : sorted[2]!,
    blinds: BLINDS,
    street,
    board,
    pots,
    currentBet,
    turn: turnSeat === null ? null : {
      seat: turnSeat,
      clock: { startedAt: now, durationMs: TURN_MS, timeBankMs: 30_000 },
    },
    legalActions,
    preActionsEnabled: true,
    preAction: null,
    winners,
  };
}
