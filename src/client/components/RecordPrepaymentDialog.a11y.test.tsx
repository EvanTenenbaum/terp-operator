// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn(), isRunning: false })
}));
vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null })
}));

import { RecordPrepaymentDialog } from './RecordPrepaymentDialog';

describe('RecordPrepaymentDialog a11y (#34)', () => {
  it('exposes an accessible name via aria-labelledby pointing to the heading id', () => {
    render(
      <RecordPrepaymentDialog
        purchaseOrderId="po-1"
        poNo="PO-001"
        maxAmount={500}
        onClose={() => {}}
      />
    );
    const dialog = screen.getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy, 'dialog must have aria-labelledby').toBeTruthy();
    const heading = document.getElementById(labelledBy!);
    expect(heading?.tagName).toBe('H2');
    expect(heading?.textContent).toMatch(/record prepayment/i);
  });
});
