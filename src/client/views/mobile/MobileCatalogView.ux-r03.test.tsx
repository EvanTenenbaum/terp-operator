// @vitest-environment jsdom
/**
 * UX-R03: MobileCatalogView "Copy offer" — customer-safe field gating.
 *
 * Verifies:
 *   1. "Copy offer" button is present in the detail sheet.
 *   2. The offer text written to the clipboard contains customer-visible fields
 *      (name, qty, price).
 *   3. The offer text NEVER contains forbidden internal fields (cost, margin,
 *      notes, reason, vendorApproval, landedCostBasis, internalMargin).
 *   4. Sentinel numeric values from forbidden fields do not leak.
 *   5. The isCustomerSafeKey gate rejects the known forbidden field names.
 *   6. buildOfferText + OFFER_FORBIDDEN_FIELDS together cover the F01 gating.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Clipboard mock
// ---------------------------------------------------------------------------
const clipboardWriteMock = vi.fn().mockResolvedValue(undefined);

Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: clipboardWriteMock },
  writable: true,
  configurable: true
});

// ---------------------------------------------------------------------------
// Trpc mock
// ---------------------------------------------------------------------------
vi.mock('../../api/trpc', () => ({
  trpc: { queries: { grid: { useQuery: vi.fn() } } }
}));

import { trpc } from '../../api/trpc';
import { MobileCatalogView } from './MobileCatalogView';
import { isCustomerSafeKey } from '../../../shared/customerSafeStatus';
import { OFFER_FORBIDDEN_FIELDS } from '../SalesView.ux-f01';

const mockGrid = trpc.queries.grid.useQuery as ReturnType<typeof vi.fn>;

/**
 * Row with internal sentinel fields that must NEVER appear in offer text.
 * Each sentinel value is unique enough to detect leakage.
 */
const ROW_WITH_INTERNAL_FIELDS = {
  id: 'test-1',
  batchCode: 'TEST-001',
  name: 'Blue Dream',
  availableQty: 50,
  unitPrice: 1850,
  // --- SENTINEL FORBIDDEN VALUES ---
  unitCost: 999001,
  internalMargin: 999002,
  estimatedMargin: 999003,
  landedCostBasis: 999004,
  reason: 'SENTINEL_REASON_VALUE',
  notes: 'SENTINEL_NOTES_VALUE',
  vendorApproval: 'SENTINEL_VENDOR_APPROVAL',
  // other internal
  unitCostWithLanded: 999005,
  vendor: 'SENTINEL_VENDOR_NAME',
  // safe fields
  category: 'Flower',
  publishedMediaCount: 3,
  hasPrimaryPhoto: true,
  status: 'ready'
};

beforeEach(() => {
  clipboardWriteMock.mockReset();
  clipboardWriteMock.mockResolvedValue(undefined);
  mockGrid.mockReturnValue({ data: [ROW_WITH_INTERNAL_FIELDS], isLoading: false });
});

