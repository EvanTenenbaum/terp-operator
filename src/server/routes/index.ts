import type { Express } from 'express';
import uploadRoute from './uploadRoute';
import mediaRoute from './mediaRoute';
import exportCsvRoute from './exportCsvRoute';

/**
 * Register custom Express HTTP routes that are outside the tRPC surface.
 *
 * Used for endpoints that need multipart/binary handling (file uploads),
 * streaming responses (media serving with HTTP range requests), or
 * browser-triggered downloads (`/api/export/:view.csv`, see #35 FE-M1).
 *
 * tRPC remains the primary API surface; this is only for the binary /
 * download edge.
 */
export function registerHttpRoutes(app: Express): void {
  app.use(uploadRoute);
  app.use(mediaRoute);
  app.use(exportCsvRoute);
}
