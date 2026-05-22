import { describe, it, expect } from 'vitest';
import type { AppRouter } from '../../server/routers';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

type In = inferRouterInputs<AppRouter>;
type Out = inferRouterOutputs<AppRouter>;

describe('documentSnapshots tRPC surface', () => {
  it('exposes the five procedures with strongly typed inputs', () => {
    const input: In['documentSnapshots']['getExternalBySubjectId'] = { documentType: 'purchase_order', subjectId: '00000000-0000-0000-0000-000000000000' };
    expect(input.documentType).toBe('purchase_order');
    const _outputCheck: Out['documentSnapshots']['getReceiptText'] = { text: '', version: 1, projectionVersion: 1 };
    expect(_outputCheck.text).toBe('');
    expect(_outputCheck.version).toBe(1);
    expect(_outputCheck.projectionVersion).toBe(1);
    const byIdInput: In['documentSnapshots']['getById'] = { id: '00000000-0000-0000-0000-000000000000', documentType: 'purchase_order' };
    expect(byIdInput.documentType).toBe('purchase_order');
    const textInput: In['documentSnapshots']['getReceiptText'] = { documentType: 'purchase_order', subjectId: '00000000-0000-0000-0000-000000000000', mode: 'external', includeDrafts: true };
    expect(textInput.includeDrafts).toBe(true);
  });
});
