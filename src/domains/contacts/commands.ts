/**
 * Contacts domain — command handlers.
 *
 * Extracted from src/server/services/commandBus.ts in P1.CT.EXTRACT.
 *
 * NOTE: this module intentionally imports helpers and schemas from
 * `@/server/services/commandBus`. commandBus.ts in turn re-imports the exported
 * contacts handlers from this module, which creates a circular import. This
 * is safe under ESM because every reference to those imported bindings lives
 * inside a function body — by the time runCommand() invokes a contacts
 * handler, commandBus.ts has fully evaluated and the live bindings are
 * resolved (same pattern as P1.PO.EXTRACT, P1.SAL.EXTRACT, P1.PAY.EXTRACT).
 *
 * Future cleanup (P2+): hoist the shared helpers to @/domains/shared/
 * and remove the cycle entirely.
 */

import { eq } from 'drizzle-orm';

import {
  appointments,
  contacts,
  customers,
  paymentProcessors,
  referees,
  users,
  vendors,
} from '@/server/schema';
import type { Tx } from '@/server/db';
import { pool } from '@/server/db';

import type { CommandResult, SessionUser } from '../../shared/types';

// Schemas from shared/schemas
import {
  addContactRolePayloadSchema,
  archiveContactPayloadSchema,
  cancelAppointmentPayloadSchema,
  completeAppointmentPayloadSchema,
  createAppointmentPayloadSchema,
  createContactPayloadSchema,
  linkContactToExistingEntityPayloadSchema,
  linkContactToUserPayloadSchema,
  updateAppointmentPayloadSchema,
  updateContactPayloadSchema,
} from '../../shared/schemas';

// Helpers and the Payload type are kept in commandBus.ts for this phase
// (see header comment).
import {
  moneyScale,
  requiredId,
  stringValue,
  // Types
  type Payload,
} from '@/server/services/commandBus';

// ─── Contacts command handlers ───────────────────────────────────────────────

export async function createContact(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const parsed = createContactPayloadSchema.parse(payload);
  const name = parsed.name.trim();

  const roleFlags = {
    isCustomer: parsed.roles.includes('customer'),
    isVendor: parsed.roles.includes('vendor'),
    isReferee: parsed.roles.includes('referee'),
    isProcessor: parsed.roles.includes('processor'),
    isContractor: parsed.roles.includes('contractor'),
    isEmployee: parsed.roles.includes('employee')
  };

  const [contact] = await tx
    .insert(contacts)
    .values({
      name,
      displayName: parsed.displayName ?? null,
      phone: parsed.phone ?? null,
      secondaryPhone: parsed.secondaryPhone ?? null,
      email: parsed.email ?? null,
      address: parsed.address ?? null,
      companyName: parsed.companyName ?? null,
      contactKind: parsed.contactKind,
      preferredContactMethod: parsed.preferredContactMethod,
      notes: parsed.notes ?? null,
      tags: parsed.tags,
      ...roleFlags
    })
    .returning();

  const affectedIds: string[] = [contact.id];

  // Create the customer operational row when 'customer' is included.
  if (roleFlags.isCustomer) {
    const [cust] = await tx
      .insert(customers)
      .values({
        name,
        creditLimit: moneyScale(parsed.creditLimit ?? 0),
        balance: '0',
        tags: parsed.tags,
        notes: parsed.notes ?? null,
        contactId: contact.id
      })
      .returning();
    affectedIds.push(cust.id);
  }

  // Create the vendor operational row when 'vendor' is included.
  if (roleFlags.isVendor) {
    const [vend] = await tx
      .insert(vendors)
      .values({
        name,
        termsDays: parsed.termsDays ?? 14,
        consignmentDefault: parsed.consignmentDefault ?? false,
        notes: parsed.notes ?? null,
        contactId: contact.id
      })
      .returning();
    affectedIds.push(vend.id);
  }

  // Contractor / employee / referee / processor roles set the flag only.
  // The referees and payment_processors operational tables hold richer
  // financial data that is intentionally created via their own commands.

  return { ok: true, commandId, affectedIds, toast: `Contact "${name}" created.` };
}

export async function updateContact(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const parsed = updateContactPayloadSchema.parse(payload);
  const { contactId } = parsed;
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.name !== undefined) values.name = parsed.name;
  if (parsed.displayName !== undefined) values.displayName = parsed.displayName;
  if (parsed.phone !== undefined) values.phone = parsed.phone;
  if (parsed.secondaryPhone !== undefined) values.secondaryPhone = parsed.secondaryPhone;
  if (parsed.email !== undefined) values.email = parsed.email;
  if (parsed.address !== undefined) values.address = parsed.address;
  if (parsed.companyName !== undefined) values.companyName = parsed.companyName;
  if (parsed.contactKind !== undefined) values.contactKind = parsed.contactKind;
  if (parsed.preferredContactMethod !== undefined) values.preferredContactMethod = parsed.preferredContactMethod;
  if (parsed.notes !== undefined) values.notes = parsed.notes;

  const result = await tx.update(contacts).set(values).where(eq(contacts.id, contactId)).returning({ id: contacts.id });
  if (result.length === 0) throw new Error('Contact not found.');
  return { ok: true, commandId, affectedIds: [contactId], toast: 'Contact updated.' };
}

