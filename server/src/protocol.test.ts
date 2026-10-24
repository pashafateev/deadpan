import { describe, expect, test } from 'vitest';
import { InvalidMessage, parseClientMessage } from './protocol';

describe('parseClientMessage', () => {
  test.each([
    { kind: 'identify', playerId: 'dev-a' },
    { kind: 'identify', playerId: 'dev-b' },
    { kind: 'deal', expectedSeq: 0, requestId: 1 },
    ...['fold', 'check', 'call'].map((kind) => ({ kind: 'act', expectedSeq: 12, requestId: 2, action: { kind } })),
    { kind: 'act', expectedSeq: 12, requestId: 3, action: { kind: 'raise', to: 60 } },
  ])('accepts a supported message: %j', (message) => {
    expect(parseClientMessage(JSON.stringify(message))).toEqual(message);
  });

  test.each([
    '', '{', 'null', '[]', 'true', '"identify"',
    JSON.stringify({ kind: 'identify', playerId: 'Alex' }),
    JSON.stringify({ kind: 'identify', playerId: 0 }),
    JSON.stringify({ kind: 'identify', playerId: 'dev-a', token: 'unexpected' }),
    JSON.stringify({ kind: 'deal' }),
    ...[-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1', null].map((expectedSeq) => JSON.stringify({ kind: 'deal', expectedSeq, requestId: 1 })),
    ...[undefined, 0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1', null].map((requestId) =>
      JSON.stringify({ kind: 'deal', expectedSeq: 1, requestId })),
    JSON.stringify({ kind: 'act', expectedSeq: 1, requestId: 1, playerId: 'dev-b', action: { kind: 'call' } }),
    JSON.stringify({ kind: 'act', expectedSeq: 1, requestId: 1, action: null }),
    JSON.stringify({ kind: 'act', expectedSeq: 1, requestId: 1, action: { kind: 'call', to: 10 } }),
    JSON.stringify({ kind: 'act', expectedSeq: 1, requestId: 1, action: { kind: 'bet', to: 10 } }),
    ...[-1, 0, 3.5, Number.MAX_SAFE_INTEGER + 1, '60', null].map((to) =>
      JSON.stringify({ kind: 'act', expectedSeq: 1, requestId: 1, action: { kind: 'raise', to } })),
    JSON.stringify({ kind: 'snapshot', snapshot: { seats: [] } }),
  ])('rejects malformed/untrusted data without echoing it: %s', (raw) => {
    expect(() => parseClientMessage(raw)).toThrow('Invalid message.');
  });

  test('a malformed request echoes only a validated request ID, never raw input', () => {
    for (const requestId of [7, -1, 'private', Number.MAX_SAFE_INTEGER + 1]) {
      try {
        parseClientMessage(JSON.stringify({ kind: 'act', requestId, expectedSeq: 0, action: { kind: 'raise', to: 1.5 } }));
        throw new Error('Expected rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidMessage);
        expect((error as InvalidMessage).replyTo).toBe(requestId === 7 ? 7 : undefined);
        expect((error as Error).message).toBe('Invalid message.');
      }
    }
  });
});
