/**
 * statuses.sync.test.ts — canonical status sync test (T-B-10).
 *
 * Drift-prevention guard that fails loudly when `commandBus.ts` or `schema.ts`
 * sets a status value that doesn't exist in the canonical enums from
 * `src/shared/statuses.ts`.
 *
 * Coverage:
 *   1. Every `set({ status: '...' })`, `.values({ status: '...' })`, and
 *      `values.status = '...'` in commandBus.ts must resolve to a status
 *      value in at least one `*Status` enum.
 *   2. Every `.default('...')` on a status column in schema.ts must resolve
 *      to a status value in at least one `*Status` enum.
 *
 * Unlike `statuses.test.ts` (which does table-level precision), this test
 * is a simpler "does this value exist ANYWHERE in the canonical enums?" gate.
 * It catches typos, orphaned values, and unregistered statuses regardless
 * of which table they target.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as statuses from './statuses';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const COMMAND_BUS_PATH = resolve(__dirname, '../server/services/commandBus.ts');
const SCHEMA_PATH = resolve(__dirname, '../server/schema.ts');

// ─────────────────────────────────────────────────────────────────────────────
// Dynamically discover all canonical status values from statuses.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All known status string literals across every `*Status` Zod enum in
 * `src/shared/statuses.ts`.
 */
