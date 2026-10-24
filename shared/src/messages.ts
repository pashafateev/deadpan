import type { PlayerAction } from './actions';
import type { TableSnapshot } from './table';

/** Local fixtures, not accounts. IDs never depend on names or seat positions. */
export const DEVELOPMENT_PLAYERS = [
  { id: 'dev-a', name: 'Alex', avatar: '🦊', seat: 0 },
  { id: 'dev-b', name: 'Sam', avatar: '🐼', seat: 1 },
] as const;

export type DevelopmentPlayerId = (typeof DEVELOPMENT_PLAYERS)[number]['id'];

export type ClientMessage =
  | { kind: 'identify'; playerId: DevelopmentPlayerId }
  | { kind: 'deal'; requestId: number; expectedSeq: number }
  | { kind: 'act'; requestId: number; expectedSeq: number; action: PlayerAction };

export const REQUEST_ERROR_CODES = [
  'invalid-message', 'not-identified', 'player-in-use', 'stale-state',
  'not-your-turn', 'illegal-action', 'cannot-deal', 'internal-error',
] as const;
export type RequestErrorCode = (typeof REQUEST_ERROR_CODES)[number];

/** replyTo is present only for a response to that connection's game request.
 * Handshake and unsolicited table/presence messages have no replyTo. */
export type ServerMessage =
  | { kind: 'snapshot'; snapshot: TableSnapshot; replyTo?: number }
  | { kind: 'error'; code: RequestErrorCode; message: string; replyTo?: number };