export async function archiveContact(tx: Tx, payload: Payload, user: SessionUser, commandId: string): Promise<CommandResult> {
  const parsed = archiveContactPayloadSchema.parse(payload);
  const { contactId, reason } = parsed;

  const [contact] = await tx.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!contact) throw new Error('Contact not found.');
  if (!contact.active) throw new Error('Contact is already archived.');

  // Per-role open-work guards. Use raw pool queries for tables that may not
  // have Drizzle definitions imported here and to keep the predicates close
  // to the spec.
  if (contact.isCustomer) {
    const [custRow] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.contactId, contactId))
      .limit(1);
    if (custRow) {
      const open = await pool.query(
        `SELECT 1 FROM invoices WHERE customer_id = $1 AND status IN ('open','partial') LIMIT 1`,
        [custRow.id]
      );
      if (open.rows.length > 0) {
        throw new Error('Cannot archive: customer has open or partially-paid invoices.');
      }
    }
  }

  if (contact.isVendor) {
    const [vendRow] = await tx
      .select({ id: vendors.id })
      .from(vendors)
      .where(eq(vendors.contactId, contactId))
      .limit(1);
    if (vendRow) {
      const open = await pool.query(
        `SELECT 1 FROM vendor_bills WHERE vendor_id = $1 AND status NOT IN ('paid','void','cancelled') LIMIT 1`,
        [vendRow.id]
      );
      if (open.rows.length > 0) {
        throw new Error('Cannot archive: vendor has unpaid bills.');
      }
    }
  }

  if (contact.isReferee) {
    const [refRow] = await tx
      .select({ id: referees.id })
      .from(referees)
      .where(eq(referees.contactId, contactId))
      .limit(1);
    if (refRow) {
      const open = await pool.query(
        `SELECT 1 FROM referee_relationships WHERE referee_id = $1 AND active = true LIMIT 1`,
        [refRow.id]
      );
      if (open.rows.length > 0) {
        throw new Error('Cannot archive: referee has active relationships.');
      }
    }
  }

  if (contact.isProcessor) {
    const [procRow] = await tx
      .select({ id: paymentProcessors.id })
      .from(paymentProcessors)
      .where(eq(paymentProcessors.contactId, contactId))
      .limit(1);
    if (procRow) {
      const open = await pool.query(
        `SELECT 1 FROM processor_fees WHERE processor_id = $1 AND user_fee_status != 'collected' LIMIT 1`,
        [procRow.id]
      );
      if (open.rows.length > 0) {
        throw new Error('Cannot archive: processor has uncollected user fees.');
      }
    }
  }

  if (contact.isContractor || contact.isEmployee) {
    // contact_ledger_entries: positive = owed to contact (per
    // postTransactionLedgerRow's signing for entityType='contact'). A SUM>0
    // means an outstanding balance still owed to the contact and blocks
    // archive. SUM<=0 (paid in full or net even) is OK.
    const bal = await pool.query(
      `SELECT COALESCE(SUM(amount), 0)::text AS balance FROM contact_ledger_entries WHERE contact_id = $1`,
      [contactId]
    );
    const balance = Number(bal.rows[0]?.balance ?? 0);
    if (balance > 0) {
      throw new Error('Cannot archive: contact has outstanding balance owed.');
    }
  }

  await tx
    .update(contacts)
    .set({
      active: false,
      archivedAt: new Date(),
      archivedBy: user.id,
      archivedReason: reason,
      updatedAt: new Date()
    })
    .where(eq(contacts.id, contactId));

  return { ok: true, commandId, affectedIds: [contactId], toast: 'Contact archived.' };
}

