import type { Rank, Suit } from '@deadpan/shared';

const shortNumber = (value: number, digits: number) =>
  value.toLocaleString('en-US', { maximumFractionDigits: digits });

export function formatChips(amount: number): string {
  if (amount >= 1_000_000) return `${shortNumber(amount / 1_000_000, 2)}M`;
  if (amount >= 10_000) return `${shortNumber(amount / 1_000, 1)}k`;
  return amount.toLocaleString('en-US');
}

export function rankLabel(rank: Rank): string {
  return rank === 'T' ? '10' : rank;
}

const SYMBOLS: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

export function suitSymbol(suit: Suit): string {
  return SYMBOLS[suit];
}

export function isRed(suit: Suit): boolean {
  return suit === 'h' || suit === 'd';
}
