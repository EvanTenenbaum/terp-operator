import { statfs } from 'node:fs/promises';

const USAGE_LIMIT_PERCENT = 90;
const REQUIRED_HEADROOM_MULTIPLIER = 1.5;

export async function checkDiskSpace(path: string, requiredBytes: number): Promise<void> {
  let stats;
  try {
    stats = await statfs(path);
  } catch {
    return;
  }

  const totalBytes = stats.blocks * stats.bsize;
  const availableBytes = stats.bavail * stats.bsize;
  const usagePercent = totalBytes === 0 ? 100 : 100 - (availableBytes / totalBytes) * 100;

  if (usagePercent > USAGE_LIMIT_PERCENT) {
    throw new Error(
      `Disk usage critical: ${usagePercent.toFixed(1)}%. Free up space before uploading.`
    );
  }

  const requiredWithHeadroom = requiredBytes * REQUIRED_HEADROOM_MULTIPLIER;
  if (availableBytes < requiredWithHeadroom) {
    throw new Error(
      `Insufficient disk space. Required (with headroom): ${(requiredWithHeadroom / 1024 / 1024).toFixed(1)}MB, ` +
      `available: ${(availableBytes / 1024 / 1024).toFixed(1)}MB`
    );
  }
}
