import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  createContactPayloadSchema,
  updateContactPayloadSchema,
  archiveContactPayloadSchema,
  addContactRolePayloadSchema,
  linkContactToExistingEntityPayloadSchema,
  linkContactToUserPayloadSchema,
  createAppointmentPayloadSchema,
  updateAppointmentPayloadSchema,
  cancelAppointmentPayloadSchema,
  completeAppointmentPayloadSchema,
  updateVendorPayloadSchema,
  updateProcessorPayloadSchema
} from '../shared/schemas';

// Use a stable UUID literal for entity-id values so tests don't depend on
// the runtime crypto.randomUUID API.
const UUID = 'a0000000-0000-0000-0000-000000000000';
const NOW_ISO = '2026-05-22T20:00:00.000Z';

describe('createContactPayloadSchema', () => {
  it('rejects missing name', () => {
    expect(() => createContactPayloadSchema.parse({ roles: ['customer'] })).toThrow(ZodError);
  });

  it('rejects empty roles array', () => {
    expect(() => createContactPayloadSchema.parse({ name: 'Test', roles: [] })).toThrow(ZodError);
  });

  it('rejects empty name string', () => {
    expect(() => createContactPayloadSchema.parse({ name: '', roles: ['customer'] })).toThrow(ZodError);
  });

  it('rejects invalid role', () => {
    expect(() =>
      createContactPayloadSchema.parse({ name: 'Test', roles: ['notARole'] as unknown as ['customer'] })
    ).toThrow(ZodError);
  });

  it('accepts minimal valid payload with defaults applied', () => {
    const result = createContactPayloadSchema.parse({ name: 'ACME Corp', roles: ['customer'] });
    expect(result.name).toBe('ACME Corp');
    expect(result.roles).toContain('customer');
    expect(result.contactKind).toBe('individual');
    expect(result.preferredContactMethod).toBe('any');
    expect(result.tags).toEqual([]);
  });

  it('accepts multi-role payload with role-specific fields', () => {
    const result = createContactPayloadSchema.parse({
      name: 'Dual Corp',
      roles: ['customer', 'vendor'],
      creditLimit: 5000,
      termsDays: 30,
      consignmentDefault: true
    });
    expect(result.creditLimit).toBe(5000);
    expect(result.termsDays).toBe(30);
    expect(result.consignmentDefault).toBe(true);
  });

  it('rejects invalid email', () => {
    expect(() =>
      createContactPayloadSchema.parse({ name: 'Test', roles: ['customer'], email: 'not-an-email' })
    ).toThrow(ZodError);
  });
});

describe('updateContactPayloadSchema', () => {
  it('rejects missing contactId', () => {
    expect(() => updateContactPayloadSchema.parse({ name: 'New Name' })).toThrow(ZodError);
  });

  it('rejects non-uuid contactId', () => {
    expect(() => updateContactPayloadSchema.parse({ contactId: 'not-a-uuid', name: 'X' })).toThrow(ZodError);
  });

  it('accepts partial update', () => {
    const result = updateContactPayloadSchema.parse({ contactId: UUID, phone: '555-1234' });
    expect(result.phone).toBe('555-1234');
  });

  it('accepts nullable fields explicitly set to null', () => {
    const result = updateContactPayloadSchema.parse({ contactId: UUID, phone: null });
    expect(result.phone).toBeNull();
  });
});

describe('archiveContactPayloadSchema', () => {
  it('rejects missing reason', () => {
    expect(() => archiveContactPayloadSchema.parse({ contactId: UUID })).toThrow(ZodError);
  });

  it('rejects empty reason', () => {
    expect(() => archiveContactPayloadSchema.parse({ contactId: UUID, reason: '   ' })).toThrow(ZodError);
  });

  it('accepts valid archive payload', () => {
    const result = archiveContactPayloadSchema.parse({ contactId: UUID, reason: 'duplicate' });
    expect(result.reason).toBe('duplicate');
  });
});

describe('addContactRolePayloadSchema', () => {
  it('rejects invalid role', () => {
    expect(() =>
      addContactRolePayloadSchema.parse({ contactId: UUID, role: 'invalid' as unknown as 'customer' })
    ).toThrow(ZodError);
  });

  it('accepts role-only payload', () => {
    const result = addContactRolePayloadSchema.parse({ contactId: UUID, role: 'contractor' });
    expect(result.role).toBe('contractor');
  });
});