function renderView() {
  return render(
    <MemoryRouter initialEntries={['/mobile/catalog']}>
      <Routes>
        <Route path="/mobile/catalog" element={<MobileCatalogView />} />
        <Route path="/mobile/inventory" element={<div>Inventory</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function openDetailSheet() {
  fireEvent.click(screen.getByRole('button', { name: /open blue dream/i }));
}

describe('MobileCatalogView — UX-R03 Copy offer button', () => {
  it('shows a "Copy offer" button in the detail sheet', () => {
    renderView();
    openDetailSheet();
    expect(screen.getByTestId('copy-offer-button')).toBeInTheDocument();
  });

  it('writes to the clipboard when the button is clicked', async () => {
    renderView();
    openDetailSheet();
    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-offer-button'));
    });
    expect(clipboardWriteMock).toHaveBeenCalledOnce();
  });

  it('includes customer-visible fields in clipboard text', async () => {
    renderView();
    openDetailSheet();
    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-offer-button'));
    });
    const writtenText: string = clipboardWriteMock.mock.calls[0][0];
    // Name should appear
    expect(writtenText).toContain('Blue Dream');
    // Price should appear (as numeric or formatted)
    expect(writtenText).toContain('1850');
    // Qty should appear
    expect(writtenText).toContain('50');
  });

  it('NEVER includes forbidden sentinel numeric values in the clipboard text', async () => {
    renderView();
    openDetailSheet();
    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-offer-button'));
    });
    const writtenText: string = clipboardWriteMock.mock.calls[0][0];
    // None of the sentinel numeric values from internal fields may appear
    expect(writtenText).not.toContain('999001'); // unitCost sentinel
    expect(writtenText).not.toContain('999002'); // internalMargin sentinel
    expect(writtenText).not.toContain('999003'); // estimatedMargin sentinel
    expect(writtenText).not.toContain('999004'); // landedCostBasis sentinel
    expect(writtenText).not.toContain('999005'); // unitCostWithLanded sentinel
  });

  it('NEVER includes forbidden sentinel string values in the clipboard text', async () => {
    renderView();
    openDetailSheet();
    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-offer-button'));
    });
    const writtenText: string = clipboardWriteMock.mock.calls[0][0];
    expect(writtenText).not.toContain('SENTINEL_REASON_VALUE');
    expect(writtenText).not.toContain('SENTINEL_NOTES_VALUE');
    expect(writtenText).not.toContain('SENTINEL_VENDOR_APPROVAL');
  });

  it('NEVER includes forbidden field name labels (cost, margin, internal) in offer text', async () => {
    renderView();
    openDetailSheet();
    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-offer-button'));
    });
    const lower = clipboardWriteMock.mock.calls[0][0].toLowerCase();
    expect(lower).not.toContain('cost');
    expect(lower).not.toContain('margin');
    expect(lower).not.toContain('internal');
    expect(lower).not.toContain('landed');
  });

  it('shows "Copied" feedback after a successful copy', async () => {
    renderView();
    openDetailSheet();
    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-offer-button'));
    });
    const btn = screen.getByTestId('copy-offer-button');
    expect(btn).toHaveTextContent(/copied/i);
  });
});

// ---------------------------------------------------------------------------
// Unit-level gate tests (isCustomerSafeKey + OFFER_FORBIDDEN_FIELDS)
// ---------------------------------------------------------------------------

describe('UX-R03 customer-safe field gates', () => {
  it('isCustomerSafeKey rejects unitCost', () => {
    expect(isCustomerSafeKey('unitCost')).toBe(false);
  });

  it('isCustomerSafeKey rejects internalMargin', () => {
    expect(isCustomerSafeKey('internalMargin')).toBe(false);
  });

  it('isCustomerSafeKey rejects estimatedMargin', () => {
    expect(isCustomerSafeKey('estimatedMargin')).toBe(false);
  });

  it('isCustomerSafeKey rejects landedCostBasis (contains "landed")', () => {
    expect(isCustomerSafeKey('landedCostBasis')).toBe(false);
  });

  it('isCustomerSafeKey rejects notes', () => {
    expect(isCustomerSafeKey('notes')).toBe(false);
  });

  it('isCustomerSafeKey accepts name', () => {
    expect(isCustomerSafeKey('name')).toBe(true);
  });

  it('isCustomerSafeKey accepts availableQty', () => {
    expect(isCustomerSafeKey('availableQty')).toBe(true);
  });

  it('isCustomerSafeKey accepts unitPrice', () => {
    expect(isCustomerSafeKey('unitPrice')).toBe(true);
  });

  it('OFFER_FORBIDDEN_FIELDS covers the critical internal field names', () => {
    const lower = OFFER_FORBIDDEN_FIELDS.map((f) => f.toLowerCase());
    expect(lower).toContain('unitcost');
    expect(lower).toContain('internalmargin');
    expect(lower).toContain('estimatedmargin');
    expect(lower).toContain('reason');
    expect(lower).toContain('notes');
    expect(lower).toContain('vendorapproval');
  });
});
