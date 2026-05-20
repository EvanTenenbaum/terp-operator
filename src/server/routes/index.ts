import type { Express } from 'express';
import uploadRoute from './uploadRoute';
import mediaRoute from './mediaRoute';

/**
 * Register custom Express HTTP routes that are outside the tRPC surface.
 *
 * Used for endpoints that need multipart/binary handling (file uploads)
 * or streaming responses (media serving with HTTP range requests).
 *
 * tRPC remains the primary API surface; this is only for the binary edge.
 */
export function registerHttpRoutes(app: Express): void {
  app.use(uploadRoute);
  app.use(mediaRoute);
}
