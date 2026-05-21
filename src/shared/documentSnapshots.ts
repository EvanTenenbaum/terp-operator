import { z } from 'zod';

export const documentTypes = ['purchase_order', 'sales_order', 'customer_payment', 'vendor_payout'] as const;
export type DocumentType = (typeof documentTypes)[number];
export const documentTypeSchema = z.enum(documentTypes);

export const documentStatuses = ['draft', 'finalized', 'superseded', 'void'] as const;
export type DocumentStatus = (typeof documentStatuses)[number];
export const documentStatusSchema = z.enum(documentStatuses);

export interface ProjectionResult {
  payload: Record<string, unknown>;
  projectionVersion: number;
}

export interface DocumentSnapshotRecord {
  id: string;
  documentType: DocumentType;
  subjectId: string;
  version: number;
  status: DocumentStatus;
  internalPayload: Record<string, unknown>;
  externalPayload: Record<string, unknown>;
  projectionVersion: number;
  generatedByCommandId: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}
