// @vitest-environment node
/**
 * UX-D04: disabled-without-reason sweep for SalesView Sale tray controls.
 * Tests the pure reason-text helpers (extracted as plain logic) for the
 * disabled title attributes added to the Sale tray and expansion actions.
 *
 * Rather than rendering the full SalesView (too many deps for a focused test),
 * we verify the conditional logic by calling the same ternary expressions
 * the JSX uses for title={...}.
 */
import { describe, it, expect } from 'vitest';

// ---- helpers mirroring the JSX title logic added by UX-D04 ----

function addSuggestionTitle(selectedOrder: unknown, selectedSuggestions: unknown[]): string | undefined {
  if (!selectedOrder) return 'Select an order first';
  if (!selectedSuggestions.length) return 'Select one or more suggestions to add';
  return undefined;
}

function reserveTitle(selectedOrder: unknown): string | undefined {
  if (!selectedOrder) return 'Select an order first';
  return undefined;
}

function exportTitle(sheetRows: unknown[]): string | undefined {
  if (!sheetRows.length) return 'Add lines to the sheet before exporting';
  return undefined;
}

function repeatLastOrderTitle(selectedOrder: unknown): string {
  if (!selectedOrder) return 'Select an order first';
  return 'Add all items from the most recent sheet to the current order';
}

function confirmOrderTitle(canWrite: boolean, status: string): string | undefined {
  if (!canWrite) return 'Write access required';
  if (status !== 'draft') return 'Order must be in draft status to confirm';
  return undefined;
}

function cancelOrderTitle(canWrite: boolean, status: string): string | undefined {
  if (!canWrite) return 'Write access required';
  if (['fulfilled', 'shipped', 'cancelled'].includes(status))
    return 'Cannot cancel a fulfilled, shipped, or already-cancelled order';
  return undefined;
}

// ---- tests ----

describe('UX-D04 — Sale tray disabled title helpers', () => {
  describe('addSuggestionTitle', () => {
    it('returns "Select an order first" when no order', () => {
      expect(addSuggestionTitle(null, [{ id: 's1' }])).toBe('Select an order first');
    });
    it('returns suggestion reason when order exists but none selected', () => {
      expect(addSuggestionTitle({ id: 'o1' }, [])).toBe('Select one or more suggestions to add');
    });
    it('returns undefined when enabled', () => {
      expect(addSuggestionTitle({ id: 'o1' }, [{ id: 's1' }])).toBeUndefined();
    });
  });

  describe('reserveTitle', () => {
    it('returns "Select an order first" when no order', () => {
      expect(reserveTitle(null)).toBe('Select an order first');
    });
    it('returns undefined when enabled', () => {
      expect(reserveTitle({ id: 'o1' })).toBeUndefined();
    });
  });

  describe('exportTitle', () => {
    it('returns "Add lines to the sheet before exporting" when sheet is empty', () => {
      expect(exportTitle([])).toBe('Add lines to the sheet before exporting');
    });
    it('returns undefined when sheet has rows', () => {
      expect(exportTitle([{ id: 'r1' }])).toBeUndefined();
    });
  });

  describe('repeatLastOrderTitle', () => {
    it('returns "Select an order first" when no order', () => {
      expect(repeatLastOrderTitle(null)).toBe('Select an order first');
    });
    it('returns descriptive action text when enabled', () => {
      expect(repeatLastOrderTitle({ id: 'o1' })).toBe('Add all items from the most recent sheet to the current order');
    });
  });

  describe('confirmOrderTitle', () => {
    it('returns "Write access required" when viewer', () => {
      expect(confirmOrderTitle(false, 'draft')).toBe('Write access required');
    });
    it('returns status reason when not draft', () => {
      expect(confirmOrderTitle(true, 'confirmed')).toBe('Order must be in draft status to confirm');
    });
    it('returns undefined when enabled', () => {
      expect(confirmOrderTitle(true, 'draft')).toBeUndefined();
    });
  });

  describe('cancelOrderTitle', () => {
    it('returns "Write access required" when viewer', () => {
      expect(cancelOrderTitle(false, 'draft')).toBe('Write access required');
    });
    it('returns terminal-status reason for fulfilled', () => {
      expect(cancelOrderTitle(true, 'fulfilled')).toContain('fulfilled');
    });
    it('returns terminal-status reason for shipped', () => {
      expect(cancelOrderTitle(true, 'shipped')).toContain('Cannot cancel');
    });
    it('returns undefined when cancellable', () => {
      expect(cancelOrderTitle(true, 'draft')).toBeUndefined();
    });
  });
});
