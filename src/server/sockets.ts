import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { SessionData } from 'express-session';
import { env, isProd } from './env';
import { sessionMiddleware, getSessionUser } from './auth';

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: isProd
      ? undefined
      : {
          origin: env.APP_ORIGIN,
          credentials: true
        }
  });

  // Wrap session middleware for Socket.io
  io.use((socket, next) => {
    const req = socket.request as any;
    const res = {} as any; // Socket.io doesn't provide a response object
    sessionMiddleware(req, res, async (err?: any) => {
      if (err) return next(err);

      // Check if user is authenticated
      try {
        const user = await getSessionUser(req);
        if (!user) {
          return next(new Error('Authentication required'));
        }
        // Store user info on socket for later use
        socket.data.user = user;
        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });
  });

  return io;
}
