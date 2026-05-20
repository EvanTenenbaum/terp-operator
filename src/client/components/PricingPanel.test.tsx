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
