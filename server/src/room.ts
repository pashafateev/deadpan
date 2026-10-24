import { DEVELOPMENT_PLAYERS } from '@deadpan/shared';
import type { ClientMessage, DevelopmentPlayerId, RequestErrorCode, ServerMessage, TableSnapshot } from '@deadpan/shared';
import { EngineAdapter, RejectedRequest } from './engine/adapter';

export interface Connection {
  send(message: ServerMessage): void;
  /** Close an unusable view/transport so the client cannot keep acting stale. */
  close(): void;
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
    if (!playerId) return this.error(connection, 'not-identified', 'Select a development player first.', message.requestId);
    if (message.expectedSeq !== this.seq) {
      return this.error(connection, 'stale-state', 'The table changed. Use the latest view and try again.', message.requestId);
    }
    try {
      if (message.kind === 'deal') {
        const view = this.engine.view(null);
        if (this.controllers.size !== DEVELOPMENT_PLAYERS.length
          || view.handStatus === 'playing'
          || view.seats.some((seat) => !seat.player || seat.player.stack <= 0)) {
          return this.error(connection, 'cannot-deal', 'Both players must be connected and have chips, with no hand in progress.', message.requestId);
        }
        this.engine.deal();
      } else {
        const player = DEVELOPMENT_PLAYERS.find((candidate) => candidate.id === playerId)!;
        this.engine.act(player.seat, message.action);
      }
    } catch (error) {
      if (!(error instanceof RejectedRequest)) throw error;
      this.error(connection, error.code, error.message, message.requestId);
      return;
    }
    // Once applied, publication cannot turn the accepted action into a reported
    // rejection. Failed viewers are closed independently; healthy peers advance.
    this.seq++;
    this.publish({ connection, requestId: message.requestId });
  }

  disconnect(connection: Connection): void {
    if (this.remove(connection)) this.publish();
  }

  private remove(connection: Connection): boolean {
    const id = this.identities.get(connection);
    if (!id) return false;
    if (id && this.controllers.get(id) === connection) this.controllers.delete(id);
    this.identities.delete(connection);
    return true;
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
    this.publish();
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
            status: this.controllers.has(metadata.id) ? seat.player.status : 'disconnected',
          } : null,
        };
      }),
      preAction: null,
      preActionsEnabled: false,
    };
  }

  private publish(receipt?: { connection: Connection; requestId: number }): void {
    while (this.controllers.size > 0) {
      const failed: Connection[] = [];
      for (const [id, controller] of this.controllers) {
        try {
          controller.send({
            kind: 'snapshot', snapshot: this.snapshot(id),
            ...(controller === receipt?.connection ? { replyTo: receipt.requestId } : {}),
          });
        } catch (error) {
          console.error('Could not publish local table view:', error);
          failed.push(controller);
        }
      }
      if (failed.length === 0) return;
      for (const controller of failed) this.drop(controller);
      // Notify surviving peers of lost presence at the same game revision.
      // Each retry removes at least one failed controller, so this is bounded.
      receipt = undefined;
    }
  }

  private drop(connection: Connection): void {
    this.remove(connection);
    try {
      connection.close();
    } catch (error) {
      console.error('Could not close local table connection:', error);
    }
  }

  private error(connection: Connection, code: RequestErrorCode, message: string, replyTo?: number): void {
    try {
      connection.send({ kind: 'error', code, message, ...(replyTo === undefined ? {} : { replyTo }) });
    } catch (error) {
      console.error('Could not send local table error:', error);
      this.drop(connection);
      this.publish();
    }
  }
}
