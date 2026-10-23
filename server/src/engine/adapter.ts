import { ActionType, PlayerStatus as EngineStatus, PokerEngine, Street as EngineStreet } from '@pokertools/engine';
import type { Action } from '@pokertools/engine';
import { RANKS, SUITS } from '@deadpan/shared';
import type { Card, LegalActions, PlayerAction, PlayerView, Street, TableSnapshot, Winner } from '@deadpan/shared';

export interface EnginePlayer {
  id: string;
  name: string;
  seat: number;
  stack: number;
}

export interface EngineOptions {
  blinds?: { small: number; big: number };
  maxSeats?: number;
  /** Test injection only; the running server always uses secure default randomness. */
  randomProvider?: () => number;
}

type PokerPlayer = Omit<PlayerView, 'id' | 'name' | 'avatar'>;
export type EngineView = Omit<TableSnapshot, 'seq' | 'seats' | 'preAction' | 'preActionsEnabled'> & {
  seats: { index: number; player: PokerPlayer | null }[];
};

export class RejectedRequest extends Error {
  constructor(public readonly code: 'not-your-turn' | 'illegal-action' | 'cannot-deal', message: string) {
    super(message);
  }
}

function card(code: string): Card {
  const rank = code[0] as Card['rank'];
  const suit = code[1] as Card['suit'];
  if (code.length !== 2 || !RANKS.includes(rank) || !SUITS.includes(suit)) {
    throw new Error('Engine returned an unsupported card');
  }
  return { rank, suit };
}

/** The only production boundary that knows the rules library's state and API. */
export class EngineAdapter {
  private readonly engine: PokerEngine;
  private smallBlindSeat: number | null = null;
  private lastBettingStreet: Street | null = null;

  constructor(players: readonly EnginePlayer[], options: EngineOptions = {}) {
    const blinds = options.blinds ?? { small: 5, big: 10 };
    this.engine = new PokerEngine({
      smallBlind: blinds.small,
      bigBlind: blinds.big,
      maxPlayers: options.maxSeats ?? Math.max(2, ...players.map((player) => player.seat + 1)),
      randomProvider: options.randomProvider,
      validateIntegrity: true,
      rakePercent: 0,
    });
    for (const player of players) this.engine.sit(player.seat, player.id, player.name, player.stack);
  }

  deal(): void {
    if (!this.engine.validate({ type: ActionType.DEAL }).valid) {
      throw new RejectedRequest('cannot-deal', 'A new hand cannot be dealt now.');
    }
    this.engine.deal();
    const state = this.engine.state;
    // Posted blinds identify positions without recalculating the engine's rules.
    // In an immediate heads-up all-in runout, bets are already paid out.
    this.smallBlindSeat = [...state.currentBets.keys()].find((seat) => seat !== state.bigBlindSeat)
      ?? (state.players.filter((player) => player?.hand?.length === 2).length === 2 ? state.buttonSeat : null);
    this.lastBettingStreet = 'preflop';
  }

  act(seat: number, action: PlayerAction): void {
    if (this.engine.state.actionTo !== seat || this.engine.state.winners !== null) {
      throw new RejectedRequest('not-your-turn', 'It is not your turn.');
    }
    if (action.kind === 'raise' && (!Number.isSafeInteger(action.to) || action.to < 0)) {
      throw new RejectedRequest('illegal-action', 'Choose a legal whole-chip amount.');
    }
    const request = this.action(seat, action);
    if (!this.engine.validate(request).valid) {
      throw new RejectedRequest('illegal-action', 'That action is not legal for this turn.');
    }
    this.lastBettingStreet = this.engine.state.street.toLowerCase() as Street;
    this.engine.act(request);
  }

