import { describe, it, expect } from 'vitest';
import { documentSnapshots } from '../../schema';

describe('document_snapshots schema', () => {
  it('exposes documentSnapshots with expected columns', () => {
    expect(documentSnapshots).toBeDefined();
    // Drizzle pgTable exposes column accessors as properties.
    const required = [
      'id', 'documentType', 'subjectId', 'version', 'status',
      'internalPayload', 'externalPayload', 'projectionVersion',
      'generatedByCommandId', 'createdAt', 'updatedAt'
    ] as const;
    for (const col of required) {
      expect((documentSnapshots as unknown as Record<string, unknown>)[col]).toBeDefined();
    }
  });
});
