import http from 'node:http';
import type { Server as SocketServer } from 'socket.io';
import { createApp } from './app';
import { createSocketServer } from './sockets';
import { env } from './env';
import { pool } from './db';
import { startBackgroundWorkers, stopBackgroundWorkers } from './services/backgroundWorkers';

let io: SocketServer;
const app = createApp(() => io);
const httpServer = http.createServer(app);
io = createSocketServer(httpServer);

io.on('connection', (socket) => {
  socket.emit('health:pulse', { checkedAt: new Date().toISOString(), status: 'ok' });
});

httpServer.listen(env.PORT, () => {
  console.log(`TERP Operator server listening on http://localhost:${env.PORT}`);
  // EXT-REVIEW 2026-06 finding #4: start the in-process background workers
  // (credit recompute drain, stuck-row reaper, nightly audit + reconciliation).
  // Gate with BACKGROUND_WORKERS=false when an external scheduler owns these.
  startBackgroundWorkers(pool);
});

const shutdown = () => {
  console.log('TERP Operator shutting down gracefully...');
  stopBackgroundWorkers();
  httpServer.close(() => {
    pool.end().finally(() => process.exit(0));
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
