// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const linesQueryMock = vi.fn();
const referenceQueryMock = vi.fn();
const relationshipQueryMock = vi.fn();
const pricingRulesClausesMock = vi.fn();
const pricingRulesSummaryMock = vi.fn();
const runCommandMock = vi.fn(async () => undefined);

vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      salesOrderLines: { useQuery: (input: unknown, options: unknown) => linesQueryMock(input, options) },
      reference: { useQuery: (input: unknown, options: unknown) => referenceQueryMock(input, options) },
      relationshipSummary: { useQuery: (input: unknown, options: unknown) => relationshipQueryMock(input, options) },
      pricingRuleClauses: { useQuery: (input: unknown, options: unknown) => pricingRulesClausesMock(input, options) },
      pricingRulesSummary: { useQuery: (input: unknown, options: unknown) => pricingRulesSummaryMock(input, options) },
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

  it('shows below-range exception picker when custom COGS is below the range floor', () => {
    linesQueryMock.mockReturnValue({
      data: [
        { id: 'line-1', itemName: 'Range A', status: 'draft', batchCategory: 'Flower', qty: '1', unitPrice: '0', unitCost: '0', unitCostResolved: false, landedCostBasis: null, priceRange: '50-100' }
      ],
      refetch: vi.fn()
    });
    referenceQueryMock.mockReturnValue({ data: { defaultPricingRule: {} } });
    relationshipQueryMock.mockReturnValue({ data: { customer: { pricingRule: {} } } });

    render(<OrderPricingPanel orderId={ORDER_ID} customerId={CUSTOMER_ID} />);
    fireEvent.change(screen.getByTestId('pick-custom-input-line-1'), { target: { value: '10' } });

    expect(screen.getByTestId('pick-custom-below-range-line-1')).toBeInTheDocument();
    expect(screen.getByText(/Below range floor/i)).toBeInTheDocument();
    expect(screen.getByTestId('pick-custom-exception-reason-line-1')).toBeInTheDocument();
  });

  it('does not show below-range picker when custom COGS is above the range', () => {
    linesQueryMock.mockReturnValue({
      data: [
        { id: 'line-1', itemName: 'Range A', status: 'draft', batchCategory: 'Flower', qty: '1', unitPrice: '0', unitCost: '0', unitCostResolved: false, landedCostBasis: null, priceRange: '50-100' }
      ],
      refetch: vi.fn()
    });
    referenceQueryMock.mockReturnValue({ data: { defaultPricingRule: {} } });
    relationshipQueryMock.mockReturnValue({ data: { customer: { pricingRule: {} } } });

    render(<OrderPricingPanel orderId={ORDER_ID} customerId={CUSTOMER_ID} />);
    fireEvent.change(screen.getByTestId('pick-custom-input-line-1'), { target: { value: '200' } });

    expect(screen.queryByTestId('pick-custom-below-range-line-1')).not.toBeInTheDocument();
    expect(screen.getByText(/Above range max/i)).toBeInTheDocument();
  });

  it('keeps Set custom disabled until a reason is selected for below-range COGS', () => {
    linesQueryMock.mockReturnValue({
      data: [
        { id: 'line-1', itemName: 'Range A', status: 'draft', batchCategory: 'Flower', qty: '1', unitPrice: '0', unitCost: '0', unitCostResolved: false, landedCostBasis: null, priceRange: '50-100' }
      ],
      refetch: vi.fn()
    });
    referenceQueryMock.mockReturnValue({ data: { defaultPricingRule: {} } });
    relationshipQueryMock.mockReturnValue({ data: { customer: { pricingRule: {} } } });

    render(<OrderPricingPanel orderId={ORDER_ID} customerId={CUSTOMER_ID} />);
    fireEvent.change(screen.getByTestId('pick-custom-input-line-1'), { target: { value: '10' } });

    const submitBtn = screen.getByTestId('pick-custom-line-1') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it('passes exceptionReason to setLineLandedCost when below-range reason is selected and Set custom is clicked', async () => {
    linesQueryMock.mockReturnValue({
      data: [
        { id: 'line-1', itemName: 'Range A', status: 'draft', batchCategory: 'Flower', qty: '1', unitPrice: '0', unitCost: '0', unitCostResolved: false, landedCostBasis: null, priceRange: '50-100' }
      ],
      refetch: vi.fn()
    });
    referenceQueryMock.mockReturnValue({ data: { defaultPricingRule: {} } });
    relationshipQueryMock.mockReturnValue({ data: { customer: { pricingRule: {} } } });

    render(<OrderPricingPanel orderId={ORDER_ID} customerId={CUSTOMER_ID} />);
    fireEvent.change(screen.getByTestId('pick-custom-input-line-1'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('pick-custom-exception-reason-line-1'), { target: { value: 'waive_margin' } });
    fireEvent.click(screen.getByTestId('pick-custom-line-1'));

    expect(runCommandMock).toHaveBeenCalledWith(
      'setLineLandedCost',
      expect.objectContaining({ lineId: 'line-1', landedCost: 10, basis: 'manual', exceptionReason: 'waive_margin' }),
      expect.any(String)
    );
  });

  // ---------------------------------------------------------------------
  // #64 PR-2: server-projected vendor warning chip on lines with a recorded
  // below-range exception. The query feeds `landedCostExceptionReason` etc.
  // and OrderPricingPanel must render an accessible amber warning chip for
  // it, especially for `vendor_approval_pending`.
  // ---------------------------------------------------------------------

  it('renders an accessible vendor_approval_pending warning chip when a line has a projected exception', () => {
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
          landedCostExceptionReason: 'vendor_approval_pending',
          landedCostExceptionNote: 'Awaiting buyer confirmation',
          landedCostBelowRange: true,
          landedCostExceptionRangeLow: null,
          landedCostExceptionRangeHigh: null
        }
      ],
      refetch: vi.fn()
    });
    referenceQueryMock.mockReturnValue({ data: { defaultPricingRule: {} } });
    relationshipQueryMock.mockReturnValue({ data: { customer: { pricingRule: {} } } });

    render(<OrderPricingPanel orderId={ORDER_ID} customerId={CUSTOMER_ID} />);

    // Accessible name surfaces the vendor approval state to AT users.
    expect(screen.getByLabelText(/vendor approval pending/i)).toBeInTheDocument();
    expect(screen.getByTestId('pricing-line-exception-chip-line-1')).toBeInTheDocument();
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

  // #143: margin visibility gate — COGS/cost controls must follow the same
  // privacy posture as the Sales grid cost/margin columns.
  describe('showMargin prop (#143)', () => {
    const lineWithRange = {
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
    };

    function setupMocks() {
      referenceQueryMock.mockReturnValue({ data: { defaultPricingRule: {} } });
      relationshipQueryMock.mockReturnValue({ data: { customer: { pricingRule: {} } } });
    }

    it('shows COGS range and pick buttons when showMargin is true (default)', () => {
      linesQueryMock.mockReturnValue({ data: [lineWithRange], refetch: vi.fn() });
      setupMocks();
      render(<OrderPricingPanel orderId={ORDER_ID} customerId={CUSTOMER_ID} showMargin={true} />);
      expect(screen.getByTestId('pick-low-line-1')).toBeInTheDocument();
      expect(screen.getByTestId('pick-mid-line-1')).toBeInTheDocument();
      expect(screen.getByTestId('pick-high-line-1')).toBeInTheDocument();
      expect(screen.getByText(/COGS range/i)).toBeInTheDocument();
    });

    it('hides COGS range and pick buttons when showMargin is false', () => {
      linesQueryMock.mockReturnValue({ data: [lineWithRange], refetch: vi.fn() });
      setupMocks();
      render(<OrderPricingPanel orderId={ORDER_ID} customerId={CUSTOMER_ID} showMargin={false} />);
      expect(screen.queryByTestId('pick-low-line-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('pick-mid-line-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('pick-high-line-1')).not.toBeInTheDocument();
      expect(screen.queryByText(/COGS range/i)).not.toBeInTheDocument();
    });

    it('still shows item name and non-cost details when showMargin is false', () => {
      linesQueryMock.mockReturnValue({ data: [lineWithRange], refetch: vi.fn() });
      setupMocks();
      render(<OrderPricingPanel orderId={ORDER_ID} customerId={CUSTOMER_ID} showMargin={false} />);
      expect(screen.getByText('Range A')).toBeInTheDocument();
      expect(screen.getByText(/unit price/i)).toBeInTheDocument();
    });

    it('hides custom cost input, below-range picker, and projected exception chip when showMargin is false', () => {
      linesQueryMock.mockReturnValue({
        data: [
          {
            ...lineWithRange,
            landedCostExceptionReason: 'vendor_approval_pending',
            landedCostExceptionNote: 'Awaiting buyer confirmation',
            landedCostExceptionRangeLow: null,
            landedCostExceptionRangeHigh: null
          }
        ],
        refetch: vi.fn()
      });
      setupMocks();
      render(<OrderPricingPanel orderId={ORDER_ID} customerId={CUSTOMER_ID} showMargin={false} />);
      expect(screen.queryByTestId('pick-custom-input-line-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('pick-custom-line-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('pick-custom-below-range-line-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('pick-custom-exception-reason-line-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('pricing-line-exception-chip-line-1')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/vendor approval pending/i)).not.toBeInTheDocument();
    });

    it('defaults to showMargin=true when the prop is omitted', () => {
      linesQueryMock.mockReturnValue({ data: [lineWithRange], refetch: vi.fn() });
      setupMocks();
      render(<OrderPricingPanel orderId={ORDER_ID} customerId={CUSTOMER_ID} />);
      expect(screen.getByTestId('pick-low-line-1')).toBeInTheDocument();
    });
  });
});

describe('CustomerPricingPanel', () => {
  it('renders the customer pricing editor with the internal-only banner', () => {
    pricingRulesClausesMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    pricingRulesSummaryMock.mockReturnValue({
      data: { global: [], customers: [], chainFingerprint: '0:' },
      isLoading: false,
      refetch: vi.fn(),
    });
    referenceQueryMock.mockReturnValue({
      data: { categories: ['Flower', 'Vape'] },
    });

    render(<CustomerPricingPanel customerId={CUSTOMER_ID} />);

    expect(screen.getByTestId('customer-pricing-panel')).toBeInTheDocument();
    expect(screen.getByText(/Internal only/i)).toBeInTheDocument();
    // The chain editor is rendered inside the panel
    expect(screen.getByTestId('pricing-chain-editor')).toBeInTheDocument();
    // Add-rule and save buttons are present (customer scope, not readOnly)
    expect(screen.getByTestId('add-clause')).toBeInTheDocument();
    expect(screen.getByTestId('chain-save')).toBeInTheDocument();
  });
});

describe('DefaultPricingPanel', () => {
  // DefaultPricingPanel is retired in CAP-030; it now re-exports PricingRulesView.
  it('renders PricingRulesView (the consolidated settings view)', () => {
    pricingRulesSummaryMock.mockReturnValue({
      data: { global: [], customers: [], chainFingerprint: '0:' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    pricingRulesClausesMock.mockReturnValue({
      data: [],
      isLoading: false,
      refetch: vi.fn(),
    });
    referenceQueryMock.mockReturnValue({
      data: { categories: ['Flower', 'Vape'] },
    });

    render(<DefaultPricingPanel />);

    expect(screen.getByTestId('pricing-rules-view')).toBeInTheDocument();
    expect(screen.getByText(/Pricing Rules/i)).toBeInTheDocument();
    expect(screen.getByTestId('global-rules-section')).toBeInTheDocument();
    expect(screen.getByTestId('customer-overrides-section')).toBeInTheDocument();
  });
});
