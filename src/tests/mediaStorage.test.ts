import { describe, it, expect } from 'vitest';
import { resolveBatchMediaPath, isSafeUuid } from '../server/utils/mediaStorage';

describe('isSafeUuid', () => {
  it('accepts a canonical lowercase UUID', () => {
    expect(isSafeUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects strings with path-traversal characters', () => {
    expect(isSafeUuid('../../../etc/passwd')).toBe(false);
    expect(isSafeUuid('550e8400-e29b-41d4-a716-446655440000/..')).toBe(false);
    expect(isSafeUuid('550e8400-e29b-41d4-a716-446655440000\\bad')).toBe(false);
  });

  it('rejects empty and obviously wrong input', () => {
    expect(isSafeUuid('')).toBe(false);
    expect(isSafeUuid('not-a-uuid')).toBe(false);
    expect(isSafeUuid('550e8400-e29b-41d4-a716')).toBe(false);
  });
});

describe('resolveBatchMediaPath', () => {
  it('builds a path under the storage root', () => {
    const p = resolveBatchMediaPath('/srv/storage', '550e8400-e29b-41d4-a716-446655440000');
    expect(p.startsWith('/srv/storage/')).toBe(true);
    expect(p.endsWith('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('throws when the batchId is not a safe UUID', () => {
    expect(() => resolveBatchMediaPath('/srv/storage', '../etc'))
      .toThrow(/invalid batchId/i);
  });
});
