/**
 * Vendor Management domain — Zod payload schemas.
 *
 * Extracted from src/server/services/commandBus.ts and src/shared/schemas.ts
 * with .passthrough() so the registry dispatch allows extra keys
 * that may be added by middleware or frontend pipelines.
 */
import { z } from 'zod';

export const createVendorPayloadSchema = z.object({
  name: z.string().min(1),
  termsDays: z.coerce.number().optional(),
  contact: z.string().optional(),
  notes: z.string().optional(),
  consignmentDefault: z.boolean().optional(),
}).passthrough();

export const createVendorBillPayloadSchema = z.object({
  vendorId: z.string().uuid(),
  amount: z.coerce.number(),
  dueDate: z.string().optional(),
  dueReason: z.string().optional(),
}).passthrough();

export const createVendorSupplyPayloadSchema = z.object({
  vendorId: z.string().uuid(),
  productName: z.string().min(1),
  name: z.string().optional(),
  category: z.string().min(1),
  qty: z.coerce.number().optional(),
  unitPrice: z.coerce.number().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
}).passthrough();

export const updateVendorSupplyPayloadSchema = z.object({
  vendorSupplyId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const updateVendorPayloadSchema = z.object({
  vendorId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const updateProcessorPayloadSchema = z.object({
  processorId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const approveVendorBillPayloadSchema = z.object({
  vendorBillId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const scheduleVendorPaymentPayloadSchema = z.object({
  vendorBillId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  scheduledFor: z.string().optional(),
}).passthrough();

export const recordVendorPaymentPayloadSchema = z.object({
  vendorBillId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  amount: z.coerce.number().optional(),
  method: z.string().optional(),
  reference: z.string().optional(),
  overrideUnscheduled: z.boolean().optional(),
  date: z.string().optional(),
  createdAt: z.string().optional(),
}).passthrough();

export const voidVendorPaymentPayloadSchema = z.object({
  vendorPaymentId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();
