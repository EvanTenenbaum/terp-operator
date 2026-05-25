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
  // GH #314: 'unsafe-inline' in scriptSrc is removed in production.
  // In development, Vite HMR injects inline <script> tags, so 'unsafe-inline'
  // is required for the local dev workflow to work. In production, all scripts
  // are bundled and served as external files — 'unsafe-inline' is a genuine XSS
  // risk there and must be omitted. A nonce-based approach could tighten this
  // further for any runtime-injected scripts, but since TERP Operator serves a
  // fully-bundled SPA with no server-side script injection, removing the
  // directive in production is the correct first hardening step.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // 'unsafe-inline' is dev-only: Vite HMR requires it; production bundles do not.
          scriptSrc: isProd ? ["'self'"] : ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles (CSS-in-JS / Tailwind)
          imgSrc: ["'self'", "data:", "blob:"], // Allow data URIs and blob URLs for images
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
    const health = await getHealth();
    res.status(health.ok ? 200 : 503).json(health);
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
