// @vitest-environment jsdom
/**
 * Tests for SaleLineExceptionControls (#64 reviewer fix).
 *
 * Covers the inline exception UI when showMargin is false (customer-facing
 * posture) and when vendor approval is pending.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SaleLineExceptionControls } from './SaleLineExceptionControls';
import type { GridRow } from '../../shared/types';

function makeRow(overrides: Partial<GridRow> = {}): GridRow {
  return {
    id: 'line-1',
    itemName: 'Test Item',
    unitPrice: 100,
    unitCost: 50,
    unitCostResolved: true,
    priceFloor: null,
    belowFloorReason: null,
    vendorApprovalState: 'none',
    ...overrides
  };
}

describe('SaleLineExceptionControls', () => {
  it('renders Approve and Decline buttons when vendorApprovalState is pending and showMargin is false', async () => {
    const runCommand = vi.fn().mockResolvedValue({ ok: true });
    const row = makeRow({ vendorApprovalState: 'pending' });
    render(
      <SaleLineExceptionControls
        row={row}
        isRunning={false}
        canWrite={true}
        showMargin={false}
        runCommand={runCommand}
      />
    );

    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();

    // Landed COGS and below-floor controls should be absent
    expect(screen.queryByLabelText(/Landed COGS/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Below-floor reason/i)).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /approve/i }));
    expect(runCommand).toHaveBeenCalledWith(
      'resolveVendorApproval',
      { lineId: 'line-1', state: 'approved' },
      'Resolve vendor approval on sale line'
    );

    await user.click(screen.getByRole('button', { name: /decline/i }));
    expect(runCommand).toHaveBeenCalledWith(
      'resolveVendorApproval',
      { lineId: 'line-1', state: 'declined' },
      'Resolve vendor approval on sale line'
    );
  });

  it('renders null when showMargin is false, vendorApprovalState is none, and unitCostResolved is false', () => {
    const runCommand = vi.fn().mockResolvedValue({ ok: true });
    const row = makeRow({ vendorApprovalState: 'none', unitCostResolved: false });
    const { container } = render(
      <SaleLineExceptionControls
        row={row}
        isRunning={false}
        canWrite={true}
        showMargin={false}
        runCommand={runCommand}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
