import { afterEach, describe, expect, test, vi } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import type { ClientMessage, ServerMessage, TableSnapshot } from '@deadpan/shared';
import { startLocalServer } from './server';
import { TableRoom } from './room';
import { ACES_BOARD, riggedRandom, seededRandom } from './engine/test-fixtures';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.restoreAllMocks();
});

type Intent = ClientMessage
  | Omit<Extract<ClientMessage, { kind: 'deal' }>, 'requestId'>
  | Omit<Extract<ClientMessage, { kind: 'act' }>, 'requestId'>;

async function start(room = new TableRoom({ randomProvider: seededRandom() })) {
  const server = await startLocalServer({ port: 0, room });
  cleanups.push(server.close);
  return server;
}

async function connect(port: number, origin?: string) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, origin === undefined ? {} : { origin });
  let requestCounter = 0;
  const queue: ServerMessage[] = [];
  let receive: ((message: ServerMessage) => void) | undefined;
  socket.on('message', (raw) => {
    const message: ServerMessage = JSON.parse(raw.toString());
    if (receive) { const resolve = receive; receive = undefined; resolve(message); }
    else queue.push(message);
  });
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  return {
    socket,
    send: (message: Intent | string) => {
      const wire = typeof message === 'string' || message.kind === 'identify' ? message : {
        ...message, requestId: 'requestId' in message ? message.requestId : ++requestCounter,
      };
      socket.send(typeof wire === 'string' ? wire : JSON.stringify(wire));
    },
    next: async (): Promise<ServerMessage> => {
      if (queue.length) return queue.shift()!;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { receive = undefined; reject(new Error('Expected a server message')); }, 2000);
        receive = (message) => { clearTimeout(timeout); resolve(message); };
      });
    },
    close: () => new Promise<void>((resolve) => {
      if (socket.readyState === WebSocket.CLOSED) return resolve();
      socket.once('close', () => resolve()); socket.close();
    }),
  };
}

async function snapshot(client: Awaited<ReturnType<typeof connect>>): Promise<TableSnapshot> {
  const message = await client.next();
  expect(message.kind).toBe('snapshot');
  if (message.kind !== 'snapshot') throw new Error('Expected snapshot');
  return message.snapshot;
}

async function players(port: number) {
  const a = await connect(port); const b = await connect(port);
  a.send({ kind: 'identify', playerId: 'dev-a' }); await snapshot(a);
  b.send({ kind: 'identify', playerId: 'dev-b' });
  await Promise.all([snapshot(a), snapshot(b)]);
  return { a, b };
}

