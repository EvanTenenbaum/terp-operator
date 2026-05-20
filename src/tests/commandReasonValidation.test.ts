import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { commandInputSchema } from '../shared/schemas';

// Issue #25: the command journal stores every write with actor + idempotency
// key + reason. Making `reason` optional in `commandInputSchema` allowed
// direct-API callers (and any UI bug that drops the field) to write rows with
// `reason = NULL`, silently breaking the audit story.
//
// These tests pin down the schema contract that any command — whether routed
// through tRPC `commands.run` or through internal callers like
// `executeCommand` / `commandBus` — MUST supply a non-trivial reason string.

const baseInput = {
  name: 'createBatch' as const,
  idempotencyKey: 'idem-key-12345',
  payload: {}
};

describe('commandInputSchema.reason — issue #25', () => {
  it('rejects a command submitted without a reason', () => {
    expect(() => commandInputSchema.parse({ ...baseInput })).toThrow(ZodError);
  });

  it('rejects an explicitly undefined reason', () => {
    expect(() =>
      commandInputSchema.parse({ ...baseInput, reason: undefined })
    ).toThrow(ZodError);
  });

  it('rejects a null reason', () => {
    expect(() =>
      commandInputSchema.parse({ ...baseInput, reason: null as unknown as string })
    ).toThrow(ZodError);
  });

  it('rejects an empty-string reason', () => {
    expect(() =>
      commandInputSchema.parse({ ...baseInput, reason: '' })
    ).toThrow(ZodError);
  });

  it('rejects a whitespace-only reason', () => {
    expect(() =>
      commandInputSchema.parse({ ...baseInput, reason: '   ' })
    ).toThrow(ZodError);
  });

  it('rejects a reason shorter than 3 characters', () => {
    expect(() =>
      commandInputSchema.parse({ ...baseInput, reason: 'ab' })
    ).toThrow(ZodError);
  });

  it('rejects a 2-character reason even after trimming surrounding whitespace', () => {
    expect(() =>
      commandInputSchema.parse({ ...baseInput, reason: '  ab  ' })
    ).toThrow(ZodError);
  });

  it('rejects a reason longer than 500 characters', () => {
    const tooLong = 'x'.repeat(501);
    expect(() =>
      commandInputSchema.parse({ ...baseInput, reason: tooLong })
    ).toThrow(ZodError);
  });

  it('accepts a reason exactly 3 characters long (boundary)', () => {
    const parsed = commandInputSchema.parse({ ...baseInput, reason: 'abc' });
    expect(parsed.reason).toBe('abc');
  });

  it('accepts a reason exactly 500 characters long (boundary)', () => {
    const justRight = 'x'.repeat(500);
    const parsed = commandInputSchema.parse({ ...baseInput, reason: justRight });
    expect(parsed.reason).toBe(justRight);
  });

  it('trims leading and trailing whitespace before storing', () => {
    const parsed = commandInputSchema.parse({
      ...baseInput,
      reason: '   Approve PO to receive queue   '
    });
    expect(parsed.reason).toBe('Approve PO to receive queue');
  });

  it('accepts a normal reason and preserves it verbatim', () => {
    const reason = 'Operator confirmed intake quantities for PO-12345';
    const parsed = commandInputSchema.parse({ ...baseInput, reason });
    expect(parsed.reason).toBe(reason);
  });
});
