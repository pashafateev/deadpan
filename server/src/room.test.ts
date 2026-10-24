import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ClientMessage, ServerMessage, TableSnapshot } from '@deadpan/shared';
import { TableRoom, type Connection } from './room';
import { EngineAdapter } from './engine/adapter';
import { ACES_BOARD, riggedRandom, seededRandom } from './engine/test-fixtures';

type Intent = Extract<ClientMessage, { kind: 'identify' }>
  | Omit<Extract<ClientMessage, { kind: 'deal' }>, 'requestId'>
  | Omit<Extract<ClientMessage, { kind: 'act' }>, 'requestId'>;
const request = (message: Intent, requestId = 1): ClientMessage =>
  message.kind === 'identify' ? message : { ...message, requestId };
afterEach(() => vi.restoreAllMocks());

function client() {
  const messages: ServerMessage[] = [];
  const close = vi.fn();
  const connection: Connection = { send: (message) => messages.push(JSON.parse(JSON.stringify(message))), close };
  const snapshot = () => messages.filter((message) => message.kind === 'snapshot').at(-1)!.snapshot;
  return { connection, messages, close, snapshot, last: () => messages.at(-1) };
}
function fixture(options: ConstructorParameters<typeof TableRoom>[0] = {}) {
  const room = new TableRoom({ randomProvider: seededRandom(), ...options });
  const a = client();
  const b = client();
  let requestId = 0;
  const send = (who: typeof a, message: Intent) => room.receive(who.connection, request(message, ++requestId));
  send(a, { kind: 'identify', playerId: 'dev-a' });
  send(b, { kind: 'identify', playerId: 'dev-b' });
  const deal = () => send(a, { kind: 'deal', expectedSeq: a.snapshot().seq });
  const act = (who: typeof a, action: Extract<ClientMessage, { kind: 'act' }>['action'], seq = who.snapshot().seq) =>
    send(who, { kind: 'act', action, expectedSeq: seq });
  return { room, a, b, send, deal, act };
}

