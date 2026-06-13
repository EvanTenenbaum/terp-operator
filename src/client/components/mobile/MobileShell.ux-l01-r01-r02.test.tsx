// @vitest-environment jsdom
/**
 * UX-L01/R01 — MobileShell: Pick tab is present in the bottom nav.
 * UX-R02 — MobileShell: Intake tab is present in the bottom nav.
 *
 * The existing 5 tabs (dashboard/inventory/catalog/payments/contacts)
 * were replaced with 5 tabs that include pick + intake (removed catalog/contacts
 * to keep count = 5). Verify both new tabs are present.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../api/trpc', () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ data: { name: 'Test', role: 'operator' }, isLoading: false }) } },
  },
}));
vi.mock('../../views/LoginView', () => ({ LoginView: () => null }));
vi.mock('./MobileToast', () => ({
  MobileToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { MobileShell } from './MobileShell';
import type React from 'react';

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/mobile/dashboard']}>
      <MobileShell />
    </MemoryRouter>
  );
}

describe('MobileShell — UX-L01/R01 + UX-R02 nav tabs', () => {
  it('renders a Pick tab in the bottom navigation', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: /main mobile navigation/i });
    expect(nav).toBeTruthy();
    // Pick tab should be present as an accessible link
    const pickLink = screen.getByRole('link', { name: /pick/i });
    expect(pickLink).toBeTruthy();
    expect(pickLink.getAttribute('href')).toContain('/mobile/pick');
  });

  it('renders an Intake tab in the bottom navigation', () => {
    renderShell();
    const intakeLink = screen.getByRole('link', { name: /intake/i });
    expect(intakeLink).toBeTruthy();
    expect(intakeLink.getAttribute('href')).toContain('/mobile/intake');
  });

  it('renders dashboard tab', () => {
    renderShell();
    const dashLink = screen.getByRole('link', { name: /dashboard/i });
    expect(dashLink).toBeTruthy();
  });

  it('renders payments tab', () => {
    renderShell();
    const paymentsLink = screen.getByRole('link', { name: /payments/i });
    expect(paymentsLink).toBeTruthy();
  });
});
