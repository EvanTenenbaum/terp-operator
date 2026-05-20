import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * Shared key generator: bucket by authenticated user id when available,
 * otherwise fall back to the client IP — bucketed via `ipKeyGenerator` so that
 * IPv6 addresses are grouped by /64 subnet instead of by individual address.
 *
 * Why this exists: express-rate-limit emits ERR_ERL_KEY_GEN_IPV6 whenever a
 * custom keyGenerator references `req.ip` without invoking `ipKeyGenerator`,
 * because raw IPv6 addresses are trivially rotatable and would let a single
 * attacker bypass the limit. The user-id branch is unaffected; we only need
 * to wrap the IP fallback path.
 *
 * Exported for unit testing — see httpRateLimiters.test.ts.
 */
function makeKeyGenerator() {
  return (req: Request): string => {
    if (req.user?.id) return req.user.id;
    if (req.ip) return ipKeyGenerator(req.ip);
    return 'anonymous';
  };
}

export const uploadRateLimiterKeyGenerator = makeKeyGenerator();
export const mediaServeRateLimiterKeyGenerator = makeKeyGenerator();

/**
 * Upload limiter: 50 successful uploads per 15 minutes per user (or IP if unauthenticated).
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many uploads. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: uploadRateLimiterKeyGenerator,
  skipFailedRequests: true
});

/**
 * Media serving limiter: 200 successful requests per minute per user (more lenient than upload).
 */
export const mediaServeRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: mediaServeRateLimiterKeyGenerator,
  skipFailedRequests: true
});
