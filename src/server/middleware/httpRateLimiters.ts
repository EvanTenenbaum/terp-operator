import rateLimit from 'express-rate-limit';

/**
 * Upload limiter: 50 successful uploads per 15 minutes per user (or IP if unauthenticated).
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many uploads. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonymous',
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
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonymous',
  skipFailedRequests: true
});
