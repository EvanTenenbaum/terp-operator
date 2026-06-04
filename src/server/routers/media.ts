import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';
import { triggerMediaCleanup } from '../services/mediaCleanup';
import { canRole } from '../rbac';

/**
 * Media lifecycle router.
 *
 * Exposes a manual trigger for the retention/cleanup job so operators
 * can force a cleanup pass without waiting for the scheduled cron.
 */
export const mediaRouter = router({
  runCleanup: protectedProcedure.mutation(async ({ ctx }) => {
    if (!canRole(ctx.user.role, 'manager')) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Media cleanup requires manager or owner access.'
      });
    }

    const results = await triggerMediaCleanup();
    return {
      summary: {
        policiesRun: results.length,
        totalFilesDeleted: results.reduce((s, r) => s + r.filesDeleted, 0),
        totalBytesFreed: results.reduce((s, r) => s + r.bytesFreed, 0),
        totalRowsDeleted: results.reduce((s, r) => s + r.rowsDeleted, 0),
        errors: results.filter((r) => r.error).map((r) => r.error!)
      },
      policies: results
    };
  })
});
