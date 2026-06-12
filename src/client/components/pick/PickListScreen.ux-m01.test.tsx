// @vitest-environment jsdom
/**
 * UX-M01 — PickListScreen: row-origin recovery affordance.
 * A "History" button in the pick list header deep-links to Recovery prefiltered
 * to the pick list's id — consistent with the IntakeView half (another agent ships).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type React from 'react';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockSetGridFilter = vi.fn();
vi.mock('../../store/uiStore', () => ({
  useUiStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const store: Record<string, unknown> = { setGridFilter: mockSetGridFilter };
    return selector(store);
  },
}));

import { PickListScreen } from './PickListScreen';

const PICK_LIST = {
  pickListId: 'pl-uuid-001',
  pickNo: 'PICK-001',
  customer: 'Green Leaf Farm',
  lines: [
    {
      id: 'fl-uuid-001',
      pickListId: 'pl-uuid-001',
      orderId: 'order-uuid-001',
      itemName: 'Green Leaf OZ',
      batchCode: 'GL-001',
      expectedQty: 10,
      actualQty: undefined,
      actualWeight: undefined,
      bagCode: undefined,
      status: 'pending' as const,
      alertCount: 0,
    },
  ],
};

beforeEach(() => {
  mockNavigate.mockReset();
  mockSetGridFilter.mockReset();
});

function renderScreen() {
  return render(
    <PickListScreen
      pickList={PICK_LIST}
      loading={false}
      onBack={vi.fn()}
      onSelectLine={vi.fn()}
    />
  );
}

describe('UX-M01 — PickListScreen: recovery affordance', () => {
  it('renders a History / Recovery button in the header', () => {
    renderScreen();
    const btn = screen.getByTestId('pick-list-recovery-link');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toMatch(/history/i);
  });

  it('clicking History button calls setGridFilter("recovery", pickListId) and navigates', () => {
    renderScreen();
    const btn = screen.getByTestId('pick-list-recovery-link');
    fireEvent.click(btn);
    expect(mockSetGridFilter).toHaveBeenCalledWith('recovery', 'pl-uuid-001');
    expect(mockNavigate).toHaveBeenCalledWith('/recovery');
  });

  it('does NOT render the History button when no pick list is loaded', () => {
    render(
      <PickListScreen
        pickList={null}
        loading={false}
        onBack={vi.fn()}
        onSelectLine={vi.fn()}
      />
    );
    expect(screen.queryByTestId('pick-list-recovery-link')).toBeNull();
  });
});
