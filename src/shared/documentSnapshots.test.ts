import { describe, it, expect } from 'vitest';
import {
  documentTypes,
  documentStatuses,
  documentTypeSchema,
  documentStatusSchema,
  type DocumentType,
  type DocumentStatus
} from './documentSnapshots';

describe('shared documentSnapshots constants', () => {
  it('lists supported document types in stable order', () => {
    expect(documentTypes).toEqual(['purchase_order', 'sales_order', 'customer_payment', 'vendor_payout']);
  });
  it('lists supported statuses in stable order', () => {
    expect(documentStatuses).toEqual(['draft', 'finalized', 'superseded', 'void']);
  });
  it('zod schemas accept valid values', () => {
    expect(documentTypeSchema.parse('purchase_order')).toBe('purchase_order');
    expect(documentStatusSchema.parse('finalized')).toBe('finalized');
  });
  it('zod schemas reject invalid values', () => {
    expect(() => documentTypeSchema.parse('foo')).toThrow();
    expect(() => documentStatusSchema.parse('open')).toThrow();
  });
});
