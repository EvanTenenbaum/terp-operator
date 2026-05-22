// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PricingRuleChainEditor } from './PricingRuleChainEditor';
import type { PricingRuleClause } from '../../shared/types';

// Mock tRPC — PricingRuleChainEditor uses trpc.queries.reference for categories
vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      reference: {
        useQuery: vi.fn().mockReturnValue({
          data: {
            categories: ['Flower', 'Infused', 'Extract', 'Pre-roll', 'Vape'],
          },
          isLoading: false,
        }),
      },
    },
  },
}));

// Mock the resolver — it uses client-side filterEvaluator which we don't want in unit tests
vi.mock('../../shared/pricingRuleResolver', () => ({
  resolvePricingRuleClause: vi.fn().mockReturnValue({
    basis: 'percent',
    amount: 0.30,
    source: 'fallback',
    clauseName: null,
  }),
  buildContextRow: vi.fn().mockReturnValue({}),
}));

// ── Fixture clauses ──────────────────────────────────────────────────────────

const GLOBAL_CATCHALL: PricingRuleClause = {
  id: 'global-default',
  scope: 'global',
  customerId: null,
  priority: 1,
  name: null,
  conditions: null,
  actionBasis: 'percent',
  actionAmount: 0.30,
  active: true,
};

const FLOWER_CLAUSE: PricingRuleClause = {
  id: 'clause-flower',
  scope: 'global',
  customerId: null,
  priority: 1,
  name: 'Flower premium',
  conditions: {
    logic: 'AND',
    conditions: [{ field: 'category', operator: 'equals', value: 'Flower' } as never],
  } as never,
  actionBasis: 'percent',
  actionAmount: 0.35,
  active: true,
};

// ── Default props (global scope, single catch-all) ───────────────────────────

const DEFAULT_PROPS = {
  scope: 'global' as const,
  clauses: [GLOBAL_CATCHALL],
  chainFingerprint: '1:global-default:0',
  isRunning: false,
  onSave: vi.fn().mockResolvedValue(undefined),
};

// ────────────────────────────────────────────────────────────────────────────

describe('PricingRuleChainEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Global scope ─────────────────────────────────────────────────────────

  describe('global scope', () => {
    it('renders catch-all card that cannot be removed', () => {
      render(<PricingRuleChainEditor {...DEFAULT_PROPS} />);

      // The catch-all label is visible
      expect(screen.getByText(/Default \(catch-all\)/i)).toBeInTheDocument();

      // No Remove buttons — the only card is the catch-all which never has one
      const removeButtons = screen.queryAllByLabelText(/Remove rule/i);
      expect(removeButtons).toHaveLength(0);
    });

    it('renders Add rule button', () => {
      render(<PricingRuleChainEditor {...DEFAULT_PROPS} />);
      expect(screen.getByTestId('add-clause')).toBeInTheDocument();
    });

    it('adds a new clause before the catch-all on global scope', async () => {
      render(<PricingRuleChainEditor {...DEFAULT_PROPS} />);

      // Start: 1 card (catch-all)
      expect(screen.getAllByTestId(/^clause-card-/)).toHaveLength(1);

      fireEvent.click(screen.getByTestId('add-clause'));

      // After add: new explicit clause inserted before catch-all → 2 cards
      await waitFor(() => {
        expect(screen.getAllByTestId(/^clause-card-/)).toHaveLength(2);
      });

      // Catch-all still visible at the end
      expect(screen.getByText(/Default \(catch-all\)/i)).toBeInTheDocument();
    });

    it('shows dirty indicator after editing action amount', async () => {
      render(
        <PricingRuleChainEditor {...DEFAULT_PROPS} clauses={[GLOBAL_CATCHALL]} />,
      );

      const amountInput = screen.getByTestId('clause-amount-0');
      fireEvent.change(amountInput, { target: { value: '0.35' } });

      await waitFor(() => {
        expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument();
      });
    });

    it('Save button is disabled when not dirty', () => {
      render(<PricingRuleChainEditor {...DEFAULT_PROPS} />);
      const saveBtn = screen.getByTestId('chain-save') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('calls onSave with updated drafts when Save is clicked', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(
        <PricingRuleChainEditor {...DEFAULT_PROPS} onSave={onSave} />,
      );

      const amountInput = screen.getByTestId('clause-amount-0');
      fireEvent.change(amountInput, { target: { value: '0.35' } });

      const saveBtn = screen.getByTestId('chain-save') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);

      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ actionAmount: 0.35 }),
          ]),
          DEFAULT_PROPS.chainFingerprint,
        );
      });
    });

    it('renders with two clauses — explicit Flower rule + catch-all', () => {
      render(
        <PricingRuleChainEditor
          {...DEFAULT_PROPS}
          clauses={[FLOWER_CLAUSE, GLOBAL_CATCHALL]}
          chainFingerprint="2:"
        />,
      );
      expect(screen.getAllByTestId(/^clause-card-/)).toHaveLength(2);
      expect(screen.getByText(/Default \(catch-all\)/i)).toBeInTheDocument();
    });
  });

  // ── Customer scope ───────────────────────────────────────────────────────

  describe('customer scope', () => {
    it('renders empty state with Add rule button when no clauses', () => {
      render(
        <PricingRuleChainEditor
          scope="customer"
          customerId="cust-1"
          clauses={[]}
          chainFingerprint="0:"
          isRunning={false}
          onSave={vi.fn()}
        />,
      );

      expect(screen.getByText(/No custom rules/i)).toBeInTheDocument();
      expect(screen.getByTestId('add-clause')).toBeInTheDocument();
    });

    it('does not render a catch-all card for customer scope with no clauses', () => {
      render(
        <PricingRuleChainEditor
          scope="customer"
          customerId="cust-1"
          clauses={[]}
          chainFingerprint="0:"
          isRunning={false}
          onSave={vi.fn()}
        />,
      );

      expect(screen.queryByText(/Default \(catch-all\)/i)).not.toBeInTheDocument();
    });
  });

  // ── Read-only mode ───────────────────────────────────────────────────────

  describe('readOnly mode', () => {
    it('hides Save button and Add rule button when readOnly', () => {
      render(<PricingRuleChainEditor {...DEFAULT_PROPS} readOnly />);

      expect(screen.queryByTestId('add-clause')).not.toBeInTheDocument();
      expect(screen.queryByTestId('chain-save')).not.toBeInTheDocument();
    });
  });

  // ── Preview panel ────────────────────────────────────────────────────────

  describe('preview panel', () => {
    it('shows preview toggle button', () => {
      render(<PricingRuleChainEditor {...DEFAULT_PROPS} />);
      expect(screen.getByText(/Test this chain/i)).toBeInTheDocument();
    });

    it('expands preview panel on click', async () => {
      render(<PricingRuleChainEditor {...DEFAULT_PROPS} />);

      // The toggle text is inside a <span> in the button; fireEvent.click bubbles
      fireEvent.click(screen.getByText(/Test this chain/i));

      await waitFor(() => {
        expect(screen.getByTestId('preview-inputs')).toBeInTheDocument();
      });
    });
  });
});
