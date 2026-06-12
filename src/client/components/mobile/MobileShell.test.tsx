// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Stub out LoginView so it doesn't try to render trpc mutations
vi.mock('../../views/LoginView', () => ({
  LoginView: () => <div data-testid="login-view">Login View</div>,
}));

// Mock trpc — only auth.me.useQuery is needed for MobileShell itself
vi.mock('../../api/trpc', () => {
  const meUseQuery = vi.fn();
  return {
    trpc: {
      auth: {
        me: {
          useQuery: meUseQuery,
        },
      },
    },
  };
});

import { trpc } from '../../api/trpc';
import { MobileShell } from './MobileShell';

const mockMe = trpc.auth.me.useQuery as ReturnType<typeof vi.fn>;

function Wrapper({ initialPath = '/mobile/dashboard' }: { initialPath?: string }) {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/mobile/*" element={<MobileShell />}>
          <Route path="dashboard" element={<div>Dashboard content</div>} />
        </Route>
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('MobileShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows login view when user is not authenticated', () => {
    mockMe.mockReturnValue({ data: null, isLoading: false });
    render(<Wrapper />);
    // LoginView is shown instead of the mobile shell
    expect(screen.getByTestId('login-view')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /main mobile navigation/i })).not.toBeInTheDocument();
  });

  it('renders shell with bottom nav when authenticated', () => {
    mockMe.mockReturnValue({ data: { id: '1', name: 'Evan', role: 'owner' }, isLoading: false });
    render(<Wrapper />);
    expect(screen.getByRole('navigation', { name: /main mobile navigation/i })).toBeInTheDocument();
  });

  it('renders child route content when authenticated', () => {
    mockMe.mockReturnValue({ data: { id: '1', name: 'Evan', role: 'owner' }, isLoading: false });
    render(<Wrapper />);
    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
  });

  it('shows all 7 nav tabs (original 5 + Pick/Intake per UX-L01/R01/R02)', () => {
    mockMe.mockReturnValue({ data: { id: '1', name: 'Evan', role: 'owner' }, isLoading: false });
    render(<Wrapper />);
    const nav = screen.getByRole('navigation', { name: /main mobile navigation/i });
    const labels = Array.from(nav.querySelectorAll('a')).map((a) => a.textContent);
    expect(labels).toEqual(['Dashboard', 'Inventory', 'Catalog', 'Payments', 'Contacts', 'Pick', 'Intake']);
  });

  it('shows loading state when query is loading', () => {
    mockMe.mockReturnValue({ data: undefined, isLoading: true });
    render(<Wrapper />);
    expect(screen.queryByRole('navigation', { name: /main mobile navigation/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('login-view')).not.toBeInTheDocument();
  });
});
