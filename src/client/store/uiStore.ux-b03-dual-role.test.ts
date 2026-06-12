/**
 * UX-B03 (part 3) — Relationship tab becomes the default drawer tab when the
 * entity is dual-role (has both AR and AP relationships).
 *
 * The dual-role signal is carried on grid rows as `isDualRole: true` when the
 * same contact is both a customer and a vendor. When uiStore.setSelectedRows
 * is called for a dual-role row on the clients or vendors view, the drawer
 * should default to the 'relationship' tab so the directional AR/AP summary
 * is immediately visible.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore } from './uiStore';
import type { GridRow } from '../../shared/types';

beforeEach(() => {
  useUiStore.setState({
    selectedRows: {},
    activeDrawerEntityByView: {},
    drawerByView: {},
  });
});

describe('UX-B03 — dual-role entity defaults to relationship tab', () => {
  it('defaults to "relationship" tab when clients row has isDualRole=true', () => {
    const dualRoleRow: GridRow = {
      id: 'c-1',
      customerId: 'c-1',
      vendorId: 'v-1',
      isDualRole: true,
      name: 'Acme Corp',
    } as GridRow;

    useUiStore.getState().setSelectedRows('clients', [dualRoleRow]);

    const { drawerByView, activeDrawerEntityByView } = useUiStore.getState();
    const entity = activeDrawerEntityByView['clients'];
    expect(entity).toBeDefined();
    const key = `clients:${entity!.entityType}:${entity!.entityId}`;
    const drawer = drawerByView[key];
    expect(drawer?.activeTab).toBe('relationship');
  });

  it('defaults to "relationship" tab when vendors row has isDualRole=true', () => {
    const dualRoleRow: GridRow = {
      id: 'b-1',
      vendorId: 'v-1',
      customerId: 'c-1',
      isDualRole: true,
      vendor: 'Acme Corp',
    } as GridRow;

    useUiStore.getState().setSelectedRows('vendors', [dualRoleRow]);

    const { drawerByView, activeDrawerEntityByView } = useUiStore.getState();
    const entity = activeDrawerEntityByView['vendors'];
    expect(entity).toBeDefined();
    const key = `vendors:${entity!.entityType}:${entity!.entityId}`;
    const drawer = drawerByView[key];
    expect(drawer?.activeTab).toBe('relationship');
  });

  it('does NOT default to relationship tab for a regular (non-dual-role) clients row', () => {
    const normalRow: GridRow = {
      id: 'c-2',
      customerId: 'c-2',
      name: 'Beta Ltd',
    } as GridRow;

    useUiStore.getState().setSelectedRows('clients', [normalRow]);

    const { drawerByView, activeDrawerEntityByView } = useUiStore.getState();
    const entity = activeDrawerEntityByView['clients'];
    expect(entity).toBeDefined();
    const key = `clients:${entity!.entityType}:${entity!.entityId}`;
    const drawer = drawerByView[key];
    // Normal customer should default to 'balance' (from defaultTabForEntity)
    expect(drawer?.activeTab).not.toBe('relationship');
    expect(drawer?.activeTab).toBe('balance');
  });
});
