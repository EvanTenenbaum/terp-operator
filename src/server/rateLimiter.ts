/**
 * Simple in-memory rate limiter for login attempts.
 * Tracks attempts per IP address with exponential backoff.
 */

interface RateLimitEntry {
  attempts: number;
  firstAttemptAt: number;
  blockedUntil: number | null;
}

const attempts = new Map<string, RateLimitEntry>();

// Configuration
const MAX_ATTEMPTS = 5; // Max attempts before blocking
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const BLOCK_DURATION_MS = 15 * 60 * 1000; // Block for 15 minutes after max attempts

/**
 * Check if a request from the given IP should be rate-limited.
 * @param ip IP address or identifier
 * @returns true if rate limit exceeded, false otherwise
 */
export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry) {
    return false;
  }

  // If blocked, check if block period has expired
  if (entry.blockedUntil && now < entry.blockedUntil) {
    return true; // Still blocked
  }

  // If block expired or window expired, reset
  if ((entry.blockedUntil && now >= entry.blockedUntil) || (now - entry.firstAttemptAt > WINDOW_MS)) {
    attempts.delete(ip);
    return false;
  }

  // Check if attempts exceeded within window
  return entry.attempts >= MAX_ATTEMPTS;
}

/**
 * Record a failed login attempt for the given IP.
 * @param ip IP address or identifier
 */
export function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry) {
    attempts.set(ip, {
      attempts: 1,
      firstAttemptAt: now,
      blockedUntil: null
    });
    return;
  }

  // Reset if window expired
  if (now - entry.firstAttemptAt > WINDOW_MS) {
    attempts.set(ip, {
      attempts: 1,
      firstAttemptAt: now,
      blockedUntil: null
    });
    return;
  }

  // Increment attempts
  entry.attempts += 1;

  // Block if max attempts reached
  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.blockedUntil = now + BLOCK_DURATION_MS;
  }
}

/**
 * Clear rate limit for successful login (optional - allow legitimate retries).
 * @param ip IP address or identifier
 */
export function clearRateLimit(ip: string): void {
  attempts.delete(ip);
}

// Cleanup old entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of attempts.entries()) {
    if (
      (entry.blockedUntil && now > entry.blockedUntil + WINDOW_MS) ||
      (now - entry.firstAttemptAt > WINDOW_MS * 2)
    ) {
      attempts.delete(ip);
    }
  }
}, 60 * 60 * 1000);
