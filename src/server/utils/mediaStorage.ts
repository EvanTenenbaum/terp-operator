import path from 'node:path';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isSafeUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

export function resolveBatchMediaPath(storageRoot: string, batchId: string): string {
  if (!isSafeUuid(batchId)) {
    throw new Error(`invalid batchId: not a canonical UUID`);
  }
  const resolved = path.resolve(storageRoot, batchId);
  const normalizedRoot = path.resolve(storageRoot);
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error(`invalid batchId: resolved path escapes storage root`);
  }
  return resolved;
}
