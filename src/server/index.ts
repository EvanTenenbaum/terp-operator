import http from 'node:http';
import type { Server as SocketServer } from 'socket.io';
import { createApp } from './app';
import { createSocketServer } from './sockets';
import { env } from './env';
import { pool } from './db';

let io: SocketServer;
const app = createApp(() => io);
const httpServer = http.createServer(app);
io = createSocketServer(httpServer);

io.on('connection', (socket) => {
  socket.emit('health:pulse', { checkedAt: new Date().toISOString(), status: 'ok' });
});

httpServer.listen(env.PORT, () => {
  console.log(`TERP Operator server listening on http://localhost:${env.PORT}`);
});

const shutdown = () => {
  console.log('TERP Operator shutting down gracefully...');
  httpServer.close(() => {
    pool.end().finally(() => process.exit(0));
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
