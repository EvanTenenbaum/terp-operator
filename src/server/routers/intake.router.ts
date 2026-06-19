import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';

/**
 * Intake query router.
 *
 * Domain: intake / batch creation queries. Extracted from queries.ts
 * during the router decomposition. Currently a placeholder — most intake
 * queries remain in the main queries router (grid v2, status counts, etc.).
 *
 * (see docs/decisions/0001-domain-module-architecture.md)
 */
export const intakeRouter = router({
  // Placeholder: intake-specific queries that grow beyond the shared grid
  // infrastructure will be added here.
});
