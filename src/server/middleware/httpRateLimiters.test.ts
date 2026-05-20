import { describe, it, expect } from 'vitest';
import { ipKeyGenerator } from 'express-rate-limit';
import {
  uploadRateLimiterKeyGenerator,
  mediaServeRateLimiterKeyGenerator
} from './httpRateLimiters';

type FakeReq = {
  user?: { id?: string } | undefined;
  ip?: string | undefined;
};

describe('httpRateLimiters key generators', () => {
  describe('uploadRateLimiterKeyGenerator', () => {
    it('returns the user id when an authenticated user is present', () => {
      const req: FakeReq = { user: { id: 'user-abc' }, ip: '1.2.3.4' };
      expect(uploadRateLimiterKeyGenerator(req as never)).toBe('user-abc');
    });

    it('falls back to ipKeyGenerator(req.ip) for unauthenticated requests (IPv4)', () => {
      const ip = '203.0.113.5';
      const req: FakeReq = { ip };
      expect(uploadRateLimiterKeyGenerator(req as never)).toBe(ipKeyGenerator(ip));
    });

    it('falls back to ipKeyGenerator(req.ip) for unauthenticated requests (IPv6)', () => {
      // IPv6 is bucketed by /64 subnet by ipKeyGenerator to satisfy
      // express-rate-limit's ERR_ERL_KEY_GEN_IPV6 guard.
      const ip = '2001:db8:abcd:1234:5678:9abc:def0:1';
      const req: FakeReq = { ip };
      const key = uploadRateLimiterKeyGenerator(req as never);
      expect(key).toBe(ipKeyGenerator(ip));
      expect(key).not.toBe(ip); // proves bucketing happened
    });

    it('returns the anonymous sentinel when neither user nor ip are available', () => {
      const req: FakeReq = {};
      expect(uploadRateLimiterKeyGenerator(req as never)).toBe('anonymous');
    });

    it('prefers the user id even when an ip is also present', () => {
      const req: FakeReq = { user: { id: 'user-xyz' }, ip: '10.0.0.1' };
      expect(uploadRateLimiterKeyGenerator(req as never)).toBe('user-xyz');
    });
  });

  describe('mediaServeRateLimiterKeyGenerator', () => {
    it('returns the user id when an authenticated user is present', () => {
      const req: FakeReq = { user: { id: 'user-media' }, ip: '1.2.3.4' };
      expect(mediaServeRateLimiterKeyGenerator(req as never)).toBe('user-media');
    });

    it('falls back to ipKeyGenerator(req.ip) for unauthenticated requests', () => {
      const ip = '198.51.100.7';
      const req: FakeReq = { ip };
      expect(mediaServeRateLimiterKeyGenerator(req as never)).toBe(ipKeyGenerator(ip));
    });

    it('returns the anonymous sentinel when neither user nor ip are available', () => {
      const req: FakeReq = {};
      expect(mediaServeRateLimiterKeyGenerator(req as never)).toBe('anonymous');
    });
  });
});
