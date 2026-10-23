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
  | { kind: 'deal'; expectedSeq: number }
  | { kind: 'act'; expectedSeq: number; action: PlayerAction };

export type RequestErrorCode =
  | 'invalid-message'
  | 'not-identified'
  | 'player-in-use'
  | 'stale-state'
  | 'not-your-turn'
  | 'illegal-action'
  | 'cannot-deal'
  | 'internal-error';

export type ServerMessage =
  | { kind: 'snapshot'; snapshot: TableSnapshot }
  | { kind: 'error'; code: RequestErrorCode; message: string };
