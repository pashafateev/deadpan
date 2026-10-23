import { DEVELOPMENT_PLAYERS } from '@deadpan/shared';
import type { ClientMessage, DevelopmentPlayerId, RequestErrorCode, ServerMessage, TableSnapshot } from '@deadpan/shared';
import { EngineAdapter, RejectedRequest } from './engine/adapter';

export interface Connection {
  send(message: ServerMessage): void;
}

interface RoomOptions {
  stacks?: readonly [number, number];
  randomProvider?: () => number;
}

export class TableRoom {
  private readonly engine: EngineAdapter;
  private readonly identities = new Map<Connection, DevelopmentPlayerId>();
  private readonly controllers = new Map<DevelopmentPlayerId, Connection>();
  private seq = 0;

  constructor(options: RoomOptions = {}) {
    this.engine = new EngineAdapter(DEVELOPMENT_PLAYERS.map((player, index) => ({
      ...player, stack: options.stacks?.[index] ?? 1000,
    })), { randomProvider: options.randomProvider });
  }

  receive(connection: Connection, message: ClientMessage): void {
    if (message.kind === 'identify') {
      this.identify(connection, message.playerId);
      return;
    }
    const playerId = this.identities.get(connection);
    if (!playerId) return this.error(connection, 'not-identified', 'Select a development player first.');
    if (message.expectedSeq !== this.seq) {
      return this.error(connection, 'stale-state', 'The table changed. Use the latest view and try again.');
    }
    try {
      if (message.kind === 'deal') {
        const view = this.engine.view(null);
        if (this.controllers.size !== DEVELOPMENT_PLAYERS.length
          || view.handStatus === 'playing'
          || view.seats.some((seat) => !seat.player || seat.player.stack <= 0)) {
          return this.error(connection, 'cannot-deal', 'Both players must be connected and have chips, with no hand in progress.');
        }
        this.engine.deal();
      } else {
        const player = DEVELOPMENT_PLAYERS.find((candidate) => candidate.id === playerId)!;
        this.engine.act(player.seat, message.action);
      }
      // No asynchronous work between checking the old version and committing
      // the next one. A duplicate request cannot pass against the same state.
      this.seq++;
      for (const [id, controller] of this.controllers) {
        controller.send({ kind: 'snapshot', snapshot: this.snapshot(id) });
      }
    } catch (error) {
      if (!(error instanceof RejectedRequest)) throw error;
      this.error(connection, error.code, error.message);
    }
  }

  disconnect(connection: Connection): void {
    const id = this.identities.get(connection);
    if (id && this.controllers.get(id) === connection) this.controllers.delete(id);
    this.identities.delete(connection);
  }

  private identify(connection: Connection, id: DevelopmentPlayerId): void {
    if (this.identities.has(connection)) {
      return this.error(connection, 'invalid-message', 'This connection already controls a player.');
    }
    if (!DEVELOPMENT_PLAYERS.some((player) => player.id === id)) {
      return this.error(connection, 'invalid-message', 'Unknown development player.');
    }
    if (this.controllers.has(id)) {
      return this.error(connection, 'player-in-use', 'That player is already controlled by another tab.');
    }
    this.identities.set(connection, id);
    this.controllers.set(id, connection);
    connection.send({ kind: 'snapshot', snapshot: this.snapshot(id) });
  }

  private snapshot(id: DevelopmentPlayerId): TableSnapshot {
    const viewer = DEVELOPMENT_PLAYERS.find((player) => player.id === id)!;
    const game = this.engine.view(viewer.seat);
    return {
      ...game,
      seq: this.seq,
      seats: game.seats.map((seat) => {
        const metadata = DEVELOPMENT_PLAYERS.find((player) => player.seat === seat.index);
        return {
          index: seat.index,
          player: seat.player && metadata ? {
            id: metadata.id, name: metadata.name, avatar: metadata.avatar, ...seat.player,
          } : null,
        };
      }),
      preAction: null,
      preActionsEnabled: false,
    };
  }

  private error(connection: Connection, code: RequestErrorCode, message: string): void {
    connection.send({ kind: 'error', code, message });
  }
}
