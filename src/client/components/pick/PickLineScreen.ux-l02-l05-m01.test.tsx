// @vitest-environment jsdom
/**
 * UX-L02: weight-discrepancy capture — when actual qty differs from expected
 *   beyond 5% tolerance, prompt for a discrepancy note. Never block packing.
 * UX-L05: Enter key on weight input confirms pack (one-hand scale workflow).
 * UX-M01: row-origin recovery affordance on PickLineScreen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type React from 'react';

// --- react-router-dom mock ---
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// --- uiStore mock ---
const mockSetGridFilter = vi.fn();
const mockPushToast = vi.fn();
vi.mock('../../store/uiStore', () => ({
  useUiStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const store: Record<string, unknown> = {
      setGridFilter: mockSetGridFilter,
      pushToast: mockPushToast,
    };
    return selector(store);
  },
}));

// --- useCommandRunner mock ---
const mockRunCommand = vi.fn().mockResolvedValue({ ok: true });
vi.mock('../useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: mockRunCommand, isRunning: false }),
}));

// --- useFocusTrap mock ---
vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

import { PickLineScreen } from './PickLineScreen';

const BASE_LINE = {
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
};

beforeEach(() => {
  mockNavigate.mockReset();
  mockSetGridFilter.mockReset();
  mockPushToast.mockReset();
  mockRunCommand.mockReset();
  mockRunCommand.mockResolvedValue({ ok: true });
});

function renderScreen(lineOverride: Partial<typeof BASE_LINE> = {}) {
  return render(
    <PickLineScreen
      line={{ ...BASE_LINE, ...lineOverride }}
      pickNo="PICK-001"
      customer="Green Leaf Farm"
      interrupt={null}
      recalled={false}
      recalledItemName=""
      onBack={vi.fn()}
      onPicked={vi.fn()}
    />
  );
}

// ─── UX-M01 ──────────────────────────────────────────────────────────────────
describe('UX-M01 — PickLineScreen: recovery affordance', () => {
  it('renders the recovery link button', () => {
    renderScreen();
    const btn = screen.getByTestId('pick-line-recovery-link');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toMatch(/history|recovery/i);
  });

  it('clicking recovery link calls setGridFilter("recovery", lineId) and navigates', () => {
    renderScreen();
    const btn = screen.getByTestId('pick-line-recovery-link');
    fireEvent.click(btn);
    expect(mockSetGridFilter).toHaveBeenCalledWith('recovery', 'fl-uuid-001');
    expect(mockNavigate).toHaveBeenCalledWith('/recovery');
  });
});

// ─── UX-L05 ──────────────────────────────────────────────────────────────────
describe('UX-L05 — PickLineScreen: Enter on weight input confirms pack', () => {
  it('pressing Enter on weight input with valid weight calls runCommand', async () => {
    renderScreen();
    const weightInput = screen.getByLabelText(/actual weight/i);
    fireEvent.change(weightInput, { target: { value: '10' } });
    const qtyInput = screen.getByLabelText(/actual qty/i);
    fireEvent.change(qtyInput, { target: { value: '10' } });
    fireEvent.keyDown(weightInput, { key: 'Enter', code: 'Enter' });
    // Wait for async
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockRunCommand).toHaveBeenCalledWith(
      'recordWeighAndPack',
      expect.objectContaining({ fulfillmentLineId: 'fl-uuid-001', actualWeight: 10 }),
      expect.any(String)
    );
  });

  it('pressing Enter without weight shows validation error and does NOT call runCommand', () => {
    renderScreen();
    const weightInput = screen.getByLabelText(/actual weight/i);
    fireEvent.keyDown(weightInput, { key: 'Enter', code: 'Enter' });
    expect(mockRunCommand).not.toHaveBeenCalled();
    // Error message should be visible
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});

// ─── UX-L02 ──────────────────────────────────────────────────────────────────
describe('UX-L02 — PickLineScreen: discrepancy note prompt', () => {
  it('does NOT show discrepancy prompt when qty matches expected within 5%', async () => {
    renderScreen(); // expectedQty = 10
    const weightInput = screen.getByLabelText(/actual weight/i);
    const qtyInput = screen.getByLabelText(/actual qty/i);
    // 10 units — matches expected exactly
    fireEvent.change(qtyInput, { target: { value: '10' } });
    fireEvent.change(weightInput, { target: { value: '5' } });
    const packBtn = screen.getByRole('button', { name: /mark picked/i });
    fireEvent.click(packBtn);
    await new Promise(resolve => setTimeout(resolve, 0));
    // Should call runCommand directly without showing discrepancy note prompt
    expect(mockRunCommand).toHaveBeenCalledWith(
      'recordWeighAndPack',
      expect.objectContaining({ fulfillmentLineId: 'fl-uuid-001' }),
      expect.any(String)
    );
    expect(screen.queryByLabelText(/discrepancy note/i)).toBeNull();
  });

  it('shows discrepancy note prompt when qty is more than 5% below expected', async () => {
    renderScreen(); // expectedQty = 10
    const weightInput = screen.getByLabelText(/actual weight/i);
    const qtyInput = screen.getByLabelText(/actual qty/i);
    // 8 units = 20% below expected → should trigger discrepancy prompt
    fireEvent.change(qtyInput, { target: { value: '8' } });
    fireEvent.change(weightInput, { target: { value: '4' } });
    const packBtn = screen.getByRole('button', { name: /mark picked/i });
    fireEvent.click(packBtn);
    await new Promise(resolve => setTimeout(resolve, 0));
    // Should NOT have called runCommand yet — discrepancy prompt shown
    expect(mockRunCommand).not.toHaveBeenCalledWith('recordWeighAndPack', expect.anything(), expect.anything());
    // Discrepancy note input should appear
    expect(screen.getByLabelText(/discrepancy note/i)).toBeTruthy();
  });

  it('can pack with discrepancy note — calls recordWeighAndPack and pushToast with note', async () => {
    renderScreen(); // expectedQty = 10
    const weightInput = screen.getByLabelText(/actual weight/i);
    const qtyInput = screen.getByLabelText(/actual qty/i);
    // 7 units = 30% below expected → triggers prompt
    fireEvent.change(qtyInput, { target: { value: '7' } });
    fireEvent.change(weightInput, { target: { value: '3.5' } });
    fireEvent.click(screen.getByRole('button', { name: /mark picked/i }));
    await new Promise(resolve => setTimeout(resolve, 0));

    // Now the discrepancy prompt is visible
    const noteInput = screen.getByLabelText(/discrepancy note/i);
    fireEvent.change(noteInput, { target: { value: 'Damaged in transit' } });
    const packWithNoteBtn = screen.getByRole('button', { name: /pack with note/i });
    fireEvent.click(packWithNoteBtn);
    await new Promise(resolve => setTimeout(resolve, 0));

    // recordWeighAndPack should have been called
    expect(mockRunCommand).toHaveBeenCalledWith(
      'recordWeighAndPack',
      expect.objectContaining({ fulfillmentLineId: 'fl-uuid-001' }),
      expect.any(String)
    );
    // discrepancy note should be surfaced via pushToast
    expect(mockPushToast).toHaveBeenCalledWith(
      expect.stringContaining('Damaged in transit'),
      'info'
    );
  });

  it('can pack anyway without note — never blocks packing', async () => {
    renderScreen(); // expectedQty = 10
    const weightInput = screen.getByLabelText(/actual weight/i);
    const qtyInput = screen.getByLabelText(/actual qty/i);
    // 6 units = 40% below expected → triggers prompt
    fireEvent.change(qtyInput, { target: { value: '6' } });
    fireEvent.change(weightInput, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /mark picked/i }));
    await new Promise(resolve => setTimeout(resolve, 0));

    // Discrepancy prompt visible — click "Pack anyway"
    const packAnywayBtn = screen.getByRole('button', { name: /pack anyway/i });
    fireEvent.click(packAnywayBtn);
    await new Promise(resolve => setTimeout(resolve, 0));

    // recordWeighAndPack should have been called
    expect(mockRunCommand).toHaveBeenCalledWith(
      'recordWeighAndPack',
      expect.objectContaining({ fulfillmentLineId: 'fl-uuid-001' }),
      expect.any(String)
    );
  });
});
