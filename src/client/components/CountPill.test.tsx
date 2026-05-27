// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CountPill } from './CountPill';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockSetGridFilter = vi.fn();
vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (state: { setGridFilter: typeof mockSetGridFilter }) => unknown) =>
    selector({ setGridFilter: mockSetGridFilter }),
}));

function renderPill(props: Parameters<typeof CountPill>[0]) {
  return render(
    <MemoryRouter>
      <CountPill {...props} />
    </MemoryRouter>
  );
}

describe('CountPill (TER-1624)', () => {
  it('renders the count', () => {
    renderPill({ count: 7, route: '/intake' });
    expect(screen.getByRole('button')).toHaveTextContent('7');
  });

  it('renders when count is 0', () => {
    renderPill({ count: 0, route: '/intake' });
    const btn = screen.getByRole('button');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('0');
  });

  it('calls navigate with the route on click', () => {
    renderPill({ count: 3, route: '/intake' });
    fireEvent.click(screen.getByRole('button'));
    expect(mockNavigate).toHaveBeenCalledWith('/intake');
  });

  it('calls setGridFilter with filterView and filterValue on click', () => {
    renderPill({
      count: 5,
      route: '/intake',
      filterView: 'intake',
      filterValue: 'status:ready',
    });
    fireEvent.click(screen.getByRole('button'));
    expect(mockSetGridFilter).toHaveBeenCalledWith('intake', 'status:ready');
    expect(mockNavigate).toHaveBeenCalledWith('/intake');
  });

  it('does NOT call setGridFilter when filterView is omitted', () => {
    mockSetGridFilter.mockClear();
    renderPill({ count: 2, route: '/sales' });
    fireEvent.click(screen.getByRole('button'));
    expect(mockSetGridFilter).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/sales');
  });

  it('does NOT call setGridFilter when filterValue is omitted', () => {
    mockSetGridFilter.mockClear();
    renderPill({ count: 2, route: '/sales', filterView: 'sales' });
    fireEvent.click(screen.getByRole('button'));
    expect(mockSetGridFilter).not.toHaveBeenCalled();
  });

  it('uses the provided accessible label', () => {
    renderPill({ count: 4, route: '/photography', label: '4 items needing media' });
    expect(screen.getByRole('button', { name: /4 items needing media/i })).toBeInTheDocument();
  });

  it('uses a default accessible label when none is provided', () => {
    renderPill({ count: 4, route: '/photography' });
    expect(screen.getByLabelText(/4 items — click to view/i)).toBeInTheDocument();
  });

  it('applies the selection-pill class', () => {
    renderPill({ count: 1, route: '/inventory' });
    expect(screen.getByRole('button').className).toMatch(/selection-pill/);
  });

  it('merges an extra className onto the button', () => {
    renderPill({ count: 1, route: '/inventory', className: 'warning' });
    expect(screen.getByRole('button').className).toMatch(/warning/);
  });
});
