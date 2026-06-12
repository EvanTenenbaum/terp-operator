// @vitest-environment jsdom
/**
 * UX-Q05 (Execution Decision 6b) — owner-gated credit-engine admin section
 * in Settings → Credit Engine:
 *
 *   - stance CRUD (createCreditEngineStance / updateCreditEngineStance /
 *     deleteCreditEngineStance) with the weights-sum-to-100 rule and the
 *     extreme-weight (>50) acknowledgement gate mirrored client-side,
 *   - per-customer overrides (setCustomerStance, disableCreditEngineForCustomer)
 *     behind a customer picker,
 *   - bulkRevertCustomersToEngine behind a typed-confirmation danger guard.
 *
 * Role gating: the Credit Engine tab is owner-only, so a manager never sees
 * any of these surfaces.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  runCommand: vi.fn(),
  confirm: vi.fn(),
  role: { value: 'owner' as 'owner' | 'manager' }
}));

const stancesData = {
  config: {
    globalDefaultStanceId: 'stance-default',
    coldStartMinPostedInvoices: 3,
    coldStartMinTenureDays: 60,
    manualOverrideReminderDefaultDays: 90,
    manualOverrideSnoozeCapDays: 180,
    shadowMode: true
  },
  stances: [
    {
      id: 'stance-default',
      name: 'Balanced',
      description: 'Default stance',
      weights: { revenueMomentum: 20, cashCollection: 20, profitability: 20, debtAging: 15, repaymentVelocity: 15, tenureDepth: 10 },
      isSeeded: true,
      customerCount: 2
    },
    {
      id: 'stance-custom',
      name: 'Aggressive',
      description: null,
      weights: { revenueMomentum: 40, cashCollection: 30, profitability: 10, debtAging: 10, repaymentVelocity: 5, tenureDepth: 5 },
      isSeeded: false,
      customerCount: 0
    },
    {
      id: 'stance-used',
      name: 'Sticky',
      description: null,
      weights: { revenueMomentum: 20, cashCollection: 20, profitability: 20, debtAging: 20, repaymentVelocity: 10, tenureDepth: 10 },
      isSeeded: false,
      customerCount: 3
    }
  ]
};

vi.mock('../api/trpc', () => {
  const query = (data: unknown) => ({ data, isLoading: false, refetch: vi.fn() });
  const emptyQuery = () => query(undefined);
  const queriesProxy: unknown = new Proxy(
    {
      reference: {
        useQuery: () =>
          query({
            customers: [
              { id: 'cust-1', name: 'Acme Dispensary' },
              { id: 'cust-2', name: 'Blue Sky Collective' }
            ],
            items: [],
            systemSettings: []
          })
      }
    },
    {
      get(target, prop) {
        if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
        return { useQuery: emptyQuery };
      }
    }
  );
  return {
    trpc: {
      auth: {
        me: {
          useQuery: () => ({
            data: { id: 'u-1', role: mocks.role.value, email: 'user@example.test', name: 'User', workLoop: null }
          })
        }
      },
      queries: queriesProxy,
      credit: {
        creditEngineStances: { useQuery: () => query(stancesData) },
        creditEngineConfigHistory: { useQuery: () => query([]) },
        creditEngineStanceHistory: { useQuery: () => query([]) }
      }
    }
  };
});
vi.mock('../components/OperatorGrid', () => ({
  OperatorGrid: () => <div data-testid="operator-grid" />
}));
vi.mock('../components/DefaultPricingPanel', () => ({
  DefaultPricingPanel: () => <div data-testid="default-pricing-panel" />
}));
vi.mock('./ConnectorsView', () => ({
  ConnectorsView: () => <div data-testid="connectors-view-embedded" />
}));
vi.mock('../components/useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: mocks.runCommand, isRunning: false })
}));
vi.mock('../hooks/useConfirm', () => ({
  useConfirm: () => mocks.confirm
}));

import { SettingsView } from './SettingsView';
import { useUiStore } from '../store/uiStore';

function renderView() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <SettingsView />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mocks.role.value = 'owner';
  mocks.runCommand.mockReset();
  mocks.runCommand.mockResolvedValue({ ok: true });
  mocks.confirm.mockReset();
  mocks.confirm.mockResolvedValue(true);
  useUiStore.setState({ activeSettingsTab: 'credit-engine' });
});

describe('UX-Q05 — role gating', () => {
  it('manager sees no Credit Engine tab and none of the admin sections', () => {
    mocks.role.value = 'manager';
    renderView();
    expect(screen.queryByRole('tab', { name: 'Credit Engine' })).toBeNull();
    expect(screen.queryByTestId('credit-engine-settings-panel')).toBeNull();
    expect(screen.queryByTestId('credit-engine-stance-admin')).toBeNull();
    expect(screen.queryByTestId('credit-engine-customer-overrides')).toBeNull();
    expect(screen.queryByTestId('credit-engine-bulk-revert')).toBeNull();
  });

  it('owner sees the stance admin, per-customer overrides, and bulk revert sections', () => {
    renderView();
    expect(screen.getByTestId('credit-engine-stance-admin')).toBeInTheDocument();
    expect(screen.getByTestId('credit-engine-customer-overrides')).toBeInTheDocument();
    expect(screen.getByTestId('credit-engine-bulk-revert')).toBeInTheDocument();
  });
});

describe('UX-Q05 — stance CRUD', () => {
  it('creates a stance with name, description, and weights summing to 100', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: 'New stance' }));
    await user.type(screen.getByLabelText('Stance name'), 'Test stance');

    const weightEntries: Array<[string, string]> = [
      ['Revenue momentum', '20'],
      ['Cash collection', '20'],
      ['Profitability', '20'],
      ['Debt aging', '20'],
      ['Repayment velocity', '10'],
      ['Tenure depth', '10']
    ];
    for (const [label, value] of weightEntries) {
      const input = screen.getByLabelText(label);
      await user.clear(input);
      await user.type(input, value);
    }

    await user.click(screen.getByRole('button', { name: 'Create stance' }));
    await waitFor(() => {
      expect(mocks.runCommand).toHaveBeenCalledWith(
        'createCreditEngineStance',
        {
          name: 'Test stance',
          description: null,
          weights: {
            revenueMomentum: 20,
            cashCollection: 20,
            profitability: 20,
            debtAging: 20,
            repaymentVelocity: 10,
            tenureDepth: 10
          }
        },
        'Create credit engine stance "Test stance"'
      );
    });
  });

  it('requires acknowledgement + justification when a single weight exceeds 50', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: 'New stance' }));
    await user.type(screen.getByLabelText('Stance name'), 'Extreme stance');

    const weightEntries: Array<[string, string]> = [
      ['Revenue momentum', '60'],
      ['Cash collection', '10'],
      ['Profitability', '10'],
      ['Debt aging', '10'],
      ['Repayment velocity', '5'],
      ['Tenure depth', '5']
    ];
    for (const [label, value] of weightEntries) {
      const input = screen.getByLabelText(label);
      await user.clear(input);
      await user.type(input, value);
    }

    // Sum is 100, but the >50 weight blocks the save until acknowledged.
    const save = screen.getByRole('button', { name: 'Create stance' });
    expect(save).toBeDisabled();

    await user.click(screen.getByLabelText(/acknowledge this extreme weighting/i));
    expect(save).toBeDisabled(); // still needs a >=12 character justification

    await user.type(
      screen.getByLabelText(/Extreme weight justification/i),
      'Cash-only customer book'
    );
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() => {
      expect(mocks.runCommand).toHaveBeenCalledWith(
        'createCreditEngineStance',
        expect.objectContaining({
          name: 'Extreme stance',
          acknowledgeExtremeWeights: true,
          extremeWeightJustification: 'Cash-only customer book'
        }),
        'Create credit engine stance "Extreme stance"'
      );
    });
  });

  it('edits a stance with the stanceId and prefilled weights', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: 'Edit stance Aggressive' }));

    const nameInput = screen.getByLabelText('Stance name');
    expect(nameInput).toHaveValue('Aggressive');
    await user.clear(nameInput);
    await user.type(nameInput, 'Aggressive v2');
    await user.click(screen.getByRole('button', { name: 'Save stance' }));

    await waitFor(() => {
      expect(mocks.runCommand).toHaveBeenCalledWith(
        'updateCreditEngineStance',
        {
          stanceId: 'stance-custom',
          name: 'Aggressive v2',
          description: null,
          weights: { revenueMomentum: 40, cashCollection: 30, profitability: 10, debtAging: 10, repaymentVelocity: 5, tenureDepth: 5 }
        },
        'Update credit engine stance "Aggressive v2"'
      );
    });
  });

  it('blocks deleting the global default stance and in-use stances', () => {
    renderView();
    expect(screen.getByRole('button', { name: 'Delete stance Balanced' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete stance Sticky' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete stance Aggressive' })).toBeEnabled();
  });

  it('deletes an unused stance after a danger-tone confirmation', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: 'Delete stance Aggressive' }));

    await waitFor(() => {
      expect(mocks.confirm).toHaveBeenCalledWith(
        expect.objectContaining({ tone: 'danger', title: 'Delete stance "Aggressive"?' })
      );
      expect(mocks.runCommand).toHaveBeenCalledWith(
        'deleteCreditEngineStance',
        { stanceId: 'stance-custom' },
        'Delete credit engine stance "Aggressive"'
      );
    });
  });

  it('does not delete when the confirmation is cancelled', async () => {
    mocks.confirm.mockResolvedValue(false);
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: 'Delete stance Aggressive' }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    expect(mocks.runCommand).not.toHaveBeenCalled();
  });
});

describe('UX-Q05 — per-customer overrides', () => {
  it('submits setCustomerStance with the picked customer and stance', async () => {
    const user = userEvent.setup();
    renderView();
    await user.selectOptions(screen.getByLabelText('Override customer'), 'cust-1');
    await user.selectOptions(screen.getByLabelText('Override stance'), 'stance-custom');
    await user.click(screen.getByRole('button', { name: 'Set stance' }));
    await waitFor(() => {
      expect(mocks.runCommand).toHaveBeenCalledWith(
        'setCustomerStance',
        { customerId: 'cust-1', stanceId: 'stance-custom' },
        'Pin Acme Dispensary to a specific credit stance'
      );
    });
  });

  it('submits a null stanceId when "Engine default" is selected', async () => {
    const user = userEvent.setup();
    renderView();
    await user.selectOptions(screen.getByLabelText('Override customer'), 'cust-2');
    // 'Engine default' is the initial selection (empty value).
    await user.click(screen.getByRole('button', { name: 'Set stance' }));
    await waitFor(() => {
      expect(mocks.runCommand).toHaveBeenCalledWith(
        'setCustomerStance',
        { customerId: 'cust-2', stanceId: null },
        'Revert Blue Sky Collective to the engine default stance'
      );
    });
  });

  it('keeps "Set stance" disabled until a customer is picked', () => {
    renderView();
    expect(screen.getByRole('button', { name: 'Set stance' })).toBeDisabled();
  });

  it('requires a customer and a >=4 character reason before disabling the engine', async () => {
    const user = userEvent.setup();
    renderView();
    const disableButton = screen.getByRole('button', { name: 'Disable engine for customer' });
    expect(disableButton).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Override customer'), 'cust-1');
    await user.type(screen.getByLabelText('Disable reason'), 'abc');
    expect(disableButton).toBeDisabled();

    await user.type(screen.getByLabelText('Disable reason'), ' late payments');
    expect(disableButton).toBeEnabled();
    await user.click(disableButton);

    await waitFor(() => {
      expect(mocks.runCommand).toHaveBeenCalledWith(
        'disableCreditEngineForCustomer',
        { customerId: 'cust-1', reason: 'abc late payments' },
        'Disable credit engine for Acme Dispensary'
      );
    });
  });
});

describe('UX-Q05 — bulk revert typed confirmation', () => {
  it('keeps the danger button disabled until the exact phrase is typed', async () => {
    const user = userEvent.setup();
    renderView();
    const button = screen.getByRole('button', { name: 'Bulk revert customers to engine' });
    expect(button).toBeDisabled();

    const input = screen.getByLabelText('Bulk revert confirmation');
    await user.type(input, 'revert to engine');
    expect(button).toBeDisabled();

    await user.clear(input);
    await user.type(input, 'REVERT TO ENGINE');
    expect(button).toBeEnabled();
  });

  it('submits bulkRevertCustomersToEngine with the explicit rollout payload and clears the input', async () => {
    const user = userEvent.setup();
    renderView();
    const input = screen.getByLabelText('Bulk revert confirmation');
    await user.type(input, 'REVERT TO ENGINE');
    await user.click(screen.getByRole('button', { name: 'Bulk revert customers to engine' }));

    await waitFor(() => {
      expect(mocks.runCommand).toHaveBeenCalledWith(
        'bulkRevertCustomersToEngine',
        { filter: { skipEngineDisabled: true }, flipShadowMode: true },
        'Bulk revert all manual credit overrides to the engine'
      );
    });
    await waitFor(() => expect(input).toHaveValue(''));
    expect(screen.getByRole('button', { name: 'Bulk revert customers to engine' })).toBeDisabled();
  });
});
