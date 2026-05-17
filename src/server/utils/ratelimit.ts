import { LRUCache } from 'lru-cache';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const cache = new LRUCache<string, RateLimitEntry>({
  max: 10000,
  ttl: 60000 // 1 minute
});

export const ratelimit = {
  limit: async (key: string, options: { limit: number; window: string }): Promise<{ success: boolean }> => {
    const now = Date.now();
    const entry = cache.get(key);

    if (!entry || now > entry.resetAt) {
      // New window
      cache.set(key, { count: 1, resetAt: now + 60000 }); // 1 minute window
      return { success: true };
    }

    if (entry.count >= options.limit) {
      return { success: false };
    }

    entry.count++;
    cache.set(key, entry);
    return { success: true };
  }
};