describe('TableRoom', () => {
  test('identification gives fixed IDs and private viewer seats without dealing or advancing seq', () => {
    const { a, b } = fixture();
    expect(a.snapshot()).toMatchObject({ seq: 0, mySeat: 0, handStatus: 'waiting', preActionsEnabled: false, preAction: null });
    expect(b.snapshot()).toMatchObject({ seq: 0, mySeat: 1 });
    expect(a.snapshot().seats.map((seat) => seat.player?.id)).toEqual(['dev-a', 'dev-b']);
    expect(a.snapshot().seats.map((seat) => seat.player?.name)).toEqual(['Alex', 'Sam']);
  });

  test('a manual deal needs both controllers; another join does not reset anything', () => {
    const room = new TableRoom();
    const a = client(); const b = client();
    room.receive(a.connection, { kind: 'identify', playerId: 'dev-a' });
    room.receive(a.connection, { kind: 'deal', expectedSeq: 0, requestId: 1 });
    expect(a.last()).toMatchObject({ kind: 'error', code: 'cannot-deal' });
    room.receive(b.connection, { kind: 'identify', playerId: 'dev-b' });
    expect(b.snapshot().seq).toBe(0);
    room.receive(a.connection, { kind: 'deal', expectedSeq: 0, requestId: 2 });
    expect(a.snapshot()).toMatchObject({ seq: 1, handStatus: 'playing', turn: { seat: 0, clock: null } });
    expect(b.snapshot().seq).toBe(1);
  });

  test('rejects duplicate controllers without evicting the existing player', () => {
    const { room, a, deal, act } = fixture();
    const other = client();
    room.receive(other.connection, { kind: 'identify', playerId: 'dev-a' });
    expect(other.last()).toMatchObject({ kind: 'error', code: 'player-in-use' });
    deal(); act(a, { kind: 'call' });
    expect(a.snapshot().seq).toBe(2);
    room.receive(a.connection, { kind: 'identify', playerId: 'dev-b' });
    expect(a.last()).toMatchObject({ kind: 'error', code: 'invalid-message' });
  });

  test('rejects unidentified, out-of-turn, illegal, stale, and duplicate actions without mutations', () => {
    const { room, a, b, deal, act, send } = fixture();
    const stranger = client();
    room.receive(stranger.connection, { kind: 'deal', expectedSeq: 0, requestId: 1 });
    expect(stranger.last()).toMatchObject({ kind: 'error', code: 'not-identified' });
    deal();
    const before = a.snapshot();
    act(b, { kind: 'call' });
    expect(b.last()).toMatchObject({ kind: 'error', code: 'not-your-turn' });
    act(a, { kind: 'check' });
    expect(a.last()).toMatchObject({ kind: 'error', code: 'illegal-action' });
    expect(a.snapshot()).toEqual(before);
    act(a, { kind: 'call' }, 1);
    expect(a.snapshot().seq).toBe(2);
    act(a, { kind: 'call' }, 1);
    expect(a.last()).toMatchObject({ kind: 'error', code: 'stale-state' });
    send(b, { kind: 'deal', expectedSeq: 1 });
    expect(b.last()).toMatchObject({ kind: 'error', code: 'stale-state' });
    expect(b.snapshot().seq).toBe(2);
    act(b, { kind: 'check' });
    expect(a.snapshot()).toMatchObject({ seq: 3, street: 'flop', turn: { seat: 1, clock: null } });
  });

  test('completed fold carries stacks into a manually dealt hand with the next button', () => {
    const { a, b, deal, act, send } = fixture();
    deal();
    send(a, { kind: 'deal', expectedSeq: 1 });
    expect(a.last()).toMatchObject({ kind: 'error', code: 'cannot-deal' });
    act(a, { kind: 'fold' });
    expect(a.snapshot()).toMatchObject({ seq: 2, handStatus: 'complete', turn: null, legalActions: null, pots: [] });
    expect(a.snapshot().seats.map((seat) => seat.player?.stack)).toEqual([995, 1005]);
    expect(b.snapshot().winners[0]).toMatchObject({ seat: 1, amount: 10, bestCards: [] });
    deal();
    expect(a.snapshot()).toMatchObject({ seq: 3, buttonSeat: 1, street: 'preflop', winners: [] });
    expect(a.snapshot().seats.map((seat) => seat.player?.stack)).toEqual([985, 1000]);
  });

  test('all-ins settle automatically, clear live bets, and stop further deals after a bust', () => {
    const { a, b, deal, act, send } = fixture({
      stacks: [100, 100],
      randomProvider: riggedRandom([['As', 'Ah'], ['Kc', 'Kd']], ACES_BOARD),
    });
    deal(); act(a, { kind: 'raise', to: 100 }); act(b, { kind: 'call' });
    expect(a.snapshot()).toMatchObject({ seq: 3, handStatus: 'complete', turn: null, pots: [], legalActions: null });
    expect(a.snapshot().board).toHaveLength(5);
    expect(a.snapshot().seats.map((seat) => seat.player?.bet)).toEqual([0, 0]);
    expect(a.snapshot().seats.map((seat) => seat.player?.stack)).toEqual([200, 0]);
    send(a, { kind: 'deal', expectedSeq: 3 });
    expect(a.last()).toMatchObject({ kind: 'error', code: 'cannot-deal' });
    expect(a.snapshot().seq).toBe(3);
  });

  test('close releases only the controller; a fresh connection receives the same unfinished hand', () => {
    const { room, a, b, deal } = fixture();
    deal();
    const before = a.snapshot();
    room.disconnect(a.connection);
    const fresh = client();
    room.receive(fresh.connection, { kind: 'identify', playerId: 'dev-a' });
    expect(fresh.snapshot()).toEqual(before);
    expect(b.snapshot().seq).toBe(1);
    room.receive(a.connection, { kind: 'act', expectedSeq: 1, requestId: 2, action: { kind: 'fold' } });
    expect(a.last()).toMatchObject({ kind: 'error', code: 'not-identified' });
  });

  test('outgoing JSON views never include engine state or opponents secret cards', () => {
    const { a, b, deal, act } = fixture({ randomProvider: riggedRandom([['As', 'Ah'], ['Kc', 'Kd']], ACES_BOARD) });
    deal();
    for (const [viewer, own, other] of [[a, 0, 1], [b, 1, 0]] as const) {
      const snapshot: TableSnapshot = JSON.parse(JSON.stringify(viewer.snapshot()));
      expect(snapshot.seats[own]?.player?.cards.kind).toBe('shown');
      expect(snapshot.seats[other]?.player?.cards).toEqual({ kind: 'hidden' });
      for (const key of ['deck', 'config', 'actionHistory', 'previousStates']) expect(snapshot).not.toHaveProperty(key);
      expect(Object.keys(snapshot.seats[own]!.player!).sort()).toEqual(['avatar', 'bet', 'cards', 'id', 'name', 'stack', 'status']);
    }
    act(a, { kind: 'fold' });
    expect(a.snapshot().seats[1]?.player?.cards.kind).toBe('hidden');
    expect(b.snapshot().seats[0]?.player?.cards.kind).toBe('none');
    expect(a.snapshot().winners[0]?.bestCards).toEqual([]);
  });

  test('only the requester receives a correlated reply; peers receive unsolicited updates', () => {
    const { room, a, b } = fixture();
    room.receive(a.connection, { kind: 'deal', expectedSeq: 0, requestId: 40 });
    expect(a.last()).toMatchObject({ kind: 'snapshot', replyTo: 40 });
    expect(b.last()).not.toHaveProperty('replyTo');
    room.receive(a.connection, { kind: 'deal', expectedSeq: 0, requestId: 41 });
    expect(a.last()).toMatchObject({ kind: 'error', code: 'stale-state', replyTo: 41 });
  });

  test('presence changes notify peers at the same game revision and preserve the actor and chips', () => {
    const { room, a, b, deal } = fixture();
    deal();
    const before = a.snapshot();
    room.disconnect(b.connection);
    expect(a.snapshot()).toMatchObject({ seq: before.seq, turn: before.turn, handStatus: 'playing' });
    expect(a.snapshot().seats[1]?.player?.status).toBe('disconnected');
    expect(a.snapshot().seats.map((seat) => seat.player?.stack)).toEqual(before.seats.map((seat) => seat.player?.stack));
    expect(a.last()).not.toHaveProperty('replyTo');
    const fresh = client();
    room.receive(fresh.connection, { kind: 'identify', playerId: 'dev-b' });
    expect(a.snapshot().seats[1]?.player?.status).toBe('active');
    expect(a.snapshot().seq).toBe(before.seq);
    expect(fresh.snapshot().seq).toBe(before.seq);
  });

  test('a post-commit view failure cannot abort peer publication or falsely reject the applied action', () => {
    const { room, a, b, deal } = fixture();
    deal();
    const original = EngineAdapter.prototype.view;
    let fail = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(EngineAdapter.prototype, 'view').mockImplementation(function (this: EngineAdapter, seat) {
      if (seat === 0 && fail) { fail = false; throw new Error('Private view construction detail'); }
      return original.call(this, seat);
    });
    expect(() => room.receive(a.connection, { kind: 'act', expectedSeq: 1, requestId: 99, action: { kind: 'call' } })).not.toThrow();
    expect(a.close).toHaveBeenCalledOnce();
    expect(a.messages.some((message) => message.kind === 'error' && message.code === 'internal-error')).toBe(false);
    expect(b.snapshot().seq).toBe(2);
    expect(b.snapshot().seats[0]?.player).toMatchObject({ bet: 10, stack: 990, status: 'disconnected' });
    const fresh = client();
    room.receive(fresh.connection, { kind: 'identify', playerId: 'dev-a' });
    expect(fresh.snapshot()).toMatchObject({ seq: 2, turn: { seat: 1, clock: null } });
  });

  test('one connection throwing during send cannot prevent the other controller from seeing the committed revision', () => {
    const { room, a, b, deal } = fixture();
    deal();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(a.connection, 'send').mockImplementationOnce(() => { throw new Error('Failed socket'); });
    expect(() => room.receive(a.connection, { kind: 'act', expectedSeq: 1, requestId: 20, action: { kind: 'call' } })).not.toThrow();
    expect(a.close).toHaveBeenCalledOnce();
    expect(b.snapshot().seq).toBe(2);
    expect(b.snapshot().seats[0]?.player?.status).toBe('disconnected');
  });
});
