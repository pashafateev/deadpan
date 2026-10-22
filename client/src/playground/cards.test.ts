import { expect, test } from 'vitest';
import { card } from './cards';

test('parses compact card codes', () => {
  expect(card('As')).toEqual({ rank: 'A', suit: 's' });
  expect(card('Td')).toEqual({ rank: 'T', suit: 'd' });
});

test('rejects codes that are not a card', () => {
  expect(() => card('1x')).toThrow('Not a card: 1x');
});