export async function addContactRole(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const parsed = addContactRolePayloadSchema.parse(payload);
  const { contactId, role } = parsed;

  const [contact] = await tx.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!contact) throw new Error('Contact not found.');

  // Map role → flag column.
  const flagSet: Record<string, unknown> = { updatedAt: new Date() };
  switch (role) {
    case 'customer':
      flagSet.isCustomer = true;
      break;
    case 'vendor':
      flagSet.isVendor = true;
      break;
    case 'referee':
      flagSet.isReferee = true;
      break;
    case 'processor':
      flagSet.isProcessor = true;
      break;
    case 'contractor':
      flagSet.isContractor = true;
      break;
    case 'employee':
      flagSet.isEmployee = true;
      break;
  }
  await tx.update(contacts).set(flagSet).where(eq(contacts.id, contactId));

  const affectedIds: string[] = [contactId];

  // For customer/vendor, also create the operational row if one doesn't
  // already exist (the contact may have just been migrated to a customer-only
  // state and is being upgraded to a dual-role contact).
  if (role === 'customer') {
    const [existing] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.contactId, contactId))
      .limit(1);
    if (!existing) {
      const [cust] = await tx
        .insert(customers)
        .values({
          name: contact.name,
          creditLimit: moneyScale(parsed.creditLimit ?? 0),
          balance: '0',
          tags: [],
          contactId
        })
        .returning();
      affectedIds.push(cust.id);
    }
  } else if (role === 'vendor') {
    const [existing] = await tx
      .select({ id: vendors.id })
      .from(vendors)
      .where(eq(vendors.contactId, contactId))
      .limit(1);
    if (!existing) {
      const [vend] = await tx
        .insert(vendors)
        .values({
          name: contact.name,
          termsDays: parsed.termsDays ?? 14,
          consignmentDefault: parsed.consignmentDefault ?? false,
          contactId
        })
        .returning();
      affectedIds.push(vend.id);
    }
  }

  return { ok: true, commandId, affectedIds, toast: `Role "${role}" added to contact.` };
}

export async function linkContactToExistingEntity(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const parsed = linkContactToExistingEntityPayloadSchema.parse(payload);
  const { contactId, entityType, entityId } = parsed;

  const [contact] = await tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!contact) throw new Error('Contact not found.');

  if (entityType === 'customer') {
    const [existing] = await tx
      .select({ contactId: customers.contactId })
      .from(customers)
      .where(eq(customers.id, entityId))
      .limit(1);
    if (!existing) throw new Error('Customer not found.');
    if (existing.contactId) throw new Error('This customer is already linked to a contact.');
    await tx.update(customers).set({ contactId, updatedAt: new Date() }).where(eq(customers.id, entityId));
    await tx.update(contacts).set({ isCustomer: true, updatedAt: new Date() }).where(eq(contacts.id, contactId));
  } else if (entityType === 'vendor') {
    const [existing] = await tx
      .select({ contactId: vendors.contactId })
      .from(vendors)
      .where(eq(vendors.id, entityId))
      .limit(1);
    if (!existing) throw new Error('Vendor not found.');
    if (existing.contactId) throw new Error('This vendor is already linked to a contact.');
    await tx.update(vendors).set({ contactId, updatedAt: new Date() }).where(eq(vendors.id, entityId));
    await tx.update(contacts).set({ isVendor: true, updatedAt: new Date() }).where(eq(contacts.id, contactId));
  } else if (entityType === 'referee') {
    const [existing] = await tx
      .select({ contactId: referees.contactId })
      .from(referees)
      .where(eq(referees.id, entityId))
      .limit(1);
    if (!existing) throw new Error('Referee not found.');
    if (existing.contactId) throw new Error('This referee is already linked to a contact.');
    await tx.update(referees).set({ contactId, updatedAt: new Date() }).where(eq(referees.id, entityId));
    await tx.update(contacts).set({ isReferee: true, updatedAt: new Date() }).where(eq(contacts.id, contactId));
  } else if (entityType === 'processor') {
    const [existing] = await tx
      .select({ contactId: paymentProcessors.contactId })
      .from(paymentProcessors)
      .where(eq(paymentProcessors.id, entityId))
      .limit(1);
    if (!existing) throw new Error('Processor not found.');
    if (existing.contactId) throw new Error('This processor is already linked to a contact.');
    await tx.update(paymentProcessors).set({ contactId, updatedAt: new Date() }).where(eq(paymentProcessors.id, entityId));
    await tx.update(contacts).set({ isProcessor: true, updatedAt: new Date() }).where(eq(contacts.id, contactId));
  }

  return { ok: true, commandId, affectedIds: [contactId, entityId], toast: 'Contact linked.' };
}

export async function linkContactToUser(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const parsed = linkContactToUserPayloadSchema.parse(payload);
  const { contactId, userId } = parsed;

  const [contact] = await tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!contact) throw new Error('Contact not found.');

  const [user] = await tx.select({ contactId: users.contactId }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error('User not found.');
  if (user.contactId) throw new Error('This user is already linked to a contact.');

  await tx.update(users).set({ contactId, updatedAt: new Date() }).where(eq(users.id, userId));
  await tx.update(contacts).set({ isEmployee: true, updatedAt: new Date() }).where(eq(contacts.id, contactId));

  return { ok: true, commandId, affectedIds: [contactId, userId], toast: 'User account linked to contact.' };
}

