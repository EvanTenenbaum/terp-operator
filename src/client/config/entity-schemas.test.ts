import { describe, it, expect } from 'vitest';
import {
  purchaseOrderSchema,
  saleSchema,
  paymentSchema,
  intakeSchema,
  customerSchema,
  vendorSchema,
} from './entity-schemas';
import type { EntityFieldSchema } from './entity-schemas';

const allSchemas: EntityFieldSchema[] = [
  purchaseOrderSchema,
  saleSchema,
  paymentSchema,
  intakeSchema,
  customerSchema,
  vendorSchema,
];

describe('entity-schemas — structure', () => {
  it('all schemas have required properties', () => {
    for (const schema of allSchemas) {
      expect(schema).toHaveProperty('entity');
      expect(typeof schema.entity).toBe('string');
      expect(schema).toHaveProperty('label');
      expect(typeof schema.label).toBe('string');
      expect(schema).toHaveProperty('fields');
      expect(Array.isArray(schema.fields)).toBe(true);
      expect(schema.fields.length).toBeGreaterThan(0);
    }
  });

  it('all fields have required properties', () => {
    for (const schema of allSchemas) {
      for (const field of schema.fields) {
        expect(field).toHaveProperty('field');
        expect(typeof field.field).toBe('string');
        expect(field).toHaveProperty('type');
        expect(field).toHaveProperty('headerName');
        expect(typeof field.headerName).toBe('string');
        expect(field).toHaveProperty('attentionTier');
        expect([0, 1, 2]).toContain(field.attentionTier);
        expect(field).toHaveProperty('attentionRationale');
        expect(typeof field.attentionRationale).toBe('string');
      }
    }
  });

  it('Tier 0 fields (always visible) are present in every schema', () => {
    for (const schema of allSchemas) {
      const tier0Fields = schema.fields.filter((f) => f.attentionTier === 0);
      expect(tier0Fields.length).toBeGreaterThan(0);
    }
  });

  it('no duplicate field keys within a schema', () => {
    for (const schema of allSchemas) {
      const keys = schema.fields.map((f) => f.field);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    }
  });

  it('valid field types', () => {
    const validTypes = ['text', 'numeric', 'date', 'boolean', 'enum', 'combobox', 'tags', 'currency'];
    for (const schema of allSchemas) {
      for (const field of schema.fields) {
        expect(validTypes).toContain(field.type);
      }
    }
  });
});

describe('entity-schemas — specific schemas', () => {
  it('purchaseOrder schema contains identity fields', () => {
    const po = purchaseOrderSchema;
    expect(po.entity).toBe('purchaseOrder');
    const fields = po.fields.map((f) => f.field);
    expect(fields).toContain('id');
    expect(fields).toContain('poNo');
    expect(fields).toContain('vendor');
    expect(fields).toContain('status');
  });

  it('sale schema contains identity fields', () => {
    const so = saleSchema;
    expect(so.entity).toBe('sale');
    const fields = so.fields.map((f) => f.field);
    expect(fields).toContain('id');
    expect(fields).toContain('orderNo');
    expect(fields).toContain('customer');
    expect(fields).toContain('status');
  });

  it('payment schema contains identity fields', () => {
    const pay = paymentSchema;
    expect(pay.entity).toBe('payment');
    const fields = pay.fields.map((f) => f.field);
    expect(fields).toContain('id');
    expect(fields).toContain('customer');
    expect(fields).toContain('amount');
    expect(fields).toContain('status');
  });

  it('intake schema contains identity fields', () => {
    const intake = intakeSchema;
    expect(intake.entity).toBe('intake');
    const fields = intake.fields.map((f) => f.field);
    expect(fields).toContain('id');
    expect(fields).toContain('batchCode');
    expect(fields).toContain('name');
    expect(fields).toContain('status');
  });
});