function collectAllStatusValues(): Set<string> {
  const values = new Set<string>();

  for (const [exportName, exported] of Object.entries(statuses)) {
    if (exportName.endsWith('Status') && exported && typeof exported === 'object') {
      // ZodEnum has .options as readonly string[] and .enum as record
      const zodEnum = exported as { options?: readonly string[]; enum?: Record<string, string> };
      const opts = zodEnum.options ?? (zodEnum.enum ? Object.values(zodEnum.enum) : []);
      for (const v of opts) {
        values.add(v);
      }
    }
  }

  return values;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract status literals from source text
// ─────────────────────────────────────────────────────────────────────────────

function extractCommandBusStatuses(source: string): Array<{ value: string; line: number }> {
  const lineStarts = computeLineStarts(source);
  const toLine = (offset: number): number => lineStarts.findLastIndex((s) => s <= offset) + 1;

  const results: Array<{ value: string; line: number }> = [];

  // Pattern 1: set({ status: '...' })  —  also catches set({ ..., status: '...', ... })
  const setPattern = /\.set\s*\(\s*\{[^}]*\bstatus\s*:\s*['"]([a-z_]+)['"]/g;
  for (const m of source.matchAll(setPattern)) {
    results.push({ value: m[1], line: toLine(m.index!) });
  }

  // Pattern 2: .values({ status: '...' })  (INSERT paths)
  const valuesPattern = /\.values\s*\(\s*\{[^}]*\bstatus\s*:\s*['"]([a-z_]+)['"]/g;
  for (const m of source.matchAll(valuesPattern)) {
    results.push({ value: m[1], line: toLine(m.index!) });
  }

  // Pattern 3: values.status = '...'  (mutation-before-insert paths)
  const assignPattern = /\bvalues\.status\s*=\s*['"]([a-z_]+)['"]/g;
  for (const m of source.matchAll(assignPattern)) {
    results.push({ value: m[1], line: toLine(m.index!) });
  }

  return results;
}

function extractSchemaDefaults(source: string): Array<{ value: string; line: number }> {
  const lineStarts = computeLineStarts(source);
  const toLine = (offset: number): number => lineStarts.findLastIndex((s) => s <= offset) + 1;

  const results: Array<{ value: string; line: number }> = [];

  // Only match `status:` column defaults, not other columns
  const defaultPattern = /\bstatus\s*:\s*varchar\s*\([^)]*\)\s*\.\s*notNull\s*\(\s*\)\s*\.\s*default\s*\(\s*['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(defaultPattern)) {
    results.push({ value: m[1], line: toLine(m.index!) });
  }

  return results;
}

function computeLineStarts(source: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('statuses.sync — canonical drift guard (T-B-10)', () => {
  const allStatusValues = collectAllStatusValues();
  const commandBusSource = readFileSync(COMMAND_BUS_PATH, 'utf8');
  const schemaSource = readFileSync(SCHEMA_PATH, 'utf8');

  it('reads status enums from statuses.ts (sanity)', () => {
    // Expect at least 15 status enums
    const enumCount = Object.keys(statuses).filter(
      (k) => k.endsWith('Status') && statuses[k as keyof typeof statuses] && typeof statuses[k as keyof typeof statuses] === 'object'
    ).length;
    expect(enumCount).toBeGreaterThanOrEqual(15);
    // Expect at least 30 distinct status values
    expect(allStatusValues.size).toBeGreaterThanOrEqual(30);
  });

  it('every status value in commandBus.ts exists in canonical enums', () => {
    const writes = extractCommandBusStatuses(commandBusSource);

    // Sanity: we expect a reasonable number of status writes
    expect(writes.length).toBeGreaterThan(30);

    const missing: Array<{ value: string; line: number }> = [];
    for (const w of writes) {
      if (!allStatusValues.has(w.value)) {
        missing.push(w);
      }
    }

    if (missing.length > 0) {
      const unique = [...new Set(missing.map((m) => m.value))];
      const details = missing
        .map((m) => `  commandBus.ts:${m.line}  status = '${m.value}'`)
        .join('\n');
      throw new Error(
        `${unique.length} status value(s) used in commandBus.ts are not ` +
          `present in any canonical enum in src/shared/statuses.ts:\n${details}\n\n` +
          `Missing values: [${unique.map((v) => `'${v}'`).join(', ')}]\n` +
          `Add them to the appropriate z.enum([...]) in statuses.ts, or fix ` +
          `the typo in commandBus.ts.`,
      );
    }
  });

  it('every schema default status value exists in canonical enums', () => {
    const defaults = extractSchemaDefaults(schemaSource);

    // Sanity: expect at least 10 default status columns
    expect(defaults.length).toBeGreaterThanOrEqual(10);

    const missing: Array<{ value: string; line: number }> = [];
    for (const d of defaults) {
      if (!allStatusValues.has(d.value)) {
        missing.push(d);
      }
    }

    if (missing.length > 0) {
      const unique = [...new Set(missing.map((m) => m.value))];
      const details = missing
        .map((m) => `  schema.ts:${m.line}  .default('${m.value}')`)
        .join('\n');
      throw new Error(
        `${unique.length} schema default status value(s) are not ` +
          `present in any canonical enum in src/shared/statuses.ts:\n${details}\n\n` +
          `Missing values: [${unique.map((v) => `'${v}'`).join(', ')}]\n` +
          `Add them to the appropriate z.enum([...]) in statuses.ts.`,
      );
    }
  });

  it('every canonical enum value is referenced somewhere (informational)', () => {
    // Gather all status values used in commandBus.ts
    const usedInCommandBus = new Set(
      extractCommandBusStatuses(commandBusSource).map((w) => w.value),
    );
    const usedInSchema = new Set(
      extractSchemaDefaults(schemaSource).map((d) => d.value),
    );

    const allUsed = new Set([...usedInCommandBus, ...usedInSchema]);
    const unreferenced: string[] = [];
    for (const v of allStatusValues) {
      if (!allUsed.has(v)) unreferenced.push(v);
    }

    // Informational only — some statuses are set dynamically or are
    // historical/read-only. Do NOT fail.
    if (unreferenced.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[T-B-10 informational] ${unreferenced.length} canonical status ` +
          `value(s) are not referenced as literals in commandBus.ts or ` +
          `schema.ts defaults (may be set dynamically or be historical/` +
          `read-only):\n  - ` +
          unreferenced.sort().join('\n  - '),
      );
    }
    expect(true).toBe(true);
  });
});