export async function createAppointment(tx: Tx, payload: Payload, userId: string, commandId: string): Promise<CommandResult> {
  const parsed = createAppointmentPayloadSchema.parse(payload);

  // Verify the contact exists; appointments must always anchor to a contact.
  const [contact] = await tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, parsed.contactId)).limit(1);
  if (!contact) throw new Error('Contact not found.');

  const [appt] = await tx
    .insert(appointments)
    .values({
      contactId: parsed.contactId,
      title: parsed.title,
      appointmentType: parsed.appointmentType,
      startsAt: new Date(parsed.startsAt),
      endsAt: parsed.endsAt ? new Date(parsed.endsAt) : null,
      location: parsed.location ?? null,
      description: parsed.description ?? null,
      notes: parsed.notes ?? null,
      createdBy: userId
    })
    .returning();

  return { ok: true, commandId, affectedIds: [appt.id, parsed.contactId], toast: 'Appointment added.' };
}

export async function updateAppointment(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const parsed = updateAppointmentPayloadSchema.parse(payload);
  const { appointmentId } = parsed;

  const [existing] = await tx
    .select({ status: appointments.status, contactId: appointments.contactId })
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  if (!existing) throw new Error('Appointment not found.');
  if (existing.status !== 'scheduled') {
    throw new Error('Only scheduled appointments can be updated.');
  }

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.title !== undefined) values.title = parsed.title;
  if (parsed.appointmentType !== undefined) values.appointmentType = parsed.appointmentType;
  if (parsed.startsAt !== undefined) values.startsAt = new Date(parsed.startsAt);
  if (parsed.endsAt !== undefined) values.endsAt = parsed.endsAt ? new Date(parsed.endsAt) : null;
  if (parsed.location !== undefined) values.location = parsed.location;
  if (parsed.description !== undefined) values.description = parsed.description;
  if (parsed.notes !== undefined) values.notes = parsed.notes;

  await tx.update(appointments).set(values).where(eq(appointments.id, appointmentId));
  return { ok: true, commandId, affectedIds: [appointmentId, existing.contactId], toast: 'Appointment updated.' };
}

export async function cancelAppointment(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const parsed = cancelAppointmentPayloadSchema.parse(payload);
  const { appointmentId, reason } = parsed;

  const [existing] = await tx
    .select({ status: appointments.status, contactId: appointments.contactId, notes: appointments.notes })
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  if (!existing) throw new Error('Appointment not found.');
  if (existing.status === 'cancelled') {
    return { ok: true, commandId, affectedIds: [appointmentId, existing.contactId], toast: 'Appointment already cancelled.' };
  }
  if (existing.status === 'completed') {
    throw new Error('Cannot cancel a completed appointment.');
  }

  // Preserve any existing notes and append the cancellation reason if provided
  // (the prior notes are operator-authored content; do not clobber them).
  const nextNotes = reason
    ? (existing.notes ? `${existing.notes}\n\n[Cancelled] ${reason}` : `[Cancelled] ${reason}`)
    : existing.notes;

  await tx
    .update(appointments)
    .set({ status: 'cancelled', notes: nextNotes ?? null, updatedAt: new Date() })
    .where(eq(appointments.id, appointmentId));

  return { ok: true, commandId, affectedIds: [appointmentId, existing.contactId], toast: 'Appointment cancelled.' };
}

export async function completeAppointment(tx: Tx, payload: Payload, commandId: string): Promise<CommandResult> {
  const parsed = completeAppointmentPayloadSchema.parse(payload);
  const { appointmentId } = parsed;

  const [existing] = await tx
    .select({ status: appointments.status, contactId: appointments.contactId, notes: appointments.notes })
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  if (!existing) throw new Error('Appointment not found.');
  if (existing.status === 'completed') {
    return { ok: true, commandId, affectedIds: [appointmentId, existing.contactId], toast: 'Appointment already completed.' };
  }
  if (existing.status === 'cancelled') {
    throw new Error('Cannot complete a cancelled appointment.');
  }

  const completionNote = parsed.notes;
  const nextNotes = completionNote
    ? (existing.notes ? `${existing.notes}\n\n[Completed] ${completionNote}` : `[Completed] ${completionNote}`)
    : existing.notes;

  await tx
    .update(appointments)
    .set({ status: 'completed', notes: nextNotes ?? null, updatedAt: new Date() })
    .where(eq(appointments.id, appointmentId));

  return { ok: true, commandId, affectedIds: [appointmentId, existing.contactId], toast: 'Appointment completed.' };
}
