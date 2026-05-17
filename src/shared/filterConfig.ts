/**
 * Filter System Configuration
 *
 * Centralized configuration for filter recursion limits, pagination,
 * rate limiting, and query timeouts.
 */

export const FILTER_CONFIG = {
  // Recursion protection
  MAX_RECURSION_DEPTH: 100,
  MAX_CLIENT_RECURSION: 100,
  MAX_CONDITIONS_PER_GROUP: 50,
  MAX_FILTER_NESTING: 5,

  // Query execution
  QUERY_TIMEOUT_MS: 30000, // 30 seconds

  // Rate limiting
  RATE_LIMIT_REQUESTS: 20,
  RATE_LIMIT_WINDOW: '1m' as const,

  // Pagination
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 100,

  // Facets
  FACET_RESULT_LIMIT: 1000,

  // Circuit breaker
  CLIENT_EVAL_THRESHOLD: 10000, // Show warning when evaluating > 10k items
} as const;

export type FilterConfig = typeof FILTER_CONFIG;
