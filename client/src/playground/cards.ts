import { RANKS, SUITS, type Card, type Rank, type Suit } from '@deadpan/shared';

/** Builds a card from compact notation like "As" or "Td", for writing fake tables. */
export function card(code: string): Card {
  const [rank, suit] = code;
  if (!RANKS.includes(rank as Rank) || !SUITS.includes(suit as Suit) || code.length !== 2) {
    throw new Error(`Not a card: ${code}`);
  }
  return { rank: rank as Rank, suit: suit as Suit };
}
