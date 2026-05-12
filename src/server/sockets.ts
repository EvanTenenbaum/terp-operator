import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env, isProd } from './env';

export function createSocketServer(httpServer: HttpServer) {
  return new Server(httpServer, {
    cors: isProd
      ? undefined
      : {
          origin: env.APP_ORIGIN,
          credentials: true
        }
  });
}
