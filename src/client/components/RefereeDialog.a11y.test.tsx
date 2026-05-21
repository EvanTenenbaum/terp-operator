// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn(), isRunning: false })
}));
vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null })
}));

import { RefereeDialog } from './RefereeDialog';

describe('RefereeDialog a11y (#34)', () => {
  it('exposes an accessible name via aria-labelledby pointing to the heading id', () => {
    render(<RefereeDialog refereeId="ref-1" initial={{}} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy, 'dialog must have aria-labelledby').toBeTruthy();
    const heading = document.getElementById(labelledBy!);
    expect(heading?.tagName).toBe('H2');
    expect(heading?.textContent).toMatch(/edit referee/i);
  });
});
