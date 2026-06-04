import { and, eq, isNotNull, inArray, lt } from 'drizzle-orm';
import { promises as fsp } from 'node:fs';
import { db } from '../db';
import { batchMedia, mediaCleanupLog, mediaRetentionPolicies } from '../schema';

export interface PolicyCleanupResult {
  policyId: string;
  policyName: string;
  filesDeleted: number;
  bytesFreed: number;
  rowsDeleted: number;
  error?: string;
}

function cutoffDate(now: Date, daysToKeep: number): Date {
  return new Date(now.getTime() - daysToKeep * 24 * 60 * 60 * 1000);
}

/**
 * Run a single cleanup pass: read every active retention policy, find
 * expired batchMedia rows, delete their files from disk, remove the DB
 * rows, and write an audit row to media_cleanup_log.
 *
 * Designed to be called from both the manual tRPC trigger and the
 * scheduled cron script.  The caller owns the pool lifecycle.
 */
export async function runMediaCleanup(
  poolOrDb: typeof db,
  now: Date = new Date()
): Promise<PolicyCleanupResult[]> {
  const results: PolicyCleanupResult[] = [];

  const policies = await poolOrDb
    .select()
    .from(mediaRetentionPolicies)
    .where(eq(mediaRetentionPolicies.isActive, true));

  for (const policy of policies) {
    const cutoff = cutoffDate(now, policy.daysToKeep);
    const startedAt = new Date();
    let filesDeleted = 0;
    let bytesFreed = 0;
    let rowsDeleted = 0;
    let error: string | undefined;

    try {
      // Build the expiry condition based on applies_to
      let condition;
      if (policy.appliesTo === 'draft') {
        condition = and(
          eq(batchMedia.status, 'draft'),
          lt(batchMedia.createdAt, cutoff)
        );
      } else if (policy.appliesTo === 'replaced') {
        // 'replaced' media is identified by replaced_at IS NOT NULL,
        // not by a status value (the status CHECK constraint only allows
        // 'draft' and 'published').
        condition = and(
          isNotNull(batchMedia.replacedAt),
          lt(batchMedia.replacedAt!, cutoff)
        );
      } else {
        // Unknown applies_to — skip silently; the CHECK constraint
        // prevents bad rows, but be defensive.
        continue;
      }

      const expiredMedia = await poolOrDb
        .select()
        .from(batchMedia)
        .where(condition);

      // Delete physical files (best-effort — don't throw if missing)
      if (expiredMedia.length > 0) {
        for (const media of expiredMedia) {
          const filePaths = [
            media.filePath,
            media.thumbnailPath,
            media.mediumPath
          ].filter(Boolean) as string[];

          // Run unlinks in parallel per media row to keep latency bounded
          await Promise.all(
            filePaths.map(async (fp) => {
              try {
                await fsp.unlink(fp);
              } catch {
                // File may already not exist; that's fine
              }
            })
          );
        }

        // Remove DB rows
        const ids = expiredMedia.map((m) => m.id);
        await poolOrDb.delete(batchMedia).where(inArray(batchMedia.id, ids));

        bytesFreed = expiredMedia.reduce(
          (sum, m) => sum + (m.fileSize ?? 0),
          0
        );
        filesDeleted = expiredMedia.length;
        rowsDeleted = expiredMedia.length;
      }

      const completedAt = new Date();

      await poolOrDb.insert(mediaCleanupLog).values({
        policyId: policy.id,
        filesDeleted,
        bytesFreed,
        startedAt,
        completedAt,
        success: true
      });

      results.push({
        policyId: policy.id,
        policyName: policy.name,
        filesDeleted,
        bytesFreed,
        rowsDeleted
      });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      const completedAt = new Date();

      // Best-effort failure log
      try {
        await poolOrDb.insert(mediaCleanupLog).values({
          policyId: policy.id,
          filesDeleted: 0,
          bytesFreed: 0,
          startedAt,
          completedAt,
          success: false,
          errorMessage: error
        });
      } catch {
        // Swallow log-write errors during error handling
      }

      results.push({
        policyId: policy.id,
        policyName: policy.name,
        filesDeleted,
        bytesFreed,
        rowsDeleted,
        error
      });
    }
  }

  return results;
}

/**
 * Manual-trigger wrapper used by the tRPC mutation.  Shares the app-level
 * pool so it does NOT close the pool afterwards.
 */
export async function triggerMediaCleanup(): Promise<PolicyCleanupResult[]> {
  return runMediaCleanup(db);
}
