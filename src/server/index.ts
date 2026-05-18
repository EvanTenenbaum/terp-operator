import http from 'node:http';
import type { Server as SocketServer } from 'socket.io';
import { createApp } from './app';
import { createSocketServer } from './sockets';
import { env } from './env';

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
