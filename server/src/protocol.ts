import { DEVELOPMENT_PLAYERS } from '@deadpan/shared';
import type { ClientMessage, PlayerAction } from '@deadpan/shared';

export class InvalidMessage extends Error {
  constructor() {
    super('Invalid message.');
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const fields = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const revision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function action(value: unknown): PlayerAction {
  if (record(value)) {
    switch (value.kind) {
      case 'fold':
      case 'check':
      case 'call':
        if (fields(value, ['kind'])) return { kind: value.kind };
        break;
      case 'raise':
        if (fields(value, ['kind', 'to']) && revision(value.to) && value.to > 0) {
          return { kind: 'raise', to: value.to };
        }
    }
  }
  throw new InvalidMessage();
}

/** Decode into fresh allowlisted values, never forward raw client objects. */
export function parseClientMessage(raw: string): ClientMessage {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new InvalidMessage();
  }
  if (record(value)) {
    if (value.kind === 'identify' && fields(value, ['kind', 'playerId'])) {
      const player = DEVELOPMENT_PLAYERS.find((candidate) => candidate.id === value.playerId);
      if (player) return { kind: 'identify', playerId: player.id };
    } else if (value.kind === 'deal' && fields(value, ['kind', 'expectedSeq']) && revision(value.expectedSeq)) {
      return { kind: 'deal', expectedSeq: value.expectedSeq };
    } else if (value.kind === 'act' && fields(value, ['kind', 'expectedSeq', 'action']) && revision(value.expectedSeq)) {
      return { kind: 'act', expectedSeq: value.expectedSeq, action: action(value.action) };
    }
  }
  throw new InvalidMessage();
}
