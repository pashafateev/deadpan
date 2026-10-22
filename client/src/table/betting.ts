import type { Pot } from '@deadpan/shared';

export interface BetPreset {
  label: string;
  amount: number;
}

/** Everything in the middle: collected pots plus bets made on this street. */
export function potTotal(pots: Pot[], bets: number[]): number {
  const collected = pots.reduce((sum, pot) => sum + pot.amount, 0);
  return collected + bets.reduce((sum, bet) => sum + bet, 0);
}

interface PresetInput {
  potTotal: number;
  currentBet: number;
  callAmount: number;
  minRaiseTo: number;
  maxRaiseTo: number;
}

/**
 * Quick bet sizes as street totals. A pot-sized raise first calls, then raises by
 * the size of the pot after that call, the way it's counted at a real table.
 */
export function betPresets({ potTotal, currentBet, callAmount, minRaiseTo, maxRaiseTo }: PresetInput): BetPreset[] {
  const potAfterCall = potTotal + callAmount;
  const clamp = (amount: number) => Math.min(maxRaiseTo, Math.max(minRaiseTo, Math.floor(amount)));
  const sized = [
    { label: '½ pot', amount: clamp(currentBet + potAfterCall / 2) },
    { label: 'Pot', amount: clamp(currentBet + potAfterCall) },
  ].filter((preset) => preset.amount < maxRaiseTo);
  return [...sized, { label: 'All-in', amount: maxRaiseTo }];
}

/** Snaps a slider value to whole big blinds, staying within the legal range. */
export function snapBet(value: number, { step, min, max }: { step: number; min: number; max: number }): number {
  return Math.min(max, Math.max(min, Math.round(value / step) * step));
}
