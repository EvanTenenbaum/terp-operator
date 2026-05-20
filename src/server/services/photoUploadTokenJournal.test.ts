import { describe, it, expect } from 'vitest';
import { redactSensitiveDeltaFields } from './commandBus';
import type { CommandResult } from '../../shared/types';

/**
 * Regression test for PR #93 adversarial-QA finding F1.
 *
 * Before this fix, mintPhotoUploadToken returned the raw bearer token via
 * result.delta.token and executeCommand persisted result verbatim into BOTH
 * the DB commandJournal.result column AND the on-disk JSONL audit file via
 * appendJsonlJournal. That defeated the sha256-at-rest design — anyone with
 * read access to the DB or the journal directory could replay live tokens.
 *
 * After the fix, redactSensitiveDeltaFields strips the per-command secret
 * fields from the journal-bound copy of the result before either write.
 * The original result (with the raw token) still flows to the HTTP caller
 * exactly once — that's the only place the raw token should ever appear.
 */
describe('redactSensitiveDeltaFields (PR #93 F1)', () => {
  it('redacts mintPhotoUploadToken.delta.token while preserving other delta fields', () => {
    const original: CommandResult = {
      ok: true,
      commandId: 'cmd-1',
      affectedIds: ['token-uuid'],
      toast: 'Upload share link minted (expires 2026-05-21T00:00:00.000Z).',
      delta: {
        token: 'a'.repeat(64),
        tokenId: 'token-uuid',
        batchId: 'batch-uuid',
        expiresAt: '2026-05-21T00:00:00.000Z'
      }
    };

    const redacted = redactSensitiveDeltaFields('mintPhotoUploadToken', original);

    expect((redacted.delta as Record<string, unknown>)?.token).toBe('<redacted>');
    expect((redacted.delta as Record<string, unknown>)?.tokenId).toBe('token-uuid');
    expect((redacted.delta as Record<string, unknown>)?.batchId).toBe('batch-uuid');
    expect((redacted.delta as Record<string, unknown>)?.expiresAt).toBe('2026-05-21T00:00:00.000Z');
    // Verify the original is unchanged (we return a new object).
    expect((original.delta as Record<string, unknown>)?.token).toBe('a'.repeat(64));
    // Other CommandResult fields preserved.
    expect(redacted.ok).toBe(true);
    expect(redacted.affectedIds).toEqual(['token-uuid']);
    expect(redacted.toast).toBe(original.toast);
  });

  it('serialises to JSON without the raw token', () => {
    const original: CommandResult = {
      ok: true,
      commandId: 'cmd-2',
      affectedIds: [],
      toast: 'ok',
      delta: { token: 'SECRET_TOKEN_VALUE_THAT_MUST_NOT_LEAK', tokenId: 't' }
    };
    const redacted = redactSensitiveDeltaFields('mintPhotoUploadToken', original);
    const serialised = JSON.stringify(redacted);
    expect(serialised).not.toContain('SECRET_TOKEN_VALUE_THAT_MUST_NOT_LEAK');
    expect(serialised).toContain('<redacted>');
  });

  it('passes through results for commands that have no sensitive fields', () => {
    const result: CommandResult = {
      ok: true,
      commandId: 'cmd-3',
      affectedIds: ['x'],
      toast: 'done',
      delta: { foo: 'bar' }
    };
    const redacted = redactSensitiveDeltaFields('createBatch', result);
    expect(redacted.delta).toEqual({ foo: 'bar' });
  });

  it('passes through results with no delta', () => {
    const result: CommandResult = {
      ok: true,
      commandId: 'cmd-4',
      affectedIds: [],
      toast: 'done'
    };
    const redacted = redactSensitiveDeltaFields('mintPhotoUploadToken', result);
    expect(redacted.delta).toBeUndefined();
  });

  it('does not redact a token field on an unrelated command', () => {
    const result: CommandResult = {
      ok: true,
      commandId: 'cmd-5',
      affectedIds: [],
      toast: 'done',
      delta: { token: 'this-is-not-a-credential' }
    };
    const redacted = redactSensitiveDeltaFields('someOtherCommand', result);
    expect((redacted.delta as Record<string, unknown>)?.token).toBe('this-is-not-a-credential');
  });
});
