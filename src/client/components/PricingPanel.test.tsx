// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const referenceQueryMock = vi.fn();
const relationshipQueryMock = vi.fn();
const runCommandMock = vi.fn(async () => undefined);

vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      reference: { useQuery: (input: unknown, options: unknown) => referenceQueryMock(input, options) },
      relationshipSummary: { useQuery: (input: unknown, options: unknown) => relationshipQueryMock(input, options) }
    }
  }
}));

vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: runCommandMock, isRunning: false })
}));

import { CustomerPricingPanel } from './PricingPanel';
import { DefaultPricingPanel } from './DefaultPricingPanel';

const CUSTOMER_ID = '22222222-2222-2222-2222-222222222222';

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
