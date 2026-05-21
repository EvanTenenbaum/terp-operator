// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn(), isRunning: false })
}));
vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null })
}));

import { VoidRefereeCreditDialog } from './VoidRefereeCreditDialog';

describe('VoidRefereeCreditDialog a11y (#34)', () => {
  it('exposes an accessible name via aria-labelledby pointing to the heading id', () => {
    render(
      <VoidRefereeCreditDialog
        creditId="cr-1"
        transactionNo="TX-001"
        creditAmount={150}
        onClose={() => {}}
      />
    );
    const dialog = screen.getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy, 'dialog must have aria-labelledby').toBeTruthy();
    const heading = document.getElementById(labelledBy!);
    expect(heading?.tagName).toBe('H2');
    expect(heading?.textContent).toMatch(/void referee credit/i);
  });
});
