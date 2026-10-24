import WebSocket, { WebSocketServer } from 'ws';
import type { ServerMessage } from '@deadpan/shared';
import { InvalidMessage, parseClientMessage } from './protocol';
import { TableRoom, type Connection } from './room';
import { isLocalDevelopmentOrigin } from './origin';

interface ServerOptions {
  port?: number;
  room?: TableRoom;
}

/** Local-only unauthenticated development endpoint; no public host option. */
export async function startLocalServer({ port = 3001, room = new TableRoom() }: ServerOptions = {}) {
  const host = '127.0.0.1';
  const server = new WebSocketServer({
    host, port, maxPayload: 16 * 1024,
    verifyClient: ({ origin }: { origin?: string }) => isLocalDevelopmentOrigin(origin),
  });
  server.on('connection', (socket) => {
    const send = (message: ServerMessage) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message), (error) => { if (error) socket.terminate(); });
      }
    };
    const connection: Connection = { send, close: () => socket.close(1011, 'Table view unavailable.') };
    socket.on('error', () => socket.terminate());
    socket.on('close', () => room.disconnect(connection));
    socket.on('message', (data, binary) => {
      let replyTo: number | undefined;
      try {
        if (binary) throw new InvalidMessage();
        const message = parseClientMessage(data.toString());
        if (message.kind !== 'identify') replyTo = message.requestId;
        room.receive(connection, message);
      } catch (error) {
        if (error instanceof InvalidMessage) {
          send({
            kind: 'error', code: 'invalid-message', message: 'Invalid message.',
            ...(error.replyTo === undefined ? {} : { replyTo: error.replyTo }),
          });
        } else {
          // Never send an engine exception (which may include private state)
          // back over the connection.
          console.error('Local table request failed:', error);
          send({
            kind: 'error', code: 'internal-error', message: 'The table could not process that request.',
            ...(replyTo === undefined ? {} : { replyTo }),
          });
        }
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.once('listening', () => {
      server.off('error', reject);
      server.on('error', (error) => console.error('Local WebSocket server error:', error));
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a loopback TCP address');
  let closing: Promise<void> | undefined;
  return {
    host,
    port: address.port,
    close: () => closing ??= new Promise<void>((resolve, reject) => {
      for (const socket of server.clients) socket.terminate();
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}
