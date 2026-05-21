// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn(), isRunning: false })
}));
vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null })
}));
vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      reference: { useQuery: () => ({ data: { customers: [], vendors: [] } }) }
    }
  }
}));

import { RefereeRelationshipDialog } from './RefereeRelationshipDialog';

describe('RefereeRelationshipDialog a11y (#34)', () => {
  it('exposes an accessible name via aria-labelledby pointing to the heading id', () => {
    render(
      <RefereeRelationshipDialog refereeId="ref-1" refereeName="Jane Doe" onClose={() => {}} />
    );
    const dialog = screen.getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy, 'dialog must have aria-labelledby').toBeTruthy();
    const heading = document.getElementById(labelledBy!);
    expect(heading?.tagName).toBe('H2');
    expect(heading?.textContent).toMatch(/add referee relationship/i);
  });
});