describe('local WebSocket transport', () => {
  test('binds loopback only, rejects duplicate control, and resumes the current view on a fresh connection', async () => {
    const server = await start();
    expect(server.host).toBe('127.0.0.1');
    const { a, b } = await players(server.port);
    a.send({ kind: 'deal', expectedSeq: 0 });
    const [before] = await Promise.all([snapshot(a), snapshot(b)]);
    const duplicate = await connect(server.port);
    duplicate.send({ kind: 'identify', playerId: 'dev-a' });
    expect(await duplicate.next()).toMatchObject({ kind: 'error', code: 'player-in-use' });
    await a.close();
    const fresh = await connect(server.port);
    fresh.send({ kind: 'identify', playerId: 'dev-a' });
    expect(await snapshot(fresh)).toEqual(before);
  });

  test('a complete two-socket hand, rejection, payout and another deal use shared revisions and private views', async () => {
    const server = await start();
    const { a, b } = await players(server.port);
    a.send({ kind: 'deal', expectedSeq: 0 });
    let [av, bv] = await Promise.all([snapshot(a), snapshot(b)]);
    expect([av.seq, bv.seq]).toEqual([1, 1]);
    expect(av.seats[1]?.player?.cards.kind).toBe('hidden');
    expect(bv.seats[0]?.player?.cards.kind).toBe('hidden');
    b.send({ kind: 'act', expectedSeq: 1, action: { kind: 'call' } });
    expect(await b.next()).toMatchObject({ kind: 'error', code: 'not-your-turn' });
    a.send({ kind: 'act', expectedSeq: 1, action: { kind: 'call' } });
    [av, bv] = await Promise.all([snapshot(a), snapshot(b)]);
    a.send({ kind: 'act', expectedSeq: 1, action: { kind: 'call' } });
    expect(await a.next()).toMatchObject({ kind: 'error', code: 'stale-state' });
    for (let step = 0; av.handStatus === 'playing'; step++) {
      expect(step).toBeLessThan(20);
      const actor = av.turn!.seat === 0 ? a : b;
      const view = av.turn!.seat === 0 ? av : bv;
      actor.send({ kind: 'act', expectedSeq: view.seq, action: { kind: view.legalActions!.canCheck ? 'check' : 'call' } });
      [av, bv] = await Promise.all([snapshot(a), snapshot(b)]);
      expect(av.seq).toBe(bv.seq);
    }
    expect(av).toMatchObject({ handStatus: 'complete', street: 'showdown', turn: null, pots: [] });
    expect(av.seats.every((seat) => seat.player?.cards.kind === 'shown')).toBe(true);
    expect(av.seats.reduce((sum, seat) => sum + seat.player!.stack, 0)).toBe(2000);
    const finalStacks = av.seats.map((seat) => seat.player!.stack);
    b.send({ kind: 'deal', expectedSeq: bv.seq });
    [av, bv] = await Promise.all([snapshot(a), snapshot(b)]);
    expect(av.buttonSeat).toBe(1);
    expect(av.seats.map((seat) => seat.player!.stack)).toEqual([finalStacks[0]! - 10, finalStacks[1]! - 5]);
    expect(av.winners).toEqual([]);
  });

  test('malformed text, binary, spoofed identities and invalid amounts do not break the next valid request', async () => {
    const server = await start();
    const a = await connect(server.port);
    for (const raw of ['{', '{"kind":"identify","playerId":"unknown"}', '{"kind":"deal","expectedSeq":-1}']) {
      a.send(raw);
      expect(await a.next()).toEqual({ kind: 'error', code: 'invalid-message', message: 'Invalid message.' });
    }
    a.socket.send(Buffer.from('{}'));
    expect(await a.next()).toMatchObject({ kind: 'error', code: 'invalid-message' });
    a.send({ kind: 'identify', playerId: 'dev-a' });
    expect((await snapshot(a)).seq).toBe(0);
    const b = await connect(server.port);
    b.send({ kind: 'identify', playerId: 'dev-b' }); await Promise.all([snapshot(a), snapshot(b)]);
    a.send({ kind: 'deal', expectedSeq: 0 }); await Promise.all([snapshot(a), snapshot(b)]);
    a.send('{"kind":"act","expectedSeq":1,"requestId":200,"playerId":"dev-b","action":{"kind":"fold"}}');
    expect(await a.next()).toMatchObject({ kind: 'error', code: 'invalid-message' });
    a.send('{"kind":"act","expectedSeq":1,"requestId":201,"action":{"kind":"raise","to":60.5}}');
    expect(await a.next()).toMatchObject({ kind: 'error', code: 'invalid-message' });
    a.send({ kind: 'act', expectedSeq: 1, action: { kind: 'fold' } });
    const [av, bv] = await Promise.all([snapshot(a), snapshot(b)]);
    expect(av.seq).toBe(2); expect(bv.seq).toBe(2);
    expect(av.seats[1]?.player?.cards.kind).toBe('hidden');
    expect(av.winners[0]?.bestCards).toEqual([]);
  });

  test('all-in completion and a busted player are handled by the real server', async () => {
    const server = await start(new TableRoom({
      stacks: [100, 100], randomProvider: riggedRandom([['As', 'Ah'], ['Kc', 'Kd']], ACES_BOARD),
    }));
    const { a, b } = await players(server.port);
    a.send({ kind: 'deal', expectedSeq: 0 }); await Promise.all([snapshot(a), snapshot(b)]);
    a.send({ kind: 'act', expectedSeq: 1, action: { kind: 'raise', to: 100 } });
    await Promise.all([snapshot(a), snapshot(b)]);
    b.send({ kind: 'act', expectedSeq: 2, action: { kind: 'call' } });
    const [av, bv] = await Promise.all([snapshot(a), snapshot(b)]);
    expect(av).toMatchObject({ seq: 3, handStatus: 'complete', turn: null, board: expect.any(Array) });
    expect(av.board).toHaveLength(5);
    expect(av.seats.map((seat) => seat.player?.stack)).toEqual([200, 0]);
    b.send({ kind: 'deal', expectedSeq: bv.seq });
    expect(await b.next()).toMatchObject({ kind: 'error', code: 'cannot-deal' });
  });

  test('allows loopback browser origins and native clients, but rejects foreign and opaque origins', async () => {
    const server = await start();
    for (const origin of ['https://evil.example', 'http://localhost.evil.example:5173', 'null']) {
      await expect(connect(server.port, origin)).rejects.toThrow('Unexpected server response: 401');
    }
    const local = await connect(server.port, 'http://localhost:5174');
    local.send({ kind: 'identify', playerId: 'dev-a' });
    expect((await snapshot(local)).mySeat).toBe(0);
    const native = await connect(server.port);
    native.send({ kind: 'identify', playerId: 'dev-b' });
    await Promise.all([snapshot(local), snapshot(native)]);
  });

  test('server errors after listening are reported without crashing or dropping the table', async () => {
    const emit = vi.spyOn(WebSocketServer.prototype, 'emit');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const server = await start();
    const raw = emit.mock.contexts.find((value) => value instanceof WebSocketServer) as WebSocketServer | undefined;
    expect(raw).toBeDefined();
    expect(() => raw!.emit('error', new Error('Simulated accept failure: EMFILE'))).not.toThrow();
    expect(log).toHaveBeenCalledWith('Local WebSocket server error:', expect.any(Error));
    const { a, b } = await players(server.port);
    a.send({ kind: 'deal', expectedSeq: 0, requestId: 21 });
    const accepted = await a.next();
    expect(accepted).toMatchObject({ kind: 'snapshot', replyTo: 21, snapshot: { seq: 1 } });
    expect(await snapshot(b)).toMatchObject({ seq: 1, handStatus: 'playing' });
  });

  test('startup listen failures still reject rather than being swallowed by the runtime error handler', async () => {
    const server = await start();
    await expect(startLocalServer({ port: server.port })).rejects.toThrow('EADDRINUSE');
  });
});
