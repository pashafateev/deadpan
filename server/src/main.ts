import { startLocalServer } from './server';

const port = Number(process.env.PORT ?? '3001');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

startLocalServer({ port }).then((server) => {
  console.log(`Local development poker server: ws://${server.host}:${server.port}`);
  console.log('Unauthenticated, in-memory development only. Restarting resets the table.');
  const stop = () => {
    void server.close().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}).catch((error: unknown) => {
  console.error('Cannot start the local poker server:', error);
  process.exitCode = 1;
});
