// @vitest-environment node
/**
 * UX-D04: disabled-without-reason sweep for InventoryFinderPanel.
 * Tests the pure title-attribute logic added to the qty input and Add/Copy offer
 * buttons. We verify the conditional expressions that determine the title text,
 * matching exactly the logic used in the JSX.
 */
import { describe, it, expect } from 'vitest';

// ---- helpers mirroring the JSX title logic in InventoryFinderPanel ----

/**
 * Title for the qty input and Add button in the results table.
 * Logic mirrors: !selectedOrderId ? '...' : added ? '...' : available <= 0 ? '...' : undefined
 */
function addButtonTitle(
  selectedOrderId: string,
  added: boolean,
  available: number
): string | undefined {
  if (!selectedOrderId) return 'Select an order first';
  if (added) return 'Already in order';
  if (available <= 0) return 'No available stock';
  return undefined;
}

/**
 * Title for the "Copy N rows as offer" button.
 * Logic mirrors: !compared.some(row => customerShareReady(row.mediaStatus)) ? '...' : undefined
 */
function copyOfferTitle(anyReady: boolean): string | undefined {
  if (!anyReady) return 'None of the selected rows are ready to share — media must be published first';
  return undefined;
}

// ---- tests ----

describe('UX-D04 — InventoryFinderPanel disabled title helpers', () => {
  describe('addButtonTitle (qty input + Add button)', () => {
    it('returns "Select an order first" when no order selected', () => {
      expect(addButtonTitle('', false, 10)).toBe('Select an order first');
    });

    it('returns "Already in order" when batch is already added', () => {
      expect(addButtonTitle('order-1', true, 10)).toBe('Already in order');
    });

    it('returns "No available stock" when available qty is zero', () => {
      expect(addButtonTitle('order-1', false, 0)).toBe('No available stock');
    });

    it('returns "No available stock" when available qty is negative', () => {
      expect(addButtonTitle('order-1', false, -1)).toBe('No available stock');
    });

    it('returns undefined when enabled (order selected, not added, stock available)', () => {
      expect(addButtonTitle('order-1', false, 5)).toBeUndefined();
    });

    it('"no order" takes priority over "already added"', () => {
      // When both are true, the first guard wins
      expect(addButtonTitle('', true, 10)).toBe('Select an order first');
    });
  });

  describe('copyOfferTitle (Copy N rows as offer button)', () => {
    it('returns explanatory text when no rows are ready to share', () => {
      const title = copyOfferTitle(false);
      expect(title).toBeTruthy();
      expect(title).toContain('media must be published first');
    });

    it('returns undefined when at least one row is customer-share-ready', () => {
      expect(copyOfferTitle(true)).toBeUndefined();
    });
  });
});
