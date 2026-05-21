// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  LandedCostExceptionChip,
  LandedCostExceptionCellRenderer,
  LANDED_COST_EXCEPTION_REASON_LABELS,
  LANDED_COST_EXCEPTION_REASON_SHORT_LABELS
} from './LandedCostExceptionChip';

// #64 PR-2: shared chip + cell renderer for the projected below-range
// `setLineLandedCost` exception. Used by OrderPricingPanel and SalesView's
// Customer Draft Lines grid so the operator-vocabulary labels and amber
// warning styling stay in one place.

describe('LandedCostExceptionChip (#64 PR-2)', () => {
  it('renders nothing when reason is null', () => {
    const { container } = render(<LandedCostExceptionChip reason={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when reason is undefined or empty string', () => {
    const { container: a } = render(<LandedCostExceptionChip reason={undefined} />);
    expect(a).toBeEmptyDOMElement();
    const { container: b } = render(<LandedCostExceptionChip reason="" />);
    expect(b).toBeEmptyDOMElement();
  });

  it('renders the short label for vendor-approval-pending with amber warning chip styling', () => {
    render(
      <LandedCostExceptionChip
        reason="vendor-approval-pending"
        rangeLow={50}
        rangeHigh={100}
        testId="chip-1"
      />
    );
    const chip = screen.getByTestId('chip-1');
    expect(chip).toBeInTheDocument();
    // Existing amber warning style — re-use the established `.selection-pill.warning`.
    expect(chip.className).toMatch(/selection-pill/);
    expect(chip.className).toMatch(/warning/);
    // Short label keeps the chip dense; long form lives in the title/tooltip.
    expect(chip.textContent).toMatch(/Vendor approval pending/i);
  });

  it('exposes the reason via accessible name', () => {
    render(
      <LandedCostExceptionChip
        reason="vendor-approval-pending"
        rangeLow={50}
        rangeHigh={100}
        testId="chip-a11y"
      />
    );
    const chip = screen.getByLabelText(/vendor approval pending/i);
    expect(chip).toBe(screen.getByTestId('chip-a11y'));
  });

  it('includes the note in the tooltip/title when provided', () => {
    render(
      <LandedCostExceptionChip
        reason="keep-margin"
        note="Acme committed to absorb shortfall"
        rangeLow={50}
        rangeHigh={100}
        testId="chip-note"
      />
    );
    const chip = screen.getByTestId('chip-note');
    expect(chip.getAttribute('title') ?? '').toMatch(/Acme committed to absorb shortfall/);
  });

  it('renders for every supported reason', () => {
    for (const reason of Object.keys(LANDED_COST_EXCEPTION_REASON_SHORT_LABELS)) {
      render(<LandedCostExceptionChip reason={reason} testId={`chip-${reason}`} />);
      expect(screen.getByTestId(`chip-${reason}`)).toBeInTheDocument();
    }
  });

  it('long-form labels match the operator vocabulary used by PricingPanel', () => {
    // QA review hardening: the chip's short labels and PricingPanel's full
    // labels are the same vocabulary surface. Pin the shape so a future label
    // edit can't drift one without the other.
    expect(LANDED_COST_EXCEPTION_REASON_LABELS['vendor-approval-pending']).toMatch(/vendor approval pending/i);
    expect(LANDED_COST_EXCEPTION_REASON_LABELS['keep-margin']).toMatch(/keep margin/i);
    expect(LANDED_COST_EXCEPTION_REASON_LABELS['waive-margin']).toMatch(/waive margin/i);
    expect(LANDED_COST_EXCEPTION_REASON_LABELS['take-loss']).toMatch(/take loss/i);
  });
});

describe('LandedCostExceptionCellRenderer (#64 PR-2)', () => {
  it('renders nothing for rows with no projected exception', () => {
    const { container } = render(
      <LandedCostExceptionCellRenderer
        data={{ landedCostExceptionReason: null }}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the chip when the row has a projected reason', () => {
    render(
      <LandedCostExceptionCellRenderer
        data={{
          landedCostExceptionReason: 'vendor-approval-pending',
          landedCostExceptionNote: 'Awaiting buyer confirmation',
          landedCostBelowRange: true,
          landedCostExceptionRangeLow: 50,
          landedCostExceptionRangeHigh: 100
        }}
      />
    );
    expect(screen.getByLabelText(/vendor approval pending/i)).toBeInTheDocument();
  });

  it('tolerates missing data object', () => {
    const { container } = render(<LandedCostExceptionCellRenderer />);
    expect(container).toBeEmptyDOMElement();
  });
});
