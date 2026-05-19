import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import type { Server as SocketServer } from 'socket.io';
import { appRouter } from './routers';
import { createContext } from './trpc';
import { sessionMiddleware } from './auth';
import { env, isProd } from './env';
import { getHealth } from './services/metrics';
import { registerHttpRoutes } from './routes';

export function createApp(getIo: () => SocketServer) {
  const app = express();

  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for Vite HMR in dev
          styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles
          imgSrc: ["'self'", "data:", "blob:"], // Allow data URIs and blob URLs
          connectSrc: ["'self'", "ws:", "wss:"], // Allow WebSocket for Socket.io and Vite HMR
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      }
    })
  );
  app.use(express.json({ limit: '4mb' }));
  app.use(sessionMiddleware);

  registerHttpRoutes(app);

  app.get('/api/health', async (_req, res) => {
    res.json(await getHealth());
  });

  app.get('/api/client-config', (_req, res) => {
    res.json({
      agGridLicenseKey: env.VITE_AG_GRID_LICENSE_KEY
    });
  });

  app.use(
    '/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext: ({ req, res }) => createContext({ req, res, io: getIo() })
    })
  );

  if (isProd) {
    const clientDist = path.resolve(process.cwd(), 'dist/client');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  } else {
    app.get('/', (_req, res) => res.redirect(env.APP_ORIGIN));
  }

  return app;
}
