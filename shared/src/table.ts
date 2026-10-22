import type { Card } from './cards';

// The table as one player is allowed to see it. The server will send this after
// every change; until the server exists, the client's playground builds it from
// fake data. Components render only from this shape.

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export type PlayerStatus = 'active' | 'folded' | 'all-in' | 'sitting-out' | 'disconnected';

/** What this viewer can see of a player's two hole cards. */
export type HoleCards =
  | { kind: 'none' } // not dealt in, or folded
  | { kind: 'hidden' } // face down
  | { kind: 'shown'; cards: [Card, Card] }; // the viewer's own cards, or revealed at showdown

export interface PlayerView {
  id: string;
  name: string;
  /** An emoji for now; may become an image id. */
  avatar: string;
  stack: number;
  /** Chips this player has put in on the current street. */
  bet: number;
  status: PlayerStatus;
  cards: HoleCards;
}

export interface SeatView {
  /** Fixed position around the table, 0 to maxSeats - 1, increasing clockwise. */
  index: number;
  player: PlayerView | null;
}

export interface Pot {
  amount: number;
  /** Seats that can win this pot. The main pot comes first, then side pots. */
  eligibleSeats: number[];
}

export interface TurnClock {
  seat: number;
  /** Epoch milliseconds when this turn started. */
  startedAt: number;
  durationMs: number;
  /** Extra time the acting player can still use. */
  timeBankMs: number;
}

/** Present only when it is the viewer's turn. Amounts are totals for the street. */
export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  /** Chips needed to call; 0 when checking is possible. */
  callAmount: number;
  /** Smallest legal bet or raise, as a street total; null when raising is not allowed. */
  minRaiseTo: number | null;
  /** Largest legal bet or raise (all-in), as a street total; null when raising is not allowed. */
  maxRaiseTo: number | null;
}

/** An action queued before the viewer's turn arrives. */
export type PreAction =
  | { kind: 'check-fold' }
  | { kind: 'check' }
  | { kind: 'call'; amount: number } // cleared if the amount to call changes
  | { kind: 'call-any' };

export interface Winner {
  seat: number;
  amount: number;
  /** For example "Two pair, kings and sevens". Empty when everyone else folded. */
  handLabel: string;
  /** The five cards that made the hand, for highlighting. */
  bestCards: Card[];
}

export interface TableSnapshot {
  /** Increases with every message, so a client can tell when it missed some. */
  seq: number;
  maxSeats: number;
  seats: SeatView[];
  /** The viewer's seat, or null when they are not seated. */
  mySeat: number | null;
  buttonSeat: number | null;
  smallBlindSeat: number | null;
  bigBlindSeat: number | null;
  blinds: { small: number; big: number };
  /** null between hands. */
  street: Street | null;
  board: Card[];
  /** Chips already collected into pots, not counting bets on the current street. */
  pots: Pot[];
  /** The highest bet on the current street. */
  currentBet: number;
  turn: TurnClock | null;
  legalActions: LegalActions | null;
  preAction: PreAction | null;
  winners: Winner[];
}
