import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  statfs: vi.fn()
}));

import { statfs } from 'node:fs/promises';
import { checkDiskSpace } from '../server/utils/diskSpace';

describe('checkDiskSpace', () => {
  beforeEach(() => {
    vi.mocked(statfs).mockReset();
  });

  it('throws when usage is above 90 percent', async () => {
    vi.mocked(statfs).mockResolvedValue({
      blocks: 1000,
      bsize: 4096,
      bavail: 50 // 5% free → 95% used
    } as any);

    await expect(checkDiskSpace('/storage', 1024))
      .rejects.toThrow(/Disk usage critical/);
  });

  it('throws when available space is less than 1.5x required', async () => {
    vi.mocked(statfs).mockResolvedValue({
      blocks: 1000,
      bsize: 4096,
      bavail: 100 // ~400KB available
    } as any);

    await expect(checkDiskSpace('/storage', 1024 * 1024)) // require 1 MB
      .rejects.toThrow(/Insufficient disk space/);
  });

  it('resolves when there is sufficient headroom', async () => {
    vi.mocked(statfs).mockResolvedValue({
      blocks: 1000,
      bsize: 4096,
      bavail: 500 // 50% free, ~2 MB
    } as any);

    await expect(checkDiskSpace('/storage', 100 * 1024))
      .resolves.toBeUndefined();
  });

  it('does not throw if statfs itself fails (best-effort)', async () => {
    vi.mocked(statfs).mockRejectedValue(new Error('ENOENT'));

    await expect(checkDiskSpace('/no/such/path', 100))
      .resolves.toBeUndefined();
  });
});
