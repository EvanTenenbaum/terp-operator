/**
 * Credit-engine in-process metrics counters (Phase 7a observability — issue #68).
 *
 * Pure in-process counters, **NOT** a metrics backend. Buckets are keyed by
 * `name` + an order-independent canonical form of `labels`.
 *
 * Used by the credit-engine code paths to record:
 *   - decisions issued (`credit_engine.decision_issued`)
 *   - engine recommendations applied to customers.credit_limit (`credit_engine.override_applied`)
 *   - shadow-mode skips (`credit_engine.shadow_mode_miss`)
 *   - divergence observations (`credit_engine.divergence_observed`)
 *   - stale processing rows reaped (`credit_engine.worker_stalled`)
 *
 * Phase 7a intentionally avoids pulling in a metrics library like `prom-client`:
 * staging traffic is low enough that an in-process counter is sufficient, and
 * we want zero runtime dependency added in this PR. Phase 7b can replace this
 * with a real backend behind the same singleton interface — see
 * `docs/credit-engine-alerts.md` for the migration plan.
 */

export interface Counter {
  name: string;
  labels?: Record<string, string>;
  value: number;
}

interface InternalBucket {
  name: string;
  labels: Record<string, string> | undefined;
  value: number;
}

function canonicalLabels(labels: Record<string, string> | undefined): string {
  if (!labels) return '';
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}=${labels[k]}`).join(',');
}

function bucketKey(name: string, labels: Record<string, string> | undefined): string {
  return `${name}|${canonicalLabels(labels)}`;
}

class CreditEngineMetrics {
  private buckets = new Map<string, InternalBucket>();

  /**
   * Increment `name` (optionally scoped by `labels`) by `delta` (default 1).
   * Non-positive deltas are no-ops — counters monotonically increase, and a
   * caller emitting a zero/negative delta is almost certainly a logic error.
   */
  increment(name: string, labels?: Record<string, string>, delta = 1): void {
    if (delta <= 0) return;
    const key = bucketKey(name, labels);
    const existing = this.buckets.get(key);
    if (existing) {
      existing.value += delta;
    } else {
      this.buckets.set(key, {
        name,
        labels: labels ? { ...labels } : undefined,
        value: delta
      });
    }
  }

  /**
   * Read a single counter. When `labels` is omitted, sums every bucket sharing
   * `name`. When `labels` is provided, returns the exact match (0 if none).
   */
  getCounter(name: string, labels?: Record<string, string>): number {
    if (labels !== undefined) {
      const key = bucketKey(name, labels);
      return this.buckets.get(key)?.value ?? 0;
    }
    let sum = 0;
    for (const b of this.buckets.values()) {
      if (b.name === name) sum += b.value;
    }
    return sum;
  }

  /**
   * Snapshot of all counters as plain objects.
   */
  getCounters(): Counter[] {
    return Array.from(this.buckets.values()).map((b) => ({
      name: b.name,
      labels: b.labels,
      value: b.value
    }));
  }

  /**
   * Clear all counters. **Tests only.**
   */
  resetForTest(): void {
    this.buckets.clear();
  }
}

/**
 * Process-wide singleton. Reset only via `resetForTest()` in unit tests.
 */
export const creditEngineMetrics = new CreditEngineMetrics();

/**
 * Structured log helper for credit-engine events. Emits a single JSON line to
 * stdout so log aggregators can index by `event` + payload fields.
 */
export function logCreditEngineEvent(
  event: string,
  payload: Record<string, unknown> = {}
): void {
  const line = JSON.stringify({
    event,
    ts: new Date().toISOString(),
    ...payload
  });
  // eslint-disable-next-line no-console
  console.log(line);
}
