// @vitest-environment jsdom
/**
 * R-03 — registerSalesTabs smoke tests.
 *
 * Verifies that registerSalesTabs() registers 7 tabs on the 'salesOrder'
 * entity type, and that each tab is a valid SlideOverTab with the expected
 * shape (key, label, component).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { getTabs } from './registry';
import { registerSalesTabs } from './registerSalesTabs';
import type { SlideOverTab } from './registry';
import type { GridRow } from '../../../shared/types';

describe('registerSalesTabs smoke tests (R-03)', () => {
  beforeEach(() => {
    // Ensure clean state — registerTabs replaces, so calling twice is idempotent.
    registerSalesTabs();
  });

  it('registers exactly 7 tabs for salesOrder entity type', () => {
    const tabs = getTabs('salesOrder');
    expect(tabs).toHaveLength(7);
  });

  it('every registered tab has required shape (key, label, component)', () => {
    const tabs = getTabs('salesOrder');
    for (const tab of tabs) {
      expect(tab).toHaveProperty('key');
      expect(typeof tab.key).toBe('string');
      expect(tab).toHaveProperty('label');
      expect(typeof tab.label).toBe('string');
      expect(tab).toHaveProperty('component');
      expect(typeof tab.component).toBe('function');
    }
  });

  it('first tab (Lines) is the default for salesOrder', () => {
    const tabs = getTabs('salesOrder');
    const linesTab = tabs.find((t) => t.key === 'lines');
    expect(linesTab).toBeDefined();
    expect(linesTab!.label).toBe('Lines');
    expect(linesTab!.defaultFor).toContain('salesOrder');
  });

  it('all expected tab keys are present', () => {
    const tabs = getTabs('salesOrder');
    const keys = tabs.map((t) => t.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'lines',
        'pricing',
        'fulfillment',
        'invoice',
        'payments',
        'journal',
        'suggestions',
      ]),
    );
  });

  it('each tab component renders without throwing', () => {
    const tabs = getTabs('salesOrder');
    const stubProps = {
      entityId: 'order-1',
      entityType: 'salesOrder',
      row: { id: 'order-1', status: 'draft', total: 100, lines: 3, linesPicked: 1, linesTotal: 5 } as GridRow,
    };

    for (const tab of tabs) {
      const { container } = render(<tab.component {...stubProps} />);
      expect(container).toBeTruthy();
      // Each tab has a data-testid for the slideover tab content.
      const testId = `sales-slideover-${tab.key}-tab`;
      const el = container.querySelector(`[data-testid="${testId}"]`);
      expect(el, `Tab "${tab.key}" missing data-testid="${testId}"`).not.toBeNull();
    }
  });

  it('tab components handle missing row gracefully', () => {
    const tabs = getTabs('salesOrder');
    const emptyProps = {
      entityId: 'order-1',
      entityType: 'salesOrder',
      row: undefined,
    };

    for (const tab of tabs) {
      // Should not throw when row is undefined.
      expect(() => render(<tab.component {...emptyProps} />)).not.toThrow();
    }
  });
});
