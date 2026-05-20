import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

// Mocked pg pool — exposes query() and we control rowsets per test.
let mockQuery: ReturnType<typeof vi.fn>;

function buildMockPool() {
  return {
    query: (...args: unknown[]) => (mockQuery as (...a: unknown[]) => unknown)(...args)
  } as unknown as import('pg').Pool;
}

beforeEach(() => {
  mockQuery = vi.fn();
});

describe('photoUploadTokens service', () => {
  describe('mintUploadToken', () => {
    it('returns a raw token and persists the sha256-hashed token row', async () => {
      const fakeRow = {
        id: '11111111-1111-1111-1111-111111111111',
        batch_id: '22222222-2222-2222-2222-222222222222',
        issued_by: '33333333-3333-3333-3333-333333333333',
        issued_at: new Date('2026-05-20T00:00:00Z'),
        expires_at: new Date('2026-05-20T01:00:00Z'),
        revoked_at: null,
        last_used_at: null,
        use_count: 0
      };
      mockQuery.mockResolvedValueOnce({ rows: [fakeRow] });

      const { mintUploadToken } = await import('./photoUploadTokens');
      const pool = buildMockPool();

      const result = await mintUploadToken(pool, {
        batchId: '22222222-2222-2222-2222-222222222222',
        userId: '33333333-3333-3333-3333-333333333333',
        ttlMinutes: 60
      });

      // Raw token is 64 hex chars (32 random bytes)
      expect(result.token).toMatch(/^[0-9a-f]{64}$/);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.tokenId).toBe(fakeRow.id);

      // Pool received exactly one insert call
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/INSERT INTO photo_upload_tokens/i);

      // The raw token must NEVER appear in the SQL parameters
      expect(params).toEqual(
        expect.arrayContaining([
          expect.any(String), // token_hash
          '22222222-2222-2222-2222-222222222222',
          '33333333-3333-3333-3333-333333333333',
          expect.any(Date) // expires_at
        ])
      );

      // Confirm token_hash param is sha256(raw token) — and is NOT the raw token
      const tokenHash = params[0] as string;
      expect(tokenHash).toBe(crypto.createHash('sha256').update(result.token).digest('hex'));
      expect(params).not.toContain(result.token);
    });

    it('rejects ttlMinutes <= 0', async () => {
      const { mintUploadToken } = await import('./photoUploadTokens');
      const pool = buildMockPool();

      await expect(
        mintUploadToken(pool, {
          batchId: '22222222-2222-2222-2222-222222222222',
          userId: '33333333-3333-3333-3333-333333333333',
          ttlMinutes: 0
        })
      ).rejects.toThrow(/ttl/i);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects ttlMinutes > 1440 (24 hours)', async () => {
      const { mintUploadToken } = await import('./photoUploadTokens');
      const pool = buildMockPool();

      await expect(
        mintUploadToken(pool, {
          batchId: '22222222-2222-2222-2222-222222222222',
          userId: '33333333-3333-3333-3333-333333333333',
          ttlMinutes: 1441
        })
      ).rejects.toThrow(/ttl/i);
    });
  });

  describe('verifyUploadToken', () => {
    it('returns the row and bumps use_count when valid', async () => {
      const batchId = '22222222-2222-2222-2222-222222222222';
      const rawToken = crypto.randomBytes(32).toString('hex');
      const row = {
        id: '11111111-1111-1111-1111-111111111111',
        batch_id: batchId,
        issued_by: '33333333-3333-3333-3333-333333333333',
        issued_at: new Date('2026-05-20T00:00:00Z'),
        expires_at: new Date(Date.now() + 60_000),
        revoked_at: null,
        last_used_at: null,
        use_count: 0
      };
      // 1st call = SELECT, 2nd call = UPDATE last_used_at/use_count
      mockQuery.mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [] });

      const { verifyUploadToken } = await import('./photoUploadTokens');
      const pool = buildMockPool();

      const result = await verifyUploadToken(pool, rawToken, batchId);

      expect(result.tokenId).toBe(row.id);
      expect(result.batchId).toBe(batchId);
      expect(result.issuedBy).toBe(row.issued_by);

      // Verified SELECT was called with the hashed token, not the raw token
      const firstCall = mockQuery.mock.calls[0] as [string, unknown[]];
      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      expect(firstCall[1]).toContain(expectedHash);
      expect(firstCall[1]).not.toContain(rawToken);
    });

    it('throws when token does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const { verifyUploadToken } = await import('./photoUploadTokens');
      const pool = buildMockPool();

      await expect(
        verifyUploadToken(pool, 'a'.repeat(64), '22222222-2222-2222-2222-222222222222')
      ).rejects.toThrow(/invalid/i);
    });

    it('throws when token is expired', async () => {
      const batchId = '22222222-2222-2222-2222-222222222222';
      const rawToken = 'b'.repeat(64);
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            batch_id: batchId,
            issued_by: '33333333-3333-3333-3333-333333333333',
            issued_at: new Date('2020-01-01T00:00:00Z'),
            expires_at: new Date('2020-01-01T00:01:00Z'),
            revoked_at: null,
            last_used_at: null,
            use_count: 0
          }
        ]
      });

      const { verifyUploadToken } = await import('./photoUploadTokens');
      const pool = buildMockPool();

      await expect(verifyUploadToken(pool, rawToken, batchId)).rejects.toThrow(/expired/i);
    });

    it('throws when batch id does not match', async () => {
      const tokenBatchId = '22222222-2222-2222-2222-222222222222';
      const otherBatchId = '99999999-9999-9999-9999-999999999999';
      const rawToken = 'c'.repeat(64);
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            batch_id: tokenBatchId,
            issued_by: '33333333-3333-3333-3333-333333333333',
            issued_at: new Date(),
            expires_at: new Date(Date.now() + 60_000),
            revoked_at: null,
            last_used_at: null,
            use_count: 0
          }
        ]
      });

      const { verifyUploadToken } = await import('./photoUploadTokens');
      const pool = buildMockPool();

      await expect(verifyUploadToken(pool, rawToken, otherBatchId)).rejects.toThrow(/batch/i);
    });

    it('throws when token has been revoked', async () => {
      const batchId = '22222222-2222-2222-2222-222222222222';
      const rawToken = 'd'.repeat(64);
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            batch_id: batchId,
            issued_by: '33333333-3333-3333-3333-333333333333',
            issued_at: new Date(),
            expires_at: new Date(Date.now() + 60_000),
            revoked_at: new Date(),
            last_used_at: null,
            use_count: 0
          }
        ]
      });

      const { verifyUploadToken } = await import('./photoUploadTokens');
      const pool = buildMockPool();

      await expect(verifyUploadToken(pool, rawToken, batchId)).rejects.toThrow(/revoked/i);
    });

    it('rejects malformed tokens (wrong length / non-hex) without DB query', async () => {
      const { verifyUploadToken } = await import('./photoUploadTokens');
      const pool = buildMockPool();

      await expect(
        verifyUploadToken(pool, 'not-a-valid-token', '22222222-2222-2222-2222-222222222222')
      ).rejects.toThrow(/invalid/i);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('revokeUploadToken', () => {
    it('marks the token revoked', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: '11111111-1111-1111-1111-111111111111' }] });

      const { revokeUploadToken } = await import('./photoUploadTokens');
      const pool = buildMockPool();

      await revokeUploadToken(pool, {
        tokenId: '11111111-1111-1111-1111-111111111111',
        userId: '33333333-3333-3333-3333-333333333333'
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/UPDATE photo_upload_tokens/i);
      expect(sql).toMatch(/revoked_at/i);
      expect(params).toContain('11111111-1111-1111-1111-111111111111');
    });

    it('throws when token id is not found / already revoked', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const { revokeUploadToken } = await import('./photoUploadTokens');
      const pool = buildMockPool();

      await expect(
        revokeUploadToken(pool, {
          tokenId: '11111111-1111-1111-1111-111111111111',
          userId: '33333333-3333-3333-3333-333333333333'
        })
      ).rejects.toThrow(/not found|already/i);
    });
  });
});
