// @vitest-environment jsdom
/**
 * UX-Q07: "View dispute" half of the Issue tab.
 * When a row has openDisputeId, the Issue tab shows an "Open dispute" badge
 * and a "View dispute" link that navigates to /disputes filtered to the dispute.
 * When openDisputeId is absent, only the "Open dispute" action form is shown.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const runCommand = vi.fn().mockResolvedValue({ ok: true, toast: 'done' });
vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand, isRunning: false })
}));

const setActiveView = vi.fn();
const setGridFilter = vi.fn();
vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (s: { setActiveView: typeof setActiveView; setGridFilter: typeof setGridFilter }) => unknown) =>
    selector({ setActiveView, setGridFilter }),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

import { IssueActionsBody } from './IssueSidecar';

const ROW_WITH_DISPUTE = {
  id: 'order-1',
  orderNo: 'ORD-001',
  invoiceId: 'inv-1',
  invoiceNo: 'INV-001',
  openDisputeId: 'disp-42',
};

const ROW_NO_DISPUTE = {
  id: 'order-2',
  orderNo: 'ORD-002',
  invoiceId: 'inv-2',
  invoiceNo: 'INV-002',
  // openDisputeId absent
};

function renderBody(row: Record<string, unknown>, view = 'orders') {
  return render(
    <MemoryRouter>
      <IssueActionsBody
        row={row as Parameters<typeof IssueActionsBody>[0]['row']}
        view={view as Parameters<typeof IssueActionsBody>[0]['view']}
        onDone={() => {}}
      />
    </MemoryRouter>
  );
}

describe('IssueActionsBody — UX-Q07 "View dispute" link', () => {
  beforeEach(() => {
    runCommand.mockClear();
    setActiveView.mockClear();
    setGridFilter.mockClear();
    navigateMock.mockClear();
  });

  it('shows "Open dispute" badge and "View dispute" link when openDisputeId is set', () => {
    renderBody(ROW_WITH_DISPUTE);
    expect(screen.getByText('Open dispute')).toBeInTheDocument();
    expect(screen.getByTestId('view-dispute-link')).toBeInTheDocument();
    expect(screen.getByTestId('view-dispute-link')).toHaveTextContent('View dispute');
  });

  it('does NOT show "View dispute" link when openDisputeId is absent', () => {
    renderBody(ROW_NO_DISPUTE);
    expect(screen.queryByTestId('view-dispute-link')).not.toBeInTheDocument();
    expect(screen.queryByText('Open dispute')).not.toBeInTheDocument();
  });

  it('clicking "View dispute" sets grid filter, navigates to /disputes, and calls onDone', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(
      <MemoryRouter>
        <IssueActionsBody
          row={ROW_WITH_DISPUTE as Parameters<typeof IssueActionsBody>[0]['row']}
          view="orders"
          onDone={onDone}
        />
      </MemoryRouter>
    );
    await user.click(screen.getByTestId('view-dispute-link'));
    expect(setGridFilter).toHaveBeenCalledWith('disputes', 'id:disp-42');
    expect(setActiveView).toHaveBeenCalledWith('disputes');
    expect(navigateMock).toHaveBeenCalledWith('/disputes');
    expect(onDone).toHaveBeenCalled();
  });

  it('still shows the dispute action form (Open dispute option) regardless of openDisputeId', () => {
    renderBody(ROW_WITH_DISPUTE);
    // The Dispute option should exist in the action selector
    const actionSelect = screen.getByRole('combobox');
    const disputeOption = Array.from(actionSelect.querySelectorAll('option')).find(
      (o) => o.textContent === 'Dispute'
    );
    expect(disputeOption).toBeTruthy();
  });
});

describe('IssueActionsBody — "Open dispute" action form (existing behavior preserved)', () => {
  beforeEach(() => { runCommand.mockClear(); });

  it('Dispute action is disabled when invoiceId is absent', () => {
    renderBody({ id: 'pay-1', customer: 'Alice' }, 'payments');
    const actionSelect = screen.getByRole('combobox');
    const disputeOption = Array.from(actionSelect.querySelectorAll('option')).find(
      (o) => o.textContent === 'Dispute'
    ) as HTMLOptionElement | undefined;
    expect(disputeOption?.disabled).toBe(true);
  });

  it('Dispute action is enabled when invoiceId is present', () => {
    renderBody(ROW_NO_DISPUTE);
    const actionSelect = screen.getByRole('combobox');
    const disputeOption = Array.from(actionSelect.querySelectorAll('option')).find(
      (o) => o.textContent === 'Dispute'
    ) as HTMLOptionElement | undefined;
    expect(disputeOption?.disabled).toBe(false);
  });
});
