// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const linesQueryMock = vi.fn();
const referenceQueryMock = vi.fn();
const relationshipQueryMock = vi.fn();
const runCommandMock = vi.fn(async () => undefined);

vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      salesOrderLines: { useQuery: (input: unknown, options: unknown) => linesQueryMock(input, options) },
      reference: { useQuery: (input: unknown, options: unknown) => referenceQueryMock(input, options) },
      relationshipSummary: { useQuery: (input: unknown, options: unknown) => relationshipQueryMock(input, options) }
    }
  }
}));

vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: runCommandMock, isRunning: false })
}));

import { OrderPricingPanel, CustomerPricingPanel } from './PricingPanel';
import { DefaultPricingPanel } from './DefaultPricingPanel';

const ORDER_ID = '11111111-1111-1111-1111-111111111111';
const CUSTOMER_ID = '22222222-2222-2222-2222-222222222222';

describe('OrderPricingPanel', () => {
  it('renders lines with COGS range affordances and resolution state', () => {
    linesQueryMock.mockReturnValue({
      data: [
        {
          id: 'line-1',
          itemName: 'Range A',
          status: 'draft',
          batchCategory: 'Flower',
          qty: '2',
          unitPrice: '0',
          unitCost: '0',
          unitCostResolved: false,
          landedCostBasis: null,
          priceRange: '50-100'
        },
        {
          id: 'line-2',
          itemName: 'Fixed B',
          status: 'draft',
          batchCategory: 'Vape',
          qty: '1',
          unitPrice: '30',
          unitCost: '20',
          unitCostResolved: true,
          landedCostBasis: 'fixed',
          priceRange: null
        }
      ],
      refetch: vi.fn()
    });
    referenceQueryMock.mockReturnValue({
      data: { defaultPricingRule: { default: { basis: 'percent', amount: 0.3 } } }
    });
    relationshipQueryMock.mockReturnValue({
      data: { customer: { pricingRule: { default: { basis: 'percent', amount: 0.25 } } } }
    });

    render(<OrderPricingPanel orderId={ORDER_ID} customerId={CUSTOMER_ID} />);

    expect(screen.getByTestId('order-pricing-panel')).toBeInTheDocument();
    expect(screen.getByText(/Internal only/i)).toBeInTheDocument();
    expect(screen.getByText(/Range A/)).toBeInTheDocument();
    expect(screen.getByText(/unresolved/i)).toBeInTheDocument();
    expect(screen.getByTestId('pick-low-line-1')).toBeInTheDocument();
    expect(screen.getByTestId('pick-mid-line-1')).toBeInTheDocument();
    expect(screen.getByTestId('pick-high-line-1')).toBeInTheDocument();
    expect(screen.getByText(/No COGS range/)).toBeInTheDocument();
  });

  it('disables apply rule button while a line has unresolved COGS', () => {
    linesQueryMock.mockReturnValue({
      data: [
        { id: 'line-1', itemName: 'A', status: 'draft', batchCategory: 'Flower', qty: '1', unitPrice: '0', unitCost: '0', unitCostResolved: false, landedCostBasis: null, priceRange: '50-100' }
      ],
      refetch: vi.fn()
    });
    referenceQueryMock.mockReturnValue({ data: { defaultPricingRule: {} } });
    relationshipQueryMock.mockReturnValue({ data: { customer: { pricingRule: {} } } });

    render(<OrderPricingPanel orderId={ORDER_ID} customerId={CUSTOMER_ID} />);

    const applyButton = screen.getByTestId('apply-pricing-rule') as HTMLButtonElement;
    expect(applyButton.disabled).toBe(true);
  });

  it('calls setLineLandedCost with pick-low value when the Low button is clicked', async () => {
    linesQueryMock.mockReturnValue({
      data: [
        { id: 'line-1', itemName: 'A', status: 'draft', batchCategory: 'Flower', qty: '1', unitPrice: '0', unitCost: '0', unitCostResolved: false, landedCostBasis: null, priceRange: '50-100' }
      ],
      refetch: vi.fn()
    });
    referenceQueryMock.mockReturnValue({ data: { defaultPricingRule: {} } });
    relationshipQueryMock.mockReturnValue({ data: { customer: { pricingRule: {} } } });

    render(<OrderPricingPanel orderId={ORDER_ID} customerId={CUSTOMER_ID} />);
    fireEvent.click(screen.getByTestId('pick-low-line-1'));

    expect(runCommandMock).toHaveBeenCalledWith(
      'setLineLandedCost',
      { lineId: 'line-1', landedCost: 50, basis: 'pick-low' },
      expect.any(String)
    );
  });

  it('shows empty state when no lines are present', () => {
    linesQueryMock.mockReturnValue({ data: [], refetch: vi.fn() });
    referenceQueryMock.mockReturnValue({ data: { defaultPricingRule: {} } });
    relationshipQueryMock.mockReturnValue({ data: { customer: { pricingRule: {} } } });
    render(<OrderPricingPanel orderId={ORDER_ID} />);
    expect(screen.getByText(/No lines on this order yet/)).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // #64 PR-1: below-range custom landed COGS UI — structured exception reasons
  // ---------------------------------------------------------------------

  function renderBelowRangeOrderPricingPanel() {
    runCommandMock.mockClear();
    linesQueryMock.mockReturnValue({
      data: [
        {
          id: 'line-1',
          itemName: 'Range A',
          status: 'draft',
          batchCategory: 'Flower',
          qty: '1',
          unitPrice: '0',
          unitCost: '0',
          unitCostResolved: false,
          landedCostBasis: null,
          priceRange: '50-100'
        }
      ],
      refetch: vi.fn()
    });
    referenceQueryMock.mockReturnValue({ data: { defaultPricingRule: {} } });
    relationshipQueryMock.mockReturnValue({ data: { customer: { pricingRule: {} } } });
    render(<OrderPricingPanel orderId={ORDER_ID} customerId={CUSTOMER_ID} />);
  }

  it('shows an exception reason picker when the custom landed COGS is below the batch range floor', () => {
    renderBelowRangeOrderPricingPanel();
    fireEvent.change(screen.getByTestId('pick-custom-input-line-1'), { target: { value: '25' } });
    // Picker is only visible/relevant once value drops below the floor.
    expect(screen.getByTestId('pick-custom-exception-reason-line-1')).toBeInTheDocument();
  });

  it('disables Set custom for below-range value until an exception reason is chosen', () => {
    renderBelowRangeOrderPricingPanel();
    fireEvent.change(screen.getByTestId('pick-custom-input-line-1'), { target: { value: '25' } });
    const setBtn = screen.getByTestId('pick-custom-line-1') as HTMLButtonElement;
    expect(setBtn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('pick-custom-exception-reason-line-1'), { target: { value: 'keep-margin' } });
    expect(setBtn.disabled).toBe(false);
  });

  it('calls setLineLandedCost with exceptionReason + exceptionNote when below-range custom is committed', async () => {
    renderBelowRangeOrderPricingPanel();
    fireEvent.change(screen.getByTestId('pick-custom-input-line-1'), { target: { value: '25' } });
    fireEvent.change(screen.getByTestId('pick-custom-exception-reason-line-1'), { target: { value: 'waive-margin' } });
    fireEvent.change(screen.getByTestId('pick-custom-exception-note-line-1'), { target: { value: 'Held to win volume' } });
    fireEvent.click(screen.getByTestId('pick-custom-line-1'));

    expect(runCommandMock).toHaveBeenCalledWith(
      'setLineLandedCost',
      {
        lineId: 'line-1',
        landedCost: 25,
        basis: 'manual',
        exceptionReason: 'waive-margin',
        exceptionNote: 'Held to win volume'
      },
      expect.any(String)
    );
  });

  it('still blocks above-range custom value (Set custom disabled, no reason picker rescues it)', () => {
    renderBelowRangeOrderPricingPanel();
    fireEvent.change(screen.getByTestId('pick-custom-input-line-1'), { target: { value: '150' } });
    const setBtn = screen.getByTestId('pick-custom-line-1') as HTMLButtonElement;
    expect(setBtn.disabled).toBe(true);
    // No reason picker for above-range (above-range is a hard reject in PR-1).
    expect(screen.queryByTestId('pick-custom-exception-reason-line-1')).not.toBeInTheDocument();
  });

  it('does NOT show the exception reason picker for an in-range custom value', () => {
    renderBelowRangeOrderPricingPanel();
    fireEvent.change(screen.getByTestId('pick-custom-input-line-1'), { target: { value: '75' } });
    expect(screen.queryByTestId('pick-custom-exception-reason-line-1')).not.toBeInTheDocument();
    const setBtn = screen.getByTestId('pick-custom-line-1') as HTMLButtonElement;
    expect(setBtn.disabled).toBe(false);
  });

  // QA review finding #3: assistive-tech users need programmatic labels on
  // the new below-range exception controls. data-testid identifiers are not
  // exposed to screen readers, so we assert accessible names directly.
  it('labels the below-range exception reason select and note input for screen readers', () => {
    renderBelowRangeOrderPricingPanel();
    fireEvent.change(screen.getByTestId('pick-custom-input-line-1'), { target: { value: '25' } });
    expect(screen.getByLabelText(/below-range exception reason/i)).toBe(
      screen.getByTestId('pick-custom-exception-reason-line-1')
    );
    expect(screen.getByLabelText(/below-range exception note/i)).toBe(
      screen.getByTestId('pick-custom-exception-note-line-1')
    );
  });

  // ---------------------------------------------------------------------
  // #64 PR-2: server-projected vendor warning chip on lines with a recorded
  // below-range exception. The query feeds `landedCostExceptionReason` etc.
  // and OrderPricingPanel must render an accessible amber warning chip for
  // it, especially for `vendor-approval-pending`.
  // ---------------------------------------------------------------------

  it('renders an accessible vendor-approval-pending warning chip when a line has a projected exception', () => {
    linesQueryMock.mockReturnValue({
      data: [
        {
          id: 'line-1',
          itemName: 'Range A',
          status: 'draft',
          batchCategory: 'Flower',
          qty: '1',
          unitPrice: '0',
          unitCost: '25.00',
          unitCostResolved: true,
          landedCostBasis: 'manual',
          priceRange: '50-100',
          landedCostExceptionReason: 'vendor-approval-pending',
          landedCostExceptionNote: 'Awaiting buyer confirmation',
          landedCostBelowRange: true,
          landedCostExceptionRangeLow: 50,
          landedCostExceptionRangeHigh: 100
        }
      ],
      refetch: vi.fn()
    });
    referenceQueryMock.mockReturnValue({ data: { defaultPricingRule: {} } });
    relationshipQueryMock.mockReturnValue({ data: { customer: { pricingRule: {} } } });

    render(<OrderPricingPanel orderId={ORDER_ID} customerId={CUSTOMER_ID} />);

    // Accessible name surfaces the vendor approval state to AT users.
    expect(screen.getByLabelText(/vendor approval pending/i)).toBeInTheDocument();
  });

  it('does NOT render a vendor warning chip for in-range lines with no exception', () => {
    linesQueryMock.mockReturnValue({
      data: [
        {
          id: 'line-1',
          itemName: 'Range A',
          status: 'draft',
          batchCategory: 'Flower',
          qty: '1',
          unitPrice: '0',
          unitCost: '75.00',
          unitCostResolved: true,
          landedCostBasis: 'pick-mid',
          priceRange: '50-100',
          landedCostExceptionReason: null,
          landedCostExceptionNote: null,
          landedCostBelowRange: false,
          landedCostExceptionRangeLow: null,
          landedCostExceptionRangeHigh: null
        }
      ],
      refetch: vi.fn()
    });
    referenceQueryMock.mockReturnValue({ data: { defaultPricingRule: {} } });
    relationshipQueryMock.mockReturnValue({ data: { customer: { pricingRule: {} } } });

    render(<OrderPricingPanel orderId={ORDER_ID} customerId={CUSTOMER_ID} />);

    expect(screen.queryByLabelText(/vendor approval pending/i)).not.toBeInTheDocument();
    // No chip for any of the structured reasons.
    expect(screen.queryByLabelText(/keep margin/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/waive margin/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/take loss/i)).not.toBeInTheDocument();
  });
});

describe('CustomerPricingPanel', () => {
  it('renders the customer pricing editor with the internal-only banner', () => {
    relationshipQueryMock.mockReturnValue({
      data: { customer: { id: CUSTOMER_ID, name: 'Acme', pricingRule: { default: { basis: 'percent', amount: 0.3 } } } }
    });
    referenceQueryMock.mockReturnValue({
      data: { defaultPricingRule: { default: { basis: 'percent', amount: 0.25 } }, categories: ['Flower', 'Vape'] }
    });

    render(<CustomerPricingPanel customerId={CUSTOMER_ID} />);

    expect(screen.getByTestId('customer-pricing-panel')).toBeInTheDocument();
    expect(screen.getByText(/Internal only/i)).toBeInTheDocument();
    expect((screen.getByTestId('rule-default-basis') as HTMLSelectElement).value).toBe('percent');
    expect((screen.getByTestId('rule-default-amount') as HTMLInputElement).value).toBe('0.3');
    expect(screen.getByTestId('rule-save')).toBeInTheDocument();
  });
});

describe('DefaultPricingPanel', () => {
  it('renders the settings editor for the default pricing rule', () => {
    referenceQueryMock.mockReturnValue({
      data: { defaultPricingRule: { default: { basis: 'percent', amount: 0.3 } }, categories: ['Flower', 'Vape'] },
      refetch: vi.fn()
    });

    render(<DefaultPricingPanel />);

    expect(screen.getByTestId('default-pricing-panel')).toBeInTheDocument();
    expect(screen.getByText(/Default pricing rule/i)).toBeInTheDocument();
    expect(screen.getByText(/Internal only/i)).toBeInTheDocument();
    expect((screen.getByTestId('default-rule-basis') as HTMLSelectElement).value).toBe('percent');
    expect((screen.getByTestId('default-rule-amount') as HTMLInputElement).value).toBe('0.3');
    expect(screen.getByTestId('default-rule-save')).toBeInTheDocument();
  });
});