  view(viewerSeat: number | null): EngineView {
    const state = this.engine.state;
    const handStatus = state.handNumber === 0 ? 'waiting' : state.winners === null ? 'playing' : 'complete';
    const contested = state.winners?.some((winner) => winner.hand !== null) ?? false;
    const complete = handStatus === 'complete';
    const actingSeat = handStatus === 'playing' ? state.actionTo : null;
    return {
      handStatus,
      maxSeats: state.maxPlayers,
      mySeat: viewerSeat !== null && state.players[viewerSeat] ? viewerSeat : null,
      seats: state.players.map((player, index) => {
        if (!player) return { index, player: null };
        const folded = player.status === EngineStatus.FOLDED;
        const shown = !folded && (index === viewerSeat || (complete && contested));
        const cards: PokerPlayer['cards'] = !player.hand || folded
          ? { kind: 'none' }
          : shown
            ? { kind: 'shown', cards: [card(player.hand[0]!), card(player.hand[1]!)] }
            : { kind: 'hidden' };
        const status: PokerPlayer['status'] = folded ? 'folded'
          : player.status === EngineStatus.ALL_IN ? 'all-in'
            : player.status === EngineStatus.SITTING_OUT || player.status === EngineStatus.BUSTED ? 'sitting-out' : 'active';
        return { index, player: { stack: player.stack, bet: state.currentBets.get(index) ?? 0, status, cards } };
      }),
      buttonSeat: state.buttonSeat,
      smallBlindSeat: this.smallBlindSeat,
      bigBlindSeat: state.bigBlindSeat,
      blinds: { small: state.smallBlind, big: state.bigBlind },
      street: handStatus === 'waiting' ? null
        : complete && contested ? 'showdown'
          : state.street === EngineStreet.SHOWDOWN ? this.lastBettingStreet
            : state.street.toLowerCase() as Street,
      board: state.board.map(card),
      pots: state.pots.map((pot) => ({ amount: pot.amount, eligibleSeats: [...pot.eligibleSeats] })),
      currentBet: this.currentBet(),
      turn: actingSeat === null ? null : { seat: actingSeat, clock: null },
      legalActions: viewerSeat !== null && viewerSeat === actingSeat ? this.legalActions(viewerSeat) : null,
      winners: this.winners(),
    };
  }

  private currentBet(): number {
    const state = this.engine.state;
    if (state.currentBets.size === 0) return 0;
    // minRaise is the engine's raise-to amount, not an increment. This also
    // preserves its full bring-in when a big blind posts short.
    return Math.max(...state.currentBets.values(), state.minRaise - state.lastRaiseAmount);
  }

  private action(seat: number, action: PlayerAction): Action {
    const playerId = this.engine.state.players[seat]!.id;
    switch (action.kind) {
      case 'fold': return { type: ActionType.FOLD, playerId };
      case 'check': return { type: ActionType.CHECK, playerId };
      case 'call': return { type: ActionType.CALL, playerId };
      case 'raise': return { type: this.currentBet() === 0 ? ActionType.BET : ActionType.RAISE, playerId, amount: action.to };
    }
  }

  private legalActions(seat: number): LegalActions {
    const state = this.engine.state;
    const player = state.players[seat]!;
    const call = this.action(seat, { kind: 'call' });
    let callAmount = 0;
    if (this.engine.validate(call).valid) {
      // The supported preview records the actual stack-capped call, even when
      // that call immediately progresses streets or pays out the hand.
      const preview = this.engine.optimisticAct({ ...call, timestamp: state.timestamp });
      const record = preview.actionHistory.findLast((entry) => entry.seat === seat && entry.action.type === ActionType.CALL);
      if (record?.action.type === ActionType.CALL) callAmount = record.action.amount ?? 0;
    }
    const max = player.stack + player.betThisStreet;
    const canRaise = this.engine.validate(this.action(seat, { kind: 'raise', to: max })).valid;
    return {
      canFold: this.engine.validate(this.action(seat, { kind: 'fold' })).valid,
      canCheck: this.engine.validate(this.action(seat, { kind: 'check' })).valid,
      callAmount,
      minRaiseTo: canRaise ? Math.min(state.minRaise, max) : null,
      maxRaiseTo: canRaise ? max : null,
    };
  }

  private winners(): Winner[] {
    const winners = new Map<number, Winner>();
    for (const result of this.engine.state.winners ?? []) {
      const existing = winners.get(result.seat);
      winners.set(result.seat, {
        seat: result.seat,
        amount: (existing?.amount ?? 0) + result.amount,
        handLabel: result.handRank ?? '',
        bestCards: result.hand?.map(card) ?? [],
      });
    }
    return [...winners.values()].sort((a, b) => a.seat - b.seat);
  }
}
