import type { PlayerStatus, TableSnapshot, TableTurn } from '@deadpan/shared';

const STATUS_LABEL: Partial<Record<PlayerStatus, string>> = {
  'all-in': 'All in',
  'sitting-out': 'Sitting out',
  disconnected: 'Offline',
};

/** Keep important presence/betting status visible even when that seat must act. */
export function seatStatusLabel(status: PlayerStatus, acting: boolean): string | null {
  return STATUS_LABEL[status] ?? (acting ? 'To act' : null);
}

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
