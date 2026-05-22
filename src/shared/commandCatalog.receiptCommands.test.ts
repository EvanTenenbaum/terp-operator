import { describe, it, expect } from 'vitest';
import { commandLabels, commandMinRole, commandNames, reversalPolicies } from './commandCatalog';

describe('receipt commands registered in catalog', () => {
  const expected = ['saveDraftPurchaseOrderReceipt', 'abandonDraftPurchaseOrderReceipt'] as const;
  it('appears in commandNames', () => {
    for (const name of expected) expect(commandNames).toContain(name);
  });
  it('has a label', () => {
    expect(commandLabels.saveDraftPurchaseOrderReceipt).toMatch(/[Dd]raft/);
    expect(commandLabels.abandonDraftPurchaseOrderReceipt).toMatch(/[Aa]bandon/);
  });
  it('has minRole = operator', () => {
    expect(commandMinRole.saveDraftPurchaseOrderReceipt).toBe('operator');
    expect(commandMinRole.abandonDraftPurchaseOrderReceipt).toBe('operator');
  });
  it('has a terminal reversal policy in Tranche 1', () => {
    expect(reversalPolicies.saveDraftPurchaseOrderReceipt.disposition).toBe('terminal');
    expect(reversalPolicies.abandonDraftPurchaseOrderReceipt.disposition).toBe('terminal');
  });
});
