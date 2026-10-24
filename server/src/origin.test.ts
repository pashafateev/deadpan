import { describe, expect, test } from 'vitest';
import { isLocalDevelopmentOrigin } from './origin';

describe('local development WebSocket origins', () => {
  test.each([
    undefined, // Native local tools do not send browser Origin headers.
    'http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:4173',
    'https://localhost:5173', 'http://[::1]:5173',
  ])('allows the local browser origin %s', (origin) => {
    expect(isLocalDevelopmentOrigin(origin)).toBe(true);
  });

  test.each([
    'https://evil.example', 'http://localhost.evil.example:5173', 'http://127.0.0.1.evil.example',
    'http://10.0.0.52:5174', 'null', '', 'not an origin', 'file:///tmp/table.html',
    'ws://localhost:5173', 'http://user:password@localhost:5173',
    'http://localhost:5173/path', 'http://localhost:5173?query=1', 'http://localhost:5173#fragment',
  ])('rejects foreign, opaque, or malformed origins: %s', (origin) => {
    expect(isLocalDevelopmentOrigin(origin)).toBe(false);
  });
});
