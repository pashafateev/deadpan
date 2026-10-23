import { describe, expect, test, vi } from 'vitest';
import { createConnection, getServerUrl } from './connection';
import { connected, playing, setup, snapshot } from './connection.test-support';

describe('server URL selection', () => {
  test('uses loopback by default and accepts a configured server, not the page origin', () => {
    expect(getServerUrl()).toBe('ws://127.0.0.1:3001');
    expect(getServerUrl('   ')).toBe('ws://127.0.0.1:3001');
    expect(getServerUrl(' ws://localhost:4567 ')).toBe('ws://localhost:4567');
    const { connection, createSocket } = setup('ws://localhost:4567');
    connection.connect('dev-b');
    expect(createSocket).toHaveBeenCalledWith('ws://localhost:4567');
  });
});

describe('connection lifecycle and identification', () => {
  test('does not connect automatically and has stable observable state between updates', () => {
    const { connection, createSocket } = setup();
    const state = connection.getState();
    expect(state).toMatchObject({ status: 'disconnected', snapshot: null, pending: null, error: null });
    expect(connection.getState()).toBe(state);
    expect(createSocket).not.toHaveBeenCalled();
    expect(connection.deal(0)).toBe(false);
    expect(connection.act({ kind: 'fold' }, 0)).toBe(false);
  });

  test('identifies once after opening and waits for the private snapshot before enabling requests', () => {
    const { connection, sockets } = setup();
    connection.connect('dev-b');
    const socket = sockets[0]!;
    expect(connection.getState()).toMatchObject({ status: 'connecting', playerId: 'dev-b' });
    expect(socket.sent).toEqual([]);
    socket.open();
    socket.open();
    expect(socket.messages()).toEqual([{ kind: 'identify', playerId: 'dev-b' }]);
    expect(connection.getState().status).toBe('identifying');
    expect(connection.deal(0)).toBe(false);
    socket.message({ kind: 'snapshot', snapshot: snapshot({ mySeat: 1 }) });
    expect(connection.getState()).toMatchObject({
      status: 'connected', playerId: 'dev-b', snapshot: snapshot({ mySeat: 1 }), pending: null,
    });
  });

  test('notifies subscribers only on updates and supports unsubscribing', () => {
    const { connection } = setup();
    const listener = vi.fn();
    const unsubscribe = connection.subscribe(listener);
    connection.connect('dev-a');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    connection.disconnect();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('surfaces an identify rejection, closes that socket, and allows selecting the other player', () => {
    const { connection, sockets } = setup();
    connection.connect('dev-a');
    sockets[0]!.open();
    sockets[0]!.message({ kind: 'error', code: 'player-in-use', message: 'Alex is already connected.' });
    expect(connection.getState()).toMatchObject({
      status: 'disconnected', pending: null,
      error: { code: 'player-in-use', message: 'Alex is already connected.' },
    });
    expect(sockets[0]!.close).toHaveBeenCalledTimes(1);
    connection.connect('dev-b');
    sockets[1]!.open();
    sockets[1]!.message({ kind: 'snapshot', snapshot: snapshot({ mySeat: 1 }) });
    expect(connection.getState().status).toBe('connected');
  });

  test('reports socket creation failure without exposing thrown details', () => {
    const connection = createConnection({
      createSocket: () => { throw new Error('private implementation detail'); },
    });
    expect(() => connection.connect('dev-a')).not.toThrow();
    expect(connection.getState()).toMatchObject({ status: 'disconnected', pending: null });
    expect(connection.getState().error?.message).not.toContain('private implementation detail');
    expect(connection.getState().error?.code).toBe('connection-error');
  });
});

describe('authoritative requests and revisions', () => {
  test('tags a deal with the displayed revision, allows only one pending request, and never deals optimistically', () => {
    const { connection, socket } = connected();
    const before = connection.getState().snapshot;
    expect(connection.deal(0)).toBe(true);
    expect(connection.getState().pending).toEqual({ kind: 'deal', expectedSeq: 0 });
    expect(connection.getState().snapshot).toBe(before);
    expect(connection.deal(0)).toBe(false);
    expect(connection.act({ kind: 'fold' }, 0)).toBe(false);
    expect(socket.messages()).toEqual([
      { kind: 'identify', playerId: 'dev-a' }, { kind: 'deal', expectedSeq: 0 },
    ]);
    socket.message({ kind: 'snapshot', snapshot: snapshot() });
    expect(connection.getState().pending).not.toBeNull();
    socket.message({ kind: 'snapshot', snapshot: playing() });
    expect(connection.getState()).toMatchObject({ snapshot: playing(), pending: null });
  });

  test('tags actions without identity and waits for a newer authoritative snapshot', () => {
    const { connection, socket } = connected(playing());
    const before = connection.getState().snapshot;
    expect(connection.act({ kind: 'raise', to: 60 }, 1)).toBe(true);
    expect(connection.getState().snapshot).toBe(before);
    expect(connection.getState().pending).toEqual({ kind: 'act', expectedSeq: 1 });
    expect(connection.act({ kind: 'fold' }, 1)).toBe(false);
    expect(socket.messages()[1]).toEqual({ kind: 'act', expectedSeq: 1, action: { kind: 'raise', to: 60 } });
    socket.message({ kind: 'snapshot', snapshot: playing({ seq: 2, turn: { seat: 1, clock: null }, legalActions: null }) });
    expect(connection.getState().pending).toBeNull();
    expect(connection.getState().snapshot?.seq).toBe(2);
  });

  test('rejects callbacks from an older rendered revision rather than tagging them with the latest revision', () => {
    const { connection, socket } = connected(playing({ seq: 3 }));
    expect(connection.act({ kind: 'call' }, 2)).toBe(false);
    expect(connection.deal(2)).toBe(false);
    expect(socket.sent).toHaveLength(1);
    expect(connection.getState().pending).toBeNull();
  });

  test('does not submit betting for a waiting, completed, nonacting, or nonactionable viewer', () => {
    for (const view of [
      snapshot(),
      playing({ handStatus: 'complete' }),
      playing({ turn: { seat: 1, clock: null } }),
      playing({ legalActions: null }),
    ]) {
      const { connection, socket } = connected(view);
      expect(connection.act({ kind: 'fold' }, view.seq)).toBe(false);
      expect(socket.sent).toHaveLength(1);
    }
  });

  test('offers manual dealing only outside an active hand and leaves funds/connections to server validation', () => {
    const active = connected(playing());
    expect(active.connection.deal(1)).toBe(false);
    const complete = connected(snapshot({ seq: 8, handStatus: 'complete' }));
    expect(complete.connection.deal(8)).toBe(true);
  });

  test('shows request errors without changing the snapshot, clears pending, and permits retry', () => {
    const { connection, socket } = connected();
    const before = connection.getState().snapshot;
    connection.deal(0);
    socket.message({ kind: 'error', code: 'cannot-deal', message: 'Both players must be connected.' });
    expect(connection.getState()).toMatchObject({
      status: 'connected', pending: null,
      error: { code: 'cannot-deal', message: 'Both players must be connected.' },
    });
    expect(connection.getState().snapshot).toBe(before);
    expect(connection.deal(0)).toBe(true);
    expect(connection.getState().error).toBeNull();
  });

  test('ignores older snapshots within the same connection', () => {
    const { connection, socket } = connected(playing({ seq: 5 }));
    const before = connection.getState().snapshot;
    connection.act({ kind: 'call' }, 5);
    socket.message({ kind: 'snapshot', snapshot: snapshot({ seq: 4 }) });
    expect(connection.getState().snapshot).toBe(before);
    expect(connection.getState().pending).not.toBeNull();
  });

  test('accepts unsolicited authoritative updates without submitting or calculating anything', () => {
    const { connection, socket } = connected();
    socket.message({ kind: 'snapshot', snapshot: playing({ seq: 9 }) });
    expect(connection.getState().snapshot).toEqual(playing({ seq: 9 }));
    expect(socket.messages()).toEqual([{ kind: 'identify', playerId: 'dev-a' }]);
  });
});

describe('disconnect, replacement, and disposal', () => {
  test('connection loss retains the last snapshot, clears pending, and disables submissions without reconnecting', () => {
    const { connection, socket, createSocket } = connected(playing());
    const before = connection.getState().snapshot;
    connection.act({ kind: 'fold' }, 1);
    socket.closed();
    expect(connection.getState()).toMatchObject({ status: 'disconnected', pending: null });
    expect(connection.getState().snapshot).toBe(before);
    expect(connection.getState().error?.code).toBe('connection-error');
    expect(connection.deal(1)).toBe(false);
    expect(connection.act({ kind: 'fold' }, 1)).toBe(false);
    expect(createSocket).toHaveBeenCalledTimes(1);
  });

  test('manual disconnect is silent, retains display, and disables requests', () => {
    const { connection, socket } = connected(playing());
    const before = connection.getState().snapshot;
    connection.disconnect();
    expect(connection.getState()).toMatchObject({ status: 'disconnected', pending: null, error: null });
    expect(connection.getState().snapshot).toBe(before);
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(connection.act({ kind: 'fold' }, 1)).toBe(false);
  });

  test('reports socket errors and send failures safely without changing game data', () => {
    const failed = connected(playing());
    failed.socket.fail();
    expect(failed.connection.getState().status).toBe('disconnected');
    expect(failed.socket.close).toHaveBeenCalledTimes(1);
    const { connection, socket } = connected(playing());
    const before = connection.getState().snapshot;
    socket.send.mockImplementation(() => { throw new Error('private failure'); });
    expect(() => connection.act({ kind: 'call' }, 1)).not.toThrow();
    expect(connection.getState()).toMatchObject({ status: 'disconnected', pending: null });
    expect(connection.getState().snapshot).toBe(before);
    expect(connection.getState().error?.message).not.toContain('private failure');
  });

  test('does not send if the socket has already stopped being open', () => {
    const { connection, socket } = connected(playing());
    socket.readyState = 2;
    expect(connection.act({ kind: 'call' }, 1)).toBe(false);
    expect(socket.sent).toHaveLength(1);
    expect(connection.getState().status).toBe('disconnected');
  });

  test('manual reconnect waits for identity and accepts a reset server revision', () => {
    const { connection, socket, sockets } = connected(playing({ seq: 12 }));
    socket.closed();
    connection.connect('dev-a');
    expect(connection.getState().snapshot?.seq).toBe(12);
    expect(connection.act({ kind: 'call' }, 12)).toBe(false);
    sockets[1]!.open();
    expect(connection.getState().status).toBe('identifying');
    sockets[1]!.message({ kind: 'snapshot', snapshot: snapshot() });
    expect(connection.getState()).toMatchObject({ status: 'connected', snapshot: snapshot() });
  });

  test('replacing an identity clears its private view and ignores all late events from the old socket', () => {
    const { connection, socket, sockets } = connected(playing());
    const late = {
      open: socket.onopen, message: socket.onmessage, error: socket.onerror, close: socket.onclose,
    };
    connection.connect('dev-b');
    expect(connection.getState().snapshot).toBeNull();
    expect(socket.close).toHaveBeenCalledTimes(1);
    sockets[1]!.open();
    sockets[1]!.message({ kind: 'snapshot', snapshot: snapshot({ mySeat: 1 }) });
    const before = connection.getState();
    late.open?.(new Event('open'));
    late.message?.({ data: JSON.stringify({ kind: 'snapshot', snapshot: playing({ seq: 99 }) }) } as MessageEvent);
    late.error?.(new Event('error'));
    late.close?.({} as CloseEvent);
    expect(connection.getState()).toBe(before);
    expect(socket.sent).toHaveLength(1);
  });

  test('disposal closes and invalidates the socket, including already queued callbacks', () => {
    const { connection, socket, createSocket } = connected(playing());
    const lateMessage = socket.onmessage;
    const lateClose = socket.onclose;
    connection.dispose();
    const before = connection.getState();
    lateMessage?.({ data: JSON.stringify({ kind: 'snapshot', snapshot: playing({ seq: 99 }) }) } as MessageEvent);
    lateClose?.({} as CloseEvent);
    connection.connect('dev-b');
    expect(connection.getState()).toBe(before);
    expect(connection.getState().status).toBe('disconnected');
    expect(connection.act({ kind: 'call' }, 1)).toBe(false);
    expect(createSocket).toHaveBeenCalledTimes(1);
  });
});

describe('unexpected network responses', () => {
  test.each([
    'not JSON',
    'null',
    '{"kind":"unknown"}',
    '{"kind":"error","code":"cannot-deal","message":{"secret":"not a string"}}',
    '{"kind":"error","code":"unknown","message":"not a known error"}',
    '{"kind":"snapshot","snapshot":{"seq":2}}',
    JSON.stringify({ kind: 'snapshot', snapshot: playing({ seq: -1 }) }),
    JSON.stringify({ kind: 'snapshot', snapshot: playing({ turn: { seat: 0, clock: { startedAt: 0, durationMs: 0, timeBankMs: 0 } } }) }),
  ])('fails closed on malformed input without replacing the previous snapshot: %s', (data) => {
    const { connection, socket } = connected(playing());
    const before = connection.getState().snapshot;
    connection.act({ kind: 'call' }, 1);
    expect(() => socket.receive(data)).not.toThrow();
    expect(connection.getState()).toMatchObject({ status: 'disconnected', pending: null });
    expect(connection.getState().error?.code).toBe('invalid-response');
    expect(connection.getState().snapshot).toBe(before);
  });

  test('does not accept a private snapshot belonging to a different player', () => {
    const { connection, sockets } = setup();
    connection.connect('dev-a');
    sockets[0]!.open();
    sockets[0]!.message({ kind: 'snapshot', snapshot: snapshot({ mySeat: 1 }) });
    expect(connection.getState()).toMatchObject({ status: 'disconnected', snapshot: null });
    expect(connection.getState().error?.code).toBe('invalid-response');
  });
});
