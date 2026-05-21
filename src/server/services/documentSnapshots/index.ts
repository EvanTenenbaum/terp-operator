import type { DocumentType } from '../../../shared/documentSnapshots';
import * as poProjection from './poProjection';

export interface ProjectionModule {
  EXTERNAL_FIELDS: readonly string[];
  PROJECTION_VERSION: number;
  projectExternal: (internal: unknown) => { payload: Record<string, unknown>; projectionVersion: number };
  renderPlainTextExternal: (external: Record<string, unknown>) => string;
  renderPlainTextInternal: (internal: Record<string, unknown>) => string;
}

const REGISTRY: Partial<Record<DocumentType, ProjectionModule>> = {
  purchase_order: {
    EXTERNAL_FIELDS: poProjection.EXTERNAL_FIELDS,
    PROJECTION_VERSION: poProjection.PROJECTION_VERSION,
    projectExternal: poProjection.projectExternal,
    renderPlainTextExternal: poProjection.renderPlainTextExternal,
    renderPlainTextInternal: poProjection.renderPlainTextInternal
  }
};

export function hasProjectionFor(documentType: DocumentType): boolean {
  return Boolean(REGISTRY[documentType]);
}

export function getProjectionFor(documentType: DocumentType): ProjectionModule {
  const entry = REGISTRY[documentType];
  if (!entry) throw new Error(`No projection registered for document_type "${documentType}"`);
  return entry;
}
