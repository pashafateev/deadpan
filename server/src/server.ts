import WebSocket, { WebSocketServer } from 'ws';
import type { ServerMessage } from '@deadpan/shared';
import { InvalidMessage, parseClientMessage } from './protocol';
import { TableRoom, type Connection } from './room';

interface ServerOptions {
  port?: number;
  room?: TableRoom;
}

/** Local-only unauthenticated development endpoint; no public host option. */
export async function startLocalServer({ port = 3001, room = new TableRoom() }: ServerOptions = {}) {
  const host = '127.0.0.1';
  const server = new WebSocketServer({ host, port, maxPayload: 16 * 1024 });
  server.on('connection', (socket) => {
    const send = (message: ServerMessage) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message), (error) => { if (error) socket.terminate(); });
      }
    };
    const connection: Connection = { send };
    socket.on('error', () => socket.terminate());
    socket.on('close', () => room.disconnect(connection));
    socket.on('message', (data, binary) => {
      try {
        if (binary) throw new InvalidMessage();
        room.receive(connection, parseClientMessage(data.toString()));
      } catch (error) {
        if (error instanceof InvalidMessage) {
          send({ kind: 'error', code: 'invalid-message', message: 'Invalid message.' });
        } else {
          // Never send an engine exception (which may include private state)
          // back over the connection.
          console.error('Local table request failed:', error);
          send({ kind: 'error', code: 'internal-error', message: 'The table could not process that request.' });
        }
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.once('listening', () => { server.off('error', reject); resolve(); });
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
