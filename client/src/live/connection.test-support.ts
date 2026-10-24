import { DEVELOPMENT_PLAYERS, type ServerMessage, type TableSnapshot } from '@deadpan/shared';
import { vi } from 'vitest';
import { createConnection, type LiveSocket } from './connection';

export class FakeSocket implements LiveSocket {
  readyState = 0;
  onopen: LiveSocket['onopen'] = null;
  onmessage: LiveSocket['onmessage'] = null;
  onerror: LiveSocket['onerror'] = null;
  onclose: LiveSocket['onclose'] = null;
  sent: string[] = [];
  send = vi.fn((data: string) => this.sent.push(data));
  close = vi.fn(() => { this.readyState = 3; });

  open() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  receive(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }

  message(message: ServerMessage) {
    this.receive(JSON.stringify(message));
  }

  closed() {
    this.readyState = 3;
    this.onclose?.({} as CloseEvent);
  }

  fail() {
    this.onerror?.(new Event('error'));
  }

  messages() {
    return this.sent.map((data) => JSON.parse(data));
  }
}

export function snapshot(patch: Partial<TableSnapshot> = {}): TableSnapshot {
  return {
    seq: 0,
    handStatus: 'waiting',
    maxSeats: 2,
    seats: DEVELOPMENT_PLAYERS.map(({ id, name, avatar, seat }) => ({
      index: seat,
      player: { id, name, avatar, stack: 1000, bet: 0, status: 'active', cards: { kind: 'none' } },
    })),
    mySeat: 0,
    buttonSeat: null,
    smallBlindSeat: null,
    bigBlindSeat: null,
    blinds: { small: 5, big: 10 },
    street: null,
    board: [],
    pots: [],
    currentBet: 0,
    turn: null,
    legalActions: null,
    preActionsEnabled: false,
    preAction: null,
    winners: [],
    ...patch,
  };
}

export function playing(patch: Partial<TableSnapshot> = {}): TableSnapshot {
  return snapshot({
    seq: 1,
    handStatus: 'playing',
    street: 'preflop',
    turn: { seat: 0, clock: null },
    legalActions: { canFold: true, canCheck: false, callAmount: 5, minRaiseTo: 20, maxRaiseTo: 1000 },
    ...patch,
  });
}

export function setup(url?: string) {
  const sockets: FakeSocket[] = [];
  const createSocket = vi.fn(() => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  });
  const connection = createConnection({ url, createSocket });
  return { connection, sockets, createSocket };
}

export function connected(initial = snapshot()) {
  const result = setup();
  result.connection.connect('dev-a');
  result.sockets[0]!.open();
  result.sockets[0]!.message({ kind: 'snapshot', snapshot: initial });
  return { ...result, socket: result.sockets[0]! };
}
