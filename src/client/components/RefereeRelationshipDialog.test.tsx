// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const runCommand = vi.fn().mockResolvedValue({ ok: true, toast: 'done' });
vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand, isRunning: false })
}));

const focusTrapRef = { current: null };
const useFocusTrapMock = vi.fn((_isOpen: boolean, _onClose?: () => void) => focusTrapRef);
vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: (isOpen: boolean, onClose?: () => void) => useFocusTrapMock(isOpen, onClose)
}));

const referenceQueryMock = vi.fn();
vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      reference: {
        useQuery: () => referenceQueryMock()
      }
    }
  }
}));

import { RefereeRelationshipDialog } from './RefereeRelationshipDialog';

const baseReference = {
  data: {
    customers: [
      { id: 'cust-1', name: 'Acme Co' },
      { id: 'cust-2', name: 'Beta Inc' }
    ],
    vendors: [
      { id: 'vend-1', name: 'Vendor One' }
    ]
  }
};

function renderDialog(props: Partial<React.ComponentProps<typeof RefereeRelationshipDialog>> = {}) {
  referenceQueryMock.mockReturnValue(baseReference);
  return render(
    <RefereeRelationshipDialog
      refereeId="ref-1"
      refereeName="Jane Doe"
      onClose={props.onClose ?? (() => {})}
      {...props}
    />
  );
}

describe('RefereeRelationshipDialog', () => {
  beforeEach(() => {
    runCommand.mockClear();
    useFocusTrapMock.mockClear();
    referenceQueryMock.mockReset();
    window.alert = vi.fn();
  });

  it('renders Cancel and Create buttons (FormDialog footer contract)', () => {
    // Chrome converged into templates/FormDialog (2026-06 unified template layer).
    // Per templates.md testing doctrine, view tests assert behavior, not template
    // chrome — so this asserts the buttons exist and submit gating, not classes.
    renderDialog();
    const cancel = screen.getByRole('button', { name: /cancel/i });
    const create = screen.getByRole('button', { name: /create relationship/i });
    expect(cancel).toBeInTheDocument();
    expect(create).toBeInTheDocument();
    expect(create).toBeDisabled(); // no entity selected yet
  });

  it('wires useFocusTrap on the dialog content div', () => {
    renderDialog();
    expect(useFocusTrapMock).toHaveBeenCalled();
    const firstCallArgs = useFocusTrapMock.mock.calls[0]!;
    expect(firstCallArgs[0]).toBe(true);
    expect(typeof firstCallArgs[1]).toBe('function');
  });

  it('shows inline error when no entity is selected and does not call alert', async () => {
    const user = userEvent.setup();
    renderDialog();
    const create = screen.getByRole('button', { name: /create relationship/i });
    await user.click(create);
    expect(screen.getByText(/please select a customer/i)).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('shows inline error for percentage = 0', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.selectOptions(screen.getByLabelText(/^customer$/i), 'cust-1');
    const pct = screen.getByLabelText(/percentage/i);
    await user.clear(pct);
    await user.type(pct, '0');
    await user.click(screen.getByRole('button', { name: /create relationship/i }));
    expect(screen.getByText(/percentage must be between 0 and 100/i)).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('shows inline error for percentage > 100', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.selectOptions(screen.getByLabelText(/^customer$/i), 'cust-1');
    const pct = screen.getByLabelText(/percentage/i);
    await user.clear(pct);
    await user.type(pct, '150');
    await user.click(screen.getByRole('button', { name: /create relationship/i }));
    expect(screen.getByText(/percentage must be between 0 and 100/i)).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('shows inline error when fixed amount = 0', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.selectOptions(screen.getByLabelText(/^customer$/i), 'cust-1');
    await user.selectOptions(screen.getByLabelText(/fee structure/i), 'fixed');
    const amt = screen.getByLabelText(/fixed amount/i);
    await user.clear(amt);
    await user.type(amt, '0');
    await user.click(screen.getByRole('button', { name: /create relationship/i }));
    expect(screen.getByText(/fixed amount must be greater than 0/i)).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('disables the submit button when validation fails (no entity selected)', () => {
    renderDialog();
    const create = screen.getByRole('button', { name: /create relationship/i });
    expect(create).toBeDisabled();
  });

  it('enables submit and dispatches runCommand on a valid percentage submission', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog({ onClose });
    await user.selectOptions(screen.getByLabelText(/^customer$/i), 'cust-1');
    const create = screen.getByRole('button', { name: /create relationship/i });
    expect(create).not.toBeDisabled();
    await user.click(create);
    expect(runCommand).toHaveBeenCalledWith(
      'addRefereeRelationship',
      expect.objectContaining({
        refereeId: 'ref-1',
        entityType: 'customer',
        entityId: 'cust-1',
        feeType: 'percentage',
        feePercentage: 5
      }),
      expect.any(String)
    );
    expect(window.alert).not.toHaveBeenCalled();
  });
});