describe('linkContactToExistingEntityPayloadSchema', () => {
  it('rejects invalid entityType', () => {
    expect(() =>
      linkContactToExistingEntityPayloadSchema.parse({
        contactId: UUID,
        entityType: 'contractor' as unknown as 'customer',
        entityId: UUID
      })
    ).toThrow(ZodError);
  });

  it('accepts valid link payload', () => {
    const result = linkContactToExistingEntityPayloadSchema.parse({
      contactId: UUID,
      entityType: 'vendor',
      entityId: UUID
    });
    expect(result.entityType).toBe('vendor');
  });
});

describe('linkContactToUserPayloadSchema', () => {
  it('rejects non-uuid userId', () => {
    expect(() => linkContactToUserPayloadSchema.parse({ contactId: UUID, userId: 'x' })).toThrow(ZodError);
  });

  it('accepts valid link', () => {
    const result = linkContactToUserPayloadSchema.parse({ contactId: UUID, userId: UUID });
    expect(result.userId).toBe(UUID);
  });
});

describe('createAppointmentPayloadSchema', () => {
  it('rejects missing contactId', () => {
    expect(() =>
      createAppointmentPayloadSchema.parse({ title: 'Meeting', startsAt: NOW_ISO })
    ).toThrow(ZodError);
  });

  it('rejects missing title', () => {
    expect(() => createAppointmentPayloadSchema.parse({ contactId: UUID, startsAt: NOW_ISO })).toThrow(ZodError);
  });

  it('rejects non-ISO startsAt', () => {
    expect(() =>
      createAppointmentPayloadSchema.parse({ contactId: UUID, title: 'X', startsAt: 'tomorrow' })
    ).toThrow(ZodError);
  });

  it('accepts valid appointment with default type', () => {
    const result = createAppointmentPayloadSchema.parse({
      contactId: UUID,
      title: 'Client call',
      startsAt: NOW_ISO
    });
    expect(result.title).toBe('Client call');
    expect(result.appointmentType).toBe('meeting');
  });
});

describe('updateAppointmentPayloadSchema', () => {
  it('rejects missing appointmentId', () => {
    expect(() => updateAppointmentPayloadSchema.parse({ title: 'New' })).toThrow(ZodError);
  });

  it('accepts partial update', () => {
    const result = updateAppointmentPayloadSchema.parse({ appointmentId: UUID, title: 'Revised' });
    expect(result.title).toBe('Revised');
  });
});

describe('cancelAppointmentPayloadSchema', () => {
  it('accepts reason-less cancel', () => {
    const result = cancelAppointmentPayloadSchema.parse({ appointmentId: UUID });
    expect(result.appointmentId).toBe(UUID);
  });
});

describe('completeAppointmentPayloadSchema', () => {
  it('accepts completion with notes', () => {
    const result = completeAppointmentPayloadSchema.parse({ appointmentId: UUID, notes: 'done' });
    expect(result.notes).toBe('done');
  });
});

describe('updateVendorPayloadSchema', () => {
  it('rejects missing vendorId', () => {
    expect(() => updateVendorPayloadSchema.parse({ name: 'New Name' })).toThrow(ZodError);
  });

  it('accepts partial update', () => {
    const result = updateVendorPayloadSchema.parse({ vendorId: UUID, termsDays: 21 });
    expect(result.termsDays).toBe(21);
  });

  it('rejects out-of-range termsDays', () => {
    expect(() => updateVendorPayloadSchema.parse({ vendorId: UUID, termsDays: 999 })).toThrow(ZodError);
  });
});

describe('updateProcessorPayloadSchema', () => {
  it('rejects missing processorId', () => {
    expect(() => updateProcessorPayloadSchema.parse({ name: 'New' })).toThrow(ZodError);
  });

  it('accepts partial update with numeric fields', () => {
    const result = updateProcessorPayloadSchema.parse({
      processorId: UUID,
      feePercentage: 2.5,
      defaultUserSplit: 50
    });
    expect(result.feePercentage).toBe(2.5);
    expect(result.defaultUserSplit).toBe(50);
  });

  it('rejects out-of-range percentages', () => {
    expect(() => updateProcessorPayloadSchema.parse({ processorId: UUID, feePercentage: 150 })).toThrow(ZodError);
  });
});
