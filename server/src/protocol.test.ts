import { describe, expect, test } from 'vitest';
import { parseClientMessage } from './protocol';

describe('parseClientMessage', () => {
  test.each([
    { kind: 'identify', playerId: 'dev-a' },
    { kind: 'identify', playerId: 'dev-b' },
    { kind: 'deal', expectedSeq: 0 },
    ...['fold', 'check', 'call'].map((kind) => ({ kind: 'act', expectedSeq: 12, action: { kind } })),
    { kind: 'act', expectedSeq: 12, action: { kind: 'raise', to: 60 } },
  ])('accepts a supported message: %j', (message) => {
    expect(parseClientMessage(JSON.stringify(message))).toEqual(message);
  });

  test.each([
    '', '{', 'null', '[]', 'true', '"identify"',
    JSON.stringify({ kind: 'identify', playerId: 'Alex' }),
    JSON.stringify({ kind: 'identify', playerId: 0 }),
    JSON.stringify({ kind: 'identify', playerId: 'dev-a', token: 'unexpected' }),
    JSON.stringify({ kind: 'deal' }),
    ...[-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1', null].map((expectedSeq) => JSON.stringify({ kind: 'deal', expectedSeq })),
    JSON.stringify({ kind: 'act', expectedSeq: 1, playerId: 'dev-b', action: { kind: 'call' } }),
    JSON.stringify({ kind: 'act', expectedSeq: 1, action: null }),
    JSON.stringify({ kind: 'act', expectedSeq: 1, action: { kind: 'call', to: 10 } }),
    JSON.stringify({ kind: 'act', expectedSeq: 1, action: { kind: 'bet', to: 10 } }),
    ...[-1, 0, 3.5, Number.MAX_SAFE_INTEGER + 1, '60', null].map((to) =>
      JSON.stringify({ kind: 'act', expectedSeq: 1, action: { kind: 'raise', to } })),
    JSON.stringify({ kind: 'snapshot', snapshot: { seats: [] } }),
  ])('rejects malformed/untrusted data without echoing it: %s', (raw) => {
    expect(() => parseClientMessage(raw)).toThrow('Invalid message.');
  });
});
