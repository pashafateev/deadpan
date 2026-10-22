import { describe, expect, test } from 'vitest';
import { formatChips, isRed, rankLabel, suitSymbol } from './format';

describe('formatChips', () => {
  test('shows small amounts in full with separators', () => {
    expect(formatChips(950)).toBe('950');
    expect(formatChips(1500)).toBe('1,500');
  });

  test('shortens tens of thousands to k', () => {
    expect(formatChips(12_500)).toBe('12.5k');
    expect(formatChips(12_345)).toBe('12.3k');
    expect(formatChips(100_000)).toBe('100k');
  });

  test('shortens millions to M', () => {
    expect(formatChips(1_250_000)).toBe('1.25M');
  });
});

describe('card labels', () => {
  test('shows ten as 10 and other ranks as they are', () => {
    expect(rankLabel('T')).toBe('10');
    expect(rankLabel('A')).toBe('A');
  });

  test('maps suits to symbols', () => {
    expect(['s', 'h', 'd', 'c'].map((s) => suitSymbol(s as 's'))).toEqual(['♠', '♥', '♦', '♣']);
  });

  test('hearts and diamonds are red', () => {
    expect(isRed('h')).toBe(true);
    expect(isRed('d')).toBe(true);
    expect(isRed('s')).toBe(false);
  });
});
