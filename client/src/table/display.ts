import type { TableSnapshot, TableTurn } from '@deadpan/shared';

/** The actor remains visible even when the server supplies no countdown. */
export function turnForSeat(snapshot: TableSnapshot, seat: number): TableTurn | null {
  return snapshot.handStatus === 'playing' && snapshot.turn?.seat === seat ? snapshot.turn : null;
}

/** Display server-provided decisions, never derive poker legality in the UI. */
export function tableControls(snapshot: TableSnapshot): 'actions' | 'pre-actions' | null {
  const { handStatus, mySeat, seats, street, turn, legalActions, preActionsEnabled } = snapshot;
  const me = mySeat === null ? null : seats[mySeat]?.player;
  if (handStatus !== 'playing' || !me || me.status !== 'active' || !turn || street === null || street === 'showdown') {
    return null;
  }
  if (turn.seat === mySeat) return legalActions ? 'actions' : null;
  return preActionsEnabled ? 'pre-actions' : null;
}
