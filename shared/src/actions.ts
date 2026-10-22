/** What a player asks the server to do on their turn. Amounts are street totals. */
export type PlayerAction =
  | { kind: 'fold' }
  | { kind: 'check' }
  | { kind: 'call' }
  | { kind: 'raise'; to: number }; // also used for the first bet on a street
