import type {
  ClientMessage, DevelopmentPlayerId, PlayerAction, RequestErrorCode, TableSnapshot,
} from '@deadpan/shared';
import { tableControls } from '../table/display';
import { readServerMessage } from './messages';

/** The browser WebSocket subset needed by the controller, injectable in tests. */
export interface LiveSocket {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface ConnectionError {
  code: RequestErrorCode | 'connection-error' | 'invalid-response';
  message: string;
}

export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'identifying' | 'connected';
  playerId: DevelopmentPlayerId | null;
  snapshot: TableSnapshot | null;
  pending: { kind: 'deal' | 'act'; expectedSeq: number; requestId: number } | null;
  error: ConnectionError | null;
}

export function getServerUrl(configured?: string): string {
  return configured?.trim() || 'ws://127.0.0.1:3001';
}

const CONNECTION_ERROR: ConnectionError = {
  code: 'connection-error',
  message: 'Connection unavailable. Check that the local game server is running, then reconnect manually.',
};
const INVALID_RESPONSE: ConnectionError = {
  code: 'invalid-response',
  message: 'The server sent an unexpected response. Reconnect before continuing.',
};
const OPEN = 1;
type RequestIntent =
  | Omit<Extract<ClientMessage, { kind: 'deal' }>, 'requestId'>
  | Omit<Extract<ClientMessage, { kind: 'act' }>, 'requestId'>;

/**
 * Owns transport state, not poker state. Only incoming snapshots change the
 * table; requests carry the revision actually displayed by their caller.
 */
export function createConnection(options: {
  url?: string;
  createSocket?: (url: string) => LiveSocket;
} = {}) {
  const url = getServerUrl(options.url);
  const createSocket = options.createSocket ?? ((address: string) => new WebSocket(address));
  let state: ConnectionState = {
    status: 'disconnected', playerId: null, snapshot: null, pending: null, error: null,
  };
  let socket: LiveSocket | null = null;
  let disposed = false;
  let requestCounter = 0;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<ConnectionState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  const releaseSocket = () => {
    const previous = socket;
    socket = null;
    if (!previous) return;
    previous.onopen = previous.onmessage = previous.onerror = previous.onclose = null;
    try {
      previous.close();
    } catch {
      // The socket is already invalidated, even if the browser cannot close it.
    }
  };

  const stop = (error: ConnectionError | null) => {
    releaseSocket();
    // Retain the last private snapshot for a read-only disconnected display.
    update({ status: 'disconnected', pending: null, error });
  };

  const send = (message: ClientMessage): boolean => {
    if (!socket || socket.readyState !== OPEN) {
      stop(CONNECTION_ERROR);
      return false;
    }
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch {
      stop(CONNECTION_ERROR);
      return false;
    }
  };

  const connect = (playerId: DevelopmentPlayerId) => {
    if (disposed) return;
    releaseSocket();
    update({
      status: 'connecting', playerId, pending: null, error: null,
      snapshot: state.playerId === playerId ? state.snapshot : null,
    });
    let current: LiveSocket;
    try {
      current = createSocket(url);
    } catch {
      stop(CONNECTION_ERROR);
      return;
    }
    socket = current;

    // Identity checks protect against events already queued before detaching
    // handlers from a replaced, disconnected, or disposed socket.
    current.onopen = () => {
      if (socket !== current || state.status !== 'connecting') return;
      update({ status: 'identifying' });
      send({ kind: 'identify', playerId });
    };
    current.onmessage = (event) => {
      if (socket !== current || (state.status !== 'identifying' && state.status !== 'connected')) return;
      const message = readServerMessage(event.data);
      if (!message) {
        stop(INVALID_RESPONSE);
        return;
      }
      if (message.kind === 'error') {
        const error = { code: message.code, message: message.message };
        if (state.status === 'identifying') stop(error);
        else if (state.pending) {
          if (message.replyTo === state.pending.requestId) update({ error, pending: null });
        } else if (message.replyTo === undefined) update({ error });
        return;
      }

      const view = message.snapshot;
      if (view.mySeat === null || view.seats[view.mySeat]?.player?.id !== playerId) {
        stop(INVALID_RESPONSE);
        return;
      }
      const initial = state.status === 'identifying';
      const acknowledged = state.pending !== null && message.replyTo === state.pending.requestId;
      // A deliberate new connection may see seq reset after a server restart.
      if (!initial && state.snapshot && view.seq < state.snapshot.seq) {
        if (acknowledged) update({ pending: null });
        return;
      }
      update({
        status: 'connected', snapshot: view, error: null,
        pending: acknowledged ? null : state.pending,
      });
    };
    current.onerror = () => {
      if (socket === current) stop(CONNECTION_ERROR);
    };
    current.onclose = () => {
      if (socket === current) stop(CONNECTION_ERROR);
    };
  };

  const submit = (message: RequestIntent): boolean => {
    const view = state.snapshot;
    if (disposed || state.status !== 'connected' || !view || state.pending || message.expectedSeq !== view.seq) {
      return false;
    }
    if (message.kind === 'deal' ? view.handStatus === 'playing' : tableControls(view) !== 'actions') {
      return false;
    }
    const requestId = ++requestCounter;
    update({ pending: { kind: message.kind, expectedSeq: message.expectedSeq, requestId }, error: null });
    return send({ ...message, requestId });
  };

  return {
    url,
    getState: () => state,
    subscribe: (listener: () => void) => {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    connect,
    disconnect: () => { if (!disposed) stop(null); },
    deal: (expectedSeq: number) => submit({ kind: 'deal', expectedSeq }),
    act: (action: PlayerAction, expectedSeq: number) => submit({ kind: 'act', expectedSeq, action }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      stop(null);
      listeners.clear();
    },
  };
}
